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

  return models.map((model, index) => ({ ...model, isRecommended: index === 0 || undefined }));
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
