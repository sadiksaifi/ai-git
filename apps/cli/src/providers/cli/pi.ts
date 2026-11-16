import { PROVIDERS as PROVIDER_DOCS, isCLIProviderDoc } from "@ai-git/meta";
import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";
import { parseDynamicVariantModel, readProcessOutput, type DynamicCLIModel } from "./dynamic.ts";

/**
 * Pi thinking levels, lowest to highest. Mirrors Pi's own level list; per-model
 * support comes from each model's `reasoning` flag and `thinkingLevelMap`.
 */
const PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** Levels Pi enables for any reasoning model unless its map disables them. */
const STANDARD_PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high"];

const PI_RPC_TIMEOUT_MS = 15_000;

/** First Pi release whose RPC model records carry `thinkingLevelMap`. */
const MINIMUM_PI_VERSION = [0, 72, 0] as const;
const PI_RPC_REQUEST_ID = "ai-git-models";

/** Flags shared by generation and model listing so both see the same models. */
const PI_ISOLATION_FLAGS = [
  "--no-tools",
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-themes",
  "--no-context-files",
  "--no-session",
];

interface PiRpcModel {
  id?: unknown;
  name?: unknown;
  provider?: unknown;
  reasoning?: unknown;
  thinkingLevelMap?: unknown;
}

/**
 * Supported thinking levels for a Pi model, using Pi's rule:
 * - non-reasoning models support only "off"
 * - a level mapped to null is unsupported
 * - "xhigh" and "max" need an explicit mapping
 * Pi releases before 0.72.0 omit `thinkingLevelMap`, so setup requires 0.72.0.
 */
export function getPiSupportedThinkingLevels(model: PiRpcModel): string[] {
  if (model.reasoning !== true) return ["off"];
  const map =
    typeof model.thinkingLevelMap === "object" && model.thinkingLevelMap !== null
      ? (model.thinkingLevelMap as Record<string, unknown>)
      : {};

  return PI_THINKING_LEVELS.filter((level) => {
    const mapped = map[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}

function buildPiOptions(baseId: string, name: string, levels: string[]): DynamicCLIModel[] {
  if (levels.length === 1 && levels[0] === "off") {
    return [{ id: baseId, name }];
  }
  return levels.map((level) => ({ id: `${baseId}#${level}`, name: `${name} (${level})` }));
}

/**
 * Parse the `get_available_models` response from `pi --mode rpc`.
 * Returns null when the output has no successful response.
 */
export function parsePiRpcModels(output: string): DynamicCLIModel[] | null {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (typeof event !== "object" || event === null) continue;
    const record = event as {
      type?: unknown;
      command?: unknown;
      success?: unknown;
      data?: { models?: unknown };
    };
    if (record.type !== "response" || record.command !== "get_available_models") continue;
    if (record.success !== true || !Array.isArray(record.data?.models)) return null;

    return (record.data.models as PiRpcModel[]).flatMap((model) => {
      if (typeof model.provider !== "string" || typeof model.id !== "string") return [];
      const baseId = `${model.provider}/${model.id}`;
      return buildPiOptions(baseId, baseId, getPiSupportedThinkingLevels(model));
    });
  }

  return null;
}

export function parsePiVersion(output: string): number[] | null {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

export function isSupportedPiVersion(version: number[]): boolean {
  for (let index = 0; index < MINIMUM_PI_VERSION.length; index += 1) {
    const difference = (version[index] ?? 0) - MINIMUM_PI_VERSION[index]!;
    if (difference !== 0) return difference > 0;
  }
  return true;
}

function piUpgradeHint(): string {
  const doc = PROVIDER_DOCS.pi;
  return doc && isCLIProviderDoc(doc) ? ` Install the current release: ${doc.installCommand}` : "";
}

async function assertSupportedPiVersion(): Promise<void> {
  const proc = Bun.spawn(["pi", "--version"], { stdout: "pipe", stderr: "pipe" });
  const { stdout, stderr, exitCode } = await readProcessOutput(proc);
  const version = parsePiVersion(stdout || stderr);

  if (exitCode !== 0 || !version || !isSupportedPiVersion(version)) {
    throw new Error(
      `Pi ${MINIMUM_PI_VERSION.join(".")} or newer is required to list models with their thinking levels.${piUpgradeHint()}`,
    );
  }
}

async function listPiModelsViaRpc(): Promise<DynamicCLIModel[] | null> {
  const proc = Bun.spawn(["pi", "--mode", "rpc", ...PI_ISOLATION_FLAGS], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });

  let timeout: Timer | undefined;
  try {
    proc.stdin.write(
      `${JSON.stringify({ id: PI_RPC_REQUEST_ID, type: "get_available_models" })}\n`,
    );
    await proc.stdin.flush();

    const read = (async () => {
      const decoder = new TextDecoder();
      let output = "";
      for await (const chunk of proc.stdout) {
        output += decoder.decode(chunk, { stream: true });
        const models = parsePiRpcModels(output);
        if (models) return models;
      }
      return parsePiRpcModels(output);
    })();
    const timedOut = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), PI_RPC_TIMEOUT_MS);
    });

    return await Promise.race([read, timedOut]);
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
    try {
      await proc.stdin.end();
    } catch {
      // Process already exited.
    }
    proc.kill();
  }
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.includes("│")) {
    return trimmed
      .split("│")
      .map((cell) => cell.trim())
      .filter(Boolean);
  }

  if (trimmed.includes("|")) {
    return trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
  }

  return trimmed.split(/\s{2,}/).map((cell) => cell.trim());
}

function isSeparatorLine(line: string): boolean {
  return /^[\s─━\-+|│┌┐└┘├┤┬┴┼]+$/.test(line);
}

function buildPiTableOptions(provider: string, model: string, thinking: string): DynamicCLIModel[] {
  const baseId = `${provider}/${model}`;
  if (thinking.toLowerCase() !== "yes") {
    return [{ id: baseId, name: baseId }];
  }
  // The table has no per-model level data; offer the levels Pi enables by default.
  return buildPiOptions(baseId, baseId, STANDARD_PI_THINKING_LEVELS);
}

export function parsePiModelsTable(output: string): DynamicCLIModel[] {
  const rows = output
    .split(/\r?\n/)
    .map((line) => ({ line, cells: splitTableRow(line) }))
    .filter(({ line, cells }) => cells.length > 0 && !isSeparatorLine(line));

  let providerIndex = 0;
  let modelIndex = 1;
  let thinkingIndex = -1;
  let dataStartIndex = 0;

  const headerIndex = rows.findIndex(({ cells }) => {
    const normalized = cells.map((cell) => cell.toLowerCase());
    return normalized.includes("provider") && normalized.includes("model");
  });

  if (headerIndex >= 0) {
    const header = rows[headerIndex]!.cells.map((cell) => cell.toLowerCase());
    providerIndex = header.indexOf("provider");
    modelIndex = header.indexOf("model");
    thinkingIndex = header.indexOf("thinking");
    dataStartIndex = headerIndex + 1;
  }

  const models: DynamicCLIModel[] = [];
  for (const { cells } of rows.slice(dataStartIndex)) {
    const provider = cells[providerIndex];
    const model = cells[modelIndex];
    const thinking =
      thinkingIndex >= 0 ? cells[thinkingIndex] : cells.find((cell) => /^(yes|no)$/i.test(cell));

    if (!provider || !model || !thinking) continue;
    models.push(...buildPiTableOptions(provider, model, thinking));
  }

  return models;
}

export const piAdapter: CLIProviderAdapter = {
  providerId: "pi",
  mode: "cli",
  binary: "pi",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const { model: baseModel, variant } = parseDynamicVariantModel(model);
    const args = ["pi", "--model", baseModel];

    if (variant) {
      args.push("--thinking", variant);
    }

    args.push("--system-prompt", system, ...PI_ISOLATION_FLAGS, "-p", prompt);

    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const { stdout, stderr, exitCode } = await readProcessOutput(proc);
    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`Pi CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return stdout;
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("pi"));
  },

  async fetchModels(): Promise<DynamicCLIModel[]> {
    await assertSupportedPiVersion();

    // RPC mode reports each model's supported thinking levels.
    const rpcModels = await listPiModelsViaRpc();
    if (rpcModels && rpcModels.length > 0) return rpcModels;

    // RPC failed: fall back to the --list-models table.
    const proc = Bun.spawn(["pi", "--list-models"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const { stdout, stderr, exitCode } = await readProcessOutput(proc);
    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`Pi model listing failed (exit code ${exitCode}): ${errorMessage}`);
    }

    const models = parsePiModelsTable(stdout || stderr);
    if (models.length === 0) {
      throw new Error("Pi returned no usable models. Run `pi --list-models` to verify setup.");
    }

    return models;
  },
};
