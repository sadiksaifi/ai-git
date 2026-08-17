import type { CLIProviderAdapter, InvokeOptions, APIModelDefinition } from "../types.ts";
import { readProcessOutput } from "./dynamic.ts";

const MINIMUM_ANTIGRAVITY_VERSION = [1, 1, 13] as const;

interface AntigravityEnvelope {
  status?: string;
  error?: string | null;
  command?: {
    data?: {
      models?: Array<{ id?: unknown; label?: unknown }>;
    };
  };
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

  async invoke(_options: InvokeOptions): Promise<string> {
    throw new Error("Antigravity CLI generation is not implemented yet.");
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
