import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROVIDERS as PROVIDER_DOCS, isCLIProviderDoc } from "@ai-git/meta";
import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";
import { readProcessOutput, type DynamicCLIModel } from "./dynamic.ts";

const OPENCODE_AGENT = "ai-git";

/** First OpenCode release with `opencode run --archived`. */
const MINIMUM_OPENCODE_VERSION = [2, 2, 6] as const;

/**
 * Plugin directives for every OpenCode call. `-*` turns off all plugins,
 * `opencode.*` turns the built-in plugins back on (providers, config loading),
 * and `-opencode.config.instruction` keeps AGENTS.md and other instruction
 * files out of the prompt. User plugins stay off.
 */
const OPENCODE_PLUGINS = ["-*", "opencode.*", "-opencode.config.instruction"];

interface OpenCodeModelRecord {
  id?: unknown;
  providerID?: unknown;
  name?: unknown;
  enabled?: unknown;
  status?: unknown;
  capabilities?: unknown;
  variants?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Config passed through OPENCODE_CONFIG_CONTENT. OpenCode reads it only in the
 * process that loads config, so every call runs with `--standalone` instead of
 * the shared background service.
 */
export function buildOpenCodeConfig(system?: string): Record<string, unknown> {
  return {
    plugins: OPENCODE_PLUGINS,
    ...(system === undefined
      ? {}
      : {
          agents: {
            [OPENCODE_AGENT]: {
              system,
              mode: "primary",
              hidden: true,
              permissions: [{ action: "*", resource: "*", effect: "deny" }],
            },
          },
        }),
  };
}

/**
 * OpenCode takes its working directory from PWD when it is set, so PWD must
 * point at the spawn directory. An inherited PWD would put the session in the
 * user's repository.
 */
export function buildOpenCodeEnv(cwd: string, system?: string): Record<string, string | undefined> {
  return {
    ...process.env,
    PWD: cwd,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(buildOpenCodeConfig(system)),
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  };
}

/**
 * Run an OpenCode command in an empty temporary directory, so no project
 * files, config, or instructions reach the model.
 */
async function runInEmptyDirectory<T>(task: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "ai-git-opencode-"));
  try {
    return await task(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

/**
 * Parse `opencode api model.list` output. Each model expands into one option
 * per variant; a model without variants is offered as `provider/model`.
 */
export function parseOpenCodeModelList(output: string): DynamicCLIModel[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }

  const records = isPlainObject(parsed) && Array.isArray(parsed.data) ? parsed.data : [];
  const models: DynamicCLIModel[] = [];

  for (const record of records as OpenCodeModelRecord[]) {
    if (!isPlainObject(record)) continue;
    if (typeof record.providerID !== "string" || typeof record.id !== "string") continue;
    if (record.enabled === false || record.status === "deprecated") continue;

    const output = isPlainObject(record.capabilities) ? record.capabilities.output : undefined;
    if (Array.isArray(output) && !output.includes("text")) continue;

    const baseId = `${record.providerID}/${record.id}`;
    const name = typeof record.name === "string" && record.name ? record.name : baseId;
    const variants = Array.isArray(record.variants)
      ? record.variants
          .map((variant) => (isPlainObject(variant) ? variant.id : undefined))
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (variants.length === 0) {
      models.push({ id: baseId, name });
      continue;
    }

    for (const variant of variants) {
      models.push({ id: `${baseId}#${variant}`, name: `${name} (${variant})` });
    }
  }

  return models;
}

/**
 * Collect the reply text and any error messages from `opencode run --format json`
 * NDJSON events.
 */
export function parseOpenCodeRunEvents(output: string): { text: string; errors: string[] } {
  const chunks: string[] = [];
  const errors: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isPlainObject(event)) continue;

    if (event.type === "text" && isPlainObject(event.part)) {
      const text = event.part.text;
      if (typeof text === "string") chunks.push(text);
    } else if (event.type === "error") {
      const message = isPlainObject(event.error) ? event.error.message : undefined;
      errors.push(typeof message === "string" && message ? message : trimmed);
    }
  }

  return { text: chunks.join(""), errors };
}

export function parseOpenCodeVersion(output: string): number[] | null {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

export function isSupportedOpenCodeVersion(version: number[]): boolean {
  for (let index = 0; index < MINIMUM_OPENCODE_VERSION.length; index += 1) {
    const difference = (version[index] ?? 0) - MINIMUM_OPENCODE_VERSION[index]!;
    if (difference !== 0) return difference > 0;
  }
  return true;
}

function openCodeUpgradeHint(): string {
  const doc = PROVIDER_DOCS.opencode;
  return doc && isCLIProviderDoc(doc) ? ` Install the current release: ${doc.installCommand}` : "";
}

/**
 * OpenCode 1.x ignores the 2.x `agents` config, so it would run with its
 * default tool permissions. Check the version before every call.
 */
async function assertSupportedOpenCodeVersion(): Promise<void> {
  const proc = Bun.spawn(["opencode", "--version"], { stdout: "pipe", stderr: "pipe" });
  const { stdout, stderr, exitCode } = await readProcessOutput(proc);
  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || "no output";
    throw new Error(`\`opencode --version\` failed (exit code ${exitCode}): ${detail}`);
  }

  const version = parseOpenCodeVersion(stdout || stderr);
  if (!version) {
    throw new Error(
      `Could not read the OpenCode version from \`opencode --version\`: ${(stdout || stderr).trim() || "no output"}`,
    );
  }

  if (!isSupportedOpenCodeVersion(version)) {
    throw new Error(
      `OpenCode ${MINIMUM_OPENCODE_VERSION.join(".")} or newer is required. Found ${version.join(".")}.${openCodeUpgradeHint()}`,
    );
  }
}

export const opencodeAdapter: CLIProviderAdapter = {
  providerId: "opencode",
  mode: "cli",
  binary: "opencode",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    await assertSupportedOpenCodeVersion();

    // --model takes provider/model#variant directly. --title skips the extra
    // model call OpenCode makes to name the session, and --archived keeps the
    // session out of the user's session lists. The prompt goes through stdin,
    // so a large diff cannot exceed the argument size limit and a prompt that
    // starts with "-" cannot be read as a flag.
    const args = [
      "opencode",
      "run",
      "--standalone",
      "--archived",
      "--title",
      "ai-git",
      "--model",
      model,
      "--agent",
      OPENCODE_AGENT,
      "--format",
      "json",
    ];

    const { stdout, stderr, exitCode } = await runInEmptyDirectory(async (cwd) => {
      const proc = Bun.spawn(args, {
        cwd,
        stdin: new Blob([prompt]),
        stdout: "pipe",
        stderr: "pipe",
        env: buildOpenCodeEnv(cwd, system),
      });
      return readProcessOutput(proc);
    });

    const { text, errors } = parseOpenCodeRunEvents(stdout);
    if (exitCode !== 0 || errors.length > 0) {
      const errorMessage = errors.join("\n") || stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`OpenCode CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return text;
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("opencode"));
  },

  async fetchModels(): Promise<DynamicCLIModel[]> {
    await assertSupportedOpenCodeVersion();

    // Same isolation as generation, so setup lists only models that
    // generation can run.
    const { stdout, stderr, exitCode } = await runInEmptyDirectory(async (cwd) => {
      const proc = Bun.spawn(["opencode", "api", "model.list", "--standalone"], {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: buildOpenCodeEnv(cwd),
      });
      return readProcessOutput(proc);
    });

    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`OpenCode model listing failed (exit code ${exitCode}): ${errorMessage}`);
    }

    const models = parseOpenCodeModelList(stdout);
    if (models.length === 0) {
      throw new Error("OpenCode returned no usable models. Run `opencode models` to verify setup.");
    }

    return models;
  },
};
