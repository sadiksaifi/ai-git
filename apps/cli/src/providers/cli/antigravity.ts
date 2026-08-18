import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { CLIProviderAdapter, InvokeOptions, APIModelDefinition } from "../types.ts";
import { readProcessOutput } from "./dynamic.ts";

const MINIMUM_ANTIGRAVITY_VERSION = [1, 1, 13] as const;
const ISOLATED_PROFILE_PREFIX = "ai-git-antigravity-";
const DENY_REASON = "AI Git disables all Antigravity tools.";
const ANTIGRAVITY_PREFLIGHT_TIMEOUT_MS = 30_000;
const ANTIGRAVITY_GENERATION_TIMEOUT_MS = 130_000;

interface AntigravityEnvelope {
  status?: string;
  error?: string | null;
  response?: string;
  command?: {
    data?: {
      models?: Array<{ id?: unknown; label?: unknown }>;
      config?: {
        enableTerminalSandbox?: boolean;
        permissions?: { deny?: string[] };
      };
    };
  };
}

interface IsolatedRuntime {
  root: string;
  workspace: string;
}

interface PathOperations {
  basename(path: string): string;
  dirname(path: string): string;
}

interface IsolatedRuntimeDependencies {
  makeTemporaryDirectory(prefix: string): Promise<string>;
  seedAuthentication(profileRoot: string): Promise<void>;
}

interface KillablePipedProcess {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill(): void;
}

interface ModelRank {
  model: APIModelDefinition;
  originalIndex: number;
  familyRank: number;
  version: number[];
  effortRank: number;
}

const EFFORT_RANK = new Map([
  ["low", 0],
  ["medium", 1],
  ["high", 2],
]);

function parseVersion(value: string): number[] | null {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function isSupportedVersion(version: number[]): boolean {
  for (let index = 0; index < MINIMUM_ANTIGRAVITY_VERSION.length; index += 1) {
    const difference = (version[index] ?? 0) - MINIMUM_ANTIGRAVITY_VERSION[index]!;
    if (difference !== 0) return difference > 0;
  }
  return true;
}

function compareVersionDescending(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function modelRank(model: APIModelDefinition, originalIndex: number): ModelRank {
  const gemini = model.id.match(/^gemini-(\d+(?:\.\d+)+)-(flash|pro)(?:-(low|medium|high))?$/i);
  if (gemini?.[1] && gemini[2]) {
    return {
      model,
      originalIndex,
      familyRank: gemini[2].toLowerCase() === "flash" ? 0 : 1,
      version: gemini[1].split(".").map(Number),
      effortRank: EFFORT_RANK.get(gemini[3]?.toLowerCase() ?? "") ?? 99,
    };
  }

  const lowerId = model.id.toLowerCase();
  return {
    model,
    originalIndex,
    familyRank: lowerId.startsWith("claude-sonnet-")
      ? 2
      : lowerId.startsWith("claude-opus-")
        ? 3
        : 4,
    version: [],
    effortRank: 0,
  };
}

function rankModels(models: APIModelDefinition[]): APIModelDefinition[] {
  const ranked = models
    .map(modelRank)
    .sort((left, right) => {
      const family = left.familyRank - right.familyRank;
      if (family !== 0) return family;
      if (left.familyRank <= 1) {
        const version = compareVersionDescending(left.version, right.version);
        if (version !== 0) return version;
        const effort = left.effortRank - right.effortRank;
        if (effort !== 0) return effort;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.model);

  const recommendationPatterns = [
    /^gemini-\d+(?:\.\d+)+-flash-low$/i,
    /^gemini-\d+(?:\.\d+)+-flash-medium$/i,
    /^gemini-\d+(?:\.\d+)+-flash-high$/i,
    /^gemini-\d+(?:\.\d+)+-pro-low$/i,
  ];
  const recommendedId =
    recommendationPatterns
      .map((pattern) => ranked.find((model) => pattern.test(model.id))?.id)
      .find(Boolean) ?? ranked[0]?.id;

  return ranked.map((model) => ({
    ...model,
    isRecommended: model.id === recommendedId || undefined,
  }));
}

const LEGACY_FLASH_MODELS = new Set([
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
]);
const LEGACY_PRO_MODELS = new Set([
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-pro",
]);

export function selectAntigravityMigrationModel(
  legacyModel: string,
  models: APIModelDefinition[],
): string | null {
  const family = LEGACY_FLASH_MODELS.has(legacyModel)
    ? "flash"
    : LEGACY_PRO_MODELS.has(legacyModel)
      ? "pro"
      : null;
  if (!family) return null;

  const ranked = rankModels(models);
  return (
    ranked.find((model) =>
      new RegExp(`^gemini-\\d+(?:\\.\\d+)+-${family}-low$`, "i").test(model.id),
    )?.id ??
    ranked.find((model) => model.isRecommended)?.id ??
    null
  );
}

async function assertSupportedVersion(): Promise<void> {
  const process = Bun.spawn(["agy", "--version"], { stdout: "pipe", stderr: "pipe" });
  const { stdout, stderr, exitCode } = await readAntigravityProcessOutput(process);
  const version = parseVersion(stdout || stderr);

  if (exitCode !== 0 || !version || !isSupportedVersion(version)) {
    throw new Error("Antigravity CLI 1.1.13 or newer is required. Run `agy update` and try again.");
  }
}

export async function readAntigravityProcessOutput(
  process: KillablePipedProcess,
  timeoutMs: number = ANTIGRAVITY_PREFLIGHT_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let timeout: Timer | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      process.kill();
      reject(new Error(`Antigravity CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([readProcessOutput(process), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function denyHookCommand(): string {
  const output = JSON.stringify({ decision: "deny", reason: DENY_REASON });
  if (process.platform === "win32") {
    const escaped = output.replace(/'/g, "''");
    return `powershell -NoProfile -NonInteractive -Command "$input | Out-Null; [Console]::Out.Write('${escaped}')"`;
  }
  return `printf '%s\\n' '${output.replace(/'/g, `'\\''`)}'`;
}

export async function seedAntigravityAuthentication(
  profileRoot: string,
  homeRoot: string = process.env.HOME || homedir(),
): Promise<void> {
  if (process.platform === "win32") return;

  const geminiRoot = join(homeRoot, ".gemini");
  const candidates = ["antigravity-cli/antigravity-oauth-token", "google_accounts.json"];

  for (const relativePath of candidates) {
    const source = join(geminiRoot, relativePath);
    try {
      const sourceStat = await lstat(source);
      if (!sourceStat.isFile() && !sourceStat.isSymbolicLink()) continue;
    } catch {
      continue;
    }

    const destination = join(profileRoot, relativePath);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await symlink(source, destination);
  }
}

export async function createIsolatedRuntime(
  system: string,
  dependencies: Partial<IsolatedRuntimeDependencies> = {},
): Promise<IsolatedRuntime> {
  const makeTemporaryDirectory =
    dependencies.makeTemporaryDirectory ?? ((prefix: string) => mkdtemp(prefix));
  const seedAuthentication = dependencies.seedAuthentication ?? seedAntigravityAuthentication;
  const root = await makeTemporaryDirectory(join(tmpdir(), ISOLATED_PROFILE_PREFIX));

  try {
    await chmod(root, 0o700);

    const workspace = join(root, "workspace");
    const cliConfigDir = join(root, "antigravity-cli");
    const sharedConfigDir = join(root, "config");
    const agentDir = join(sharedConfigDir, "agents", "ai-git");
    await Promise.all([
      mkdir(workspace, { recursive: true, mode: 0o700 }),
      mkdir(cliConfigDir, { recursive: true, mode: 0o700 }),
      mkdir(agentDir, { recursive: true, mode: 0o700 }),
    ]);
    await seedAuthentication(root);

    const settings = {
      allowNonWorkspaceAccess: false,
      disableSlashCommands: true,
      enableTelemetry: false,
      enableTerminalSandbox: true,
      ...(process.env.GEMINI_API_KEY ? { modelProvider: "gemini" } : {}),
      notifications: false,
      toolPermission: "strict",
      permissions: {
        deny: [
          "read_file(*)",
          "write_file(*)",
          "read_url(*)",
          "execute_url(*)",
          "command(*)",
          "mcp(*)",
        ],
      },
    };
    const hooks = {
      "ai-git-deny-all": {
        PreToolUse: [
          {
            matcher: "*",
            hooks: [{ type: "command", command: denyHookCommand(), timeout: 5 }],
          },
        ],
      },
    };
    const agent = `---
name: ai-git
description: Generate an AI Git commit message without tools or delegation.
tools: []
mainAgent: true
subagent: false
inheritMcp: false
commandExecutionPolicy: off
mcpServers: []
skills: []
plugins: []
---

# System Prompt

${system}
`;

    await Promise.all([
      writeFile(join(cliConfigDir, "settings.json"), JSON.stringify(settings, null, 2), {
        mode: 0o600,
      }),
      writeFile(join(sharedConfigDir, "hooks.json"), JSON.stringify(hooks, null, 2), {
        mode: 0o600,
      }),
      writeFile(join(agentDir, "agent.md"), agent, { mode: 0o600 }),
    ]);

    return { root, workspace };
  } catch (error) {
    if (isOwnedIsolatedProfilePath(root)) {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

export function isOwnedIsolatedProfilePath(
  root: string,
  temporaryDirectory: string = tmpdir(),
  pathOperations: PathOperations = { basename, dirname },
): boolean {
  return (
    pathOperations.dirname(root) === temporaryDirectory &&
    pathOperations.basename(root).startsWith(ISOLATED_PROFILE_PREFIX)
  );
}

async function removeIsolatedRuntime(runtime: IsolatedRuntime): Promise<void> {
  if (!isOwnedIsolatedProfilePath(runtime.root)) {
    throw new Error("Refusing to remove an unexpected Antigravity profile path.");
  }
  await rm(runtime.root, { recursive: true, force: true });
}

async function assertIsolatedProfile(runtime: IsolatedRuntime, model: string): Promise<void> {
  const proc = Bun.spawn(
    ["agy", `--gemini_dir=${runtime.root}`, "--output-format", "json", "models"],
    {
      cwd: runtime.workspace,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: "1" },
    },
  );
  const { stdout, stderr, exitCode } = await readAntigravityProcessOutput(proc);
  let envelope: AntigravityEnvelope;
  try {
    envelope = JSON.parse(stdout) as AntigravityEnvelope;
  } catch {
    throw new Error(
      `Antigravity CLI does not support the required isolated profile contract: ${stderr.trim() || "invalid model-list response"}`,
    );
  }

  let logText = "";
  try {
    const logDir = join(runtime.root, "antigravity-cli", "log");
    const logFiles = (await readdir(logDir)).filter((file) => file.endsWith(".log")).sort();
    logText = await readFile(join(logDir, logFiles.at(-1) ?? ""), "utf8");
  } catch {
    // Missing isolated logs fail the contract check below.
  }

  let conversationFiles: string[] = [];
  try {
    conversationFiles = await readdir(join(runtime.root, "antigravity-cli", "conversations"));
  } catch {
    // A missing conversation directory is the expected read-only probe result.
  }

  const expectedAppData = `CLI app data directory: ${join(runtime.root, "antigravity-cli")}`;
  const expectedPermissions =
    "Deny:[read_file(*) write_file(*) read_url(*) execute_url(*) command(*) mcp(*)]";
  if (
    exitCode !== 0 ||
    envelope.status !== "SUCCESS" ||
    !logText.includes(expectedAppData) ||
    !logText.includes(expectedPermissions) ||
    !logText.includes("loaded 1 named hooks from 1 hooks.json file(s)") ||
    conversationFiles.some((file) => /\.(?:db|db-wal|db-shm)$/.test(file))
  ) {
    throw new Error(
      "Antigravity CLI does not support the required isolated profile contract. Update `agy` before using this provider.",
    );
  }

  const availableModelIds = (envelope.command?.data?.models ?? []).flatMap((entry) =>
    typeof entry.id === "string" ? [entry.id] : [],
  );
  if (!availableModelIds.includes(model)) {
    throw new Error(
      `Antigravity model '${model}' is not available for the signed-in Antigravity account. Run \`ai-git configure\` to select an available model.`,
    );
  }
}

function parseGeneration(stdout: string): string {
  let envelope: AntigravityEnvelope;
  try {
    envelope = JSON.parse(stdout) as AntigravityEnvelope;
  } catch {
    throw new Error("Antigravity CLI returned malformed generation JSON.");
  }

  if (envelope.status !== "SUCCESS") {
    throw new Error(envelope.error || `Antigravity CLI generation ${envelope.status || "failed"}.`);
  }

  const response = envelope.response?.trim();
  if (!response) {
    throw new Error("Antigravity CLI returned an empty response.");
  }
  return response;
}

function parseModels(stdout: string): APIModelDefinition[] {
  let envelope: AntigravityEnvelope;
  try {
    envelope = JSON.parse(stdout) as AntigravityEnvelope;
  } catch {
    throw new Error("Antigravity CLI returned malformed model-list JSON.");
  }

  if (envelope.status !== "SUCCESS") {
    throw new Error(envelope.error || "Antigravity CLI model discovery failed.");
  }

  const models = (envelope.command?.data?.models ?? []).flatMap((model) =>
    typeof model.id === "string" && typeof model.label === "string"
      ? [{ id: model.id, name: model.label }]
      : [],
  );

  if (models.length === 0) {
    throw new Error(
      "Antigravity CLI returned no usable models. Run `agy` interactively to verify authentication.",
    );
  }

  return rankModels(models);
}

export const antigravityAdapter: CLIProviderAdapter = {
  providerId: "antigravity-cli",
  mode: "cli",
  binary: "agy",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    await assertSupportedVersion();
    const runtime = await createIsolatedRuntime(system);
    try {
      await assertIsolatedProfile(runtime, model);
      const proc = Bun.spawn(
        [
          "agy",
          `--gemini_dir=${runtime.root}`,
          "--sandbox",
          "--agent",
          "ai-git",
          "--model",
          model,
          "--output-format",
          "json",
          "--disable-slash-commands",
          "--print-timeout",
          "2m",
          "-p",
          prompt,
        ],
        {
          cwd: runtime.workspace,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: "1" },
        },
      );
      const { stdout, stderr, exitCode } = await readAntigravityProcessOutput(
        proc,
        ANTIGRAVITY_GENERATION_TIMEOUT_MS,
      );
      if (exitCode !== 0) {
        throw new Error(
          `Antigravity CLI error (exit code ${exitCode}):\n${stderr.trim() || stdout.trim() || "Unknown error"}`,
        );
      }
      return parseGeneration(stdout);
    } finally {
      await removeIsolatedRuntime(runtime);
    }
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("agy"));
  },

  async fetchModels(): Promise<APIModelDefinition[]> {
    await assertSupportedVersion();
    const process = Bun.spawn(["agy", "--output-format", "json", "models"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const { stdout, stderr, exitCode } = await readAntigravityProcessOutput(process);
    if (exitCode !== 0) {
      throw new Error(
        `Antigravity CLI model discovery failed (exit code ${exitCode}): ${stderr.trim() || stdout.trim() || "Unknown error"}`,
      );
    }
    return parseModels(stdout);
  },
};
