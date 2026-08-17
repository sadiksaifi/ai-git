import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CLIProviderAdapter, InvokeOptions, APIModelDefinition } from "../types.ts";
import { readProcessOutput } from "./dynamic.ts";

const MINIMUM_ANTIGRAVITY_VERSION = [1, 1, 13] as const;
const ISOLATED_PROFILE_PREFIX = "ai-git-antigravity-";
const DENY_REASON = "AI Git disables all Antigravity tools.";

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
  const gemini = model.id.match(
    /^gemini-(\d+(?:\.\d+)+)-(flash|pro)(?:-(low|medium|high))?$/i,
  );
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

  return ranked.map((model, index) => ({
    ...model,
    isRecommended: index === 0 || undefined,
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
    ranked[0]?.id ??
    null
  );
}

async function assertSupportedVersion(): Promise<void> {
  const process = Bun.spawn(["agy", "--version"], { stdout: "pipe", stderr: "pipe" });
  const { stdout, stderr, exitCode } = await readProcessOutput(process);
  const version = parseVersion(stdout || stderr);

  if (exitCode !== 0 || !version || !isSupportedVersion(version)) {
    throw new Error(
      "Antigravity CLI 1.1.13 or newer is required. Run `agy update` and try again.",
    );
  }
}

function denyHookCommand(): string {
  const output = JSON.stringify({ decision: "deny", reason: DENY_REASON });
  if (process.platform === "win32") {
    const escaped = output.replace(/'/g, "''");
    return `powershell -NoProfile -NonInteractive -Command \"$input | Out-Null; [Console]::Out.Write('${escaped}')\"`;
  }
  return `printf '%s\\n' '${output.replace(/'/g, `'\\''`)}'`;
}

async function createIsolatedRuntime(system: string): Promise<IsolatedRuntime> {
  const root = await mkdtemp(join(tmpdir(), ISOLATED_PROFILE_PREFIX));
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

  const settings = {
    allowNonWorkspaceAccess: false,
    disableSlashCommands: true,
    enableTelemetry: false,
    enableTerminalSandbox: true,
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
}

async function removeIsolatedRuntime(runtime: IsolatedRuntime): Promise<void> {
  const expectedParent = tmpdir();
  if (
    !runtime.root.startsWith(`${expectedParent}/`) ||
    !runtime.root.slice(expectedParent.length + 1).startsWith(ISOLATED_PROFILE_PREFIX)
  ) {
    throw new Error("Refusing to remove an unexpected Antigravity profile path.");
  }
  await rm(runtime.root, { recursive: true, force: true });
}

async function assertIsolatedProfile(runtime: IsolatedRuntime): Promise<void> {
  const proc = Bun.spawn(
    [
      "agy",
      `--gemini_dir=${runtime.root}`,
      "--output-format",
      "json",
      "-p",
      "/config",
    ],
    {
      cwd: runtime.workspace,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: "1" },
    },
  );
  const { stdout, stderr, exitCode } = await readProcessOutput(proc);
  let envelope: AntigravityEnvelope;
  try {
    envelope = JSON.parse(stdout) as AntigravityEnvelope;
  } catch {
    throw new Error(
      `Antigravity CLI does not support the required isolated profile contract: ${stderr.trim() || "invalid /config response"}`,
    );
  }

  const deny = envelope.command?.data?.config?.permissions?.deny ?? [];
  const requiredDeny = [
    "read_file(*)",
    "write_file(*)",
    "read_url(*)",
    "execute_url(*)",
    "command(*)",
    "mcp(*)",
  ];
  if (
    exitCode !== 0 ||
    envelope.status !== "SUCCESS" ||
    envelope.command?.data?.config?.enableTerminalSandbox !== true ||
    !requiredDeny.every((rule) => deny.includes(rule))
  ) {
    throw new Error(
      "Antigravity CLI does not support the required isolated profile contract. Update `agy` before using this provider.",
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
      await assertIsolatedProfile(runtime);
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
      const { stdout, stderr, exitCode } = await readProcessOutput(proc);
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
    const { stdout, stderr, exitCode } = await readProcessOutput(process);
    if (exitCode !== 0) {
      throw new Error(
        `Antigravity CLI model discovery failed (exit code ${exitCode}): ${stderr.trim() || stdout.trim() || "Unknown error"}`,
      );
    }
    return parseModels(stdout);
  },
};
