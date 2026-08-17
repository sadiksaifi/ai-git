import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";
import { parseDynamicVariantModel, readProcessOutput, type DynamicCLIModel } from "./dynamic.ts";

type PiThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const STANDARD_PI_THINKING_LEVELS: PiThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];

const PI_MODEL_THINKING_LEVELS: ReadonlyArray<{
  modelIds: ReadonlySet<string>;
  levels: readonly PiThinkingLevel[];
}> = [
  {
    modelIds: new Set(["gpt-5-6-luna", "gpt-5-6-terra", "gpt-5-6-sol"]),
    levels: [...STANDARD_PI_THINKING_LEVELS, "xhigh", "max"],
  },
  {
    modelIds: new Set(["gpt-5-5"]),
    levels: [...STANDARD_PI_THINKING_LEVELS, "xhigh"],
  },
  {
    modelIds: new Set(["claude-fable-5"]),
    levels: ["minimal", "low", "medium", "high", "xhigh", "max"],
  },
  {
    modelIds: new Set(["claude-opus-5", "claude-sonnet-5", "claude-opus-4-7", "claude-opus-4-8"]),
    levels: [...STANDARD_PI_THINKING_LEVELS, "xhigh", "max"],
  },
  {
    modelIds: new Set(["claude-opus-4-6", "claude-sonnet-4-6"]),
    levels: [...STANDARD_PI_THINKING_LEVELS, "max"],
  },
  {
    modelIds: new Set(["deepseek-v4-pro"]),
    levels: ["off", "high", "max"],
  },
  {
    modelIds: new Set(["deepseek-v4-flash"]),
    levels: ["off", "low", "high", "max"],
  },
];

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

export function getPiThinkingLevels(baseModelId: string): readonly PiThinkingLevel[] {
  const modelId = (baseModelId.split("/").pop() ?? baseModelId).toLowerCase().replace(/[._]/g, "-");

  return (
    PI_MODEL_THINKING_LEVELS.find((capability) => capability.modelIds.has(modelId))?.levels ??
    STANDARD_PI_THINKING_LEVELS
  );
}

function buildPiModelOptions(provider: string, model: string, thinking: string): DynamicCLIModel[] {
  const baseId = `${provider}/${model}`;
  if (thinking.toLowerCase() !== "yes") {
    return [{ id: baseId, name: baseId }];
  }

  const levels = getPiThinkingLevels(baseId);
  return levels.map((level) => ({ id: `${baseId}#${level}`, name: `${baseId} (${level})` }));
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
    models.push(...buildPiModelOptions(provider, model, thinking));
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

    args.push(
      "--system-prompt",
      system,
      "--no-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-session",
      "-p",
      prompt,
    );

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
