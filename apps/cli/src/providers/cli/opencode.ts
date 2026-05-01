import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";
import { parseDynamicVariantModel, readProcessOutput, type DynamicCLIModel } from "./dynamic.ts";

const OPENCODE_AGENT = "ai-git";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonBlock(
  lines: string[],
  startIndex: number,
): { json: string; nextIndex: number } | null {
  const parts: string[] = [];
  let depth = 0;
  let started = false;

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!started && !line.trim()) continue;
    if (!started && !line.trim().startsWith("{")) return null;

    started = true;
    parts.push(line);

    for (const char of line) {
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
    }

    if (started && depth <= 0) {
      return { json: parts.join("\n"), nextIndex: i + 1 };
    }
  }

  return null;
}

export function parseOpenCodeModelsVerbose(output: string): DynamicCLIModel[] {
  const lines = output.split(/\r?\n/);
  const models: DynamicCLIModel[] = [];

  for (let i = 0; i < lines.length; ) {
    const baseId = (lines[i] ?? "").trim();
    i += 1;

    if (!baseId || baseId.startsWith("{") || baseId.startsWith("[")) continue;

    const block = readJsonBlock(lines, i);
    if (!block) continue;
    i = block.nextIndex;

    let metadata: unknown;
    try {
      metadata = JSON.parse(block.json);
    } catch {
      continue;
    }

    const record = isPlainObject(metadata) ? metadata : {};
    const displayName = typeof record.name === "string" && record.name ? record.name : baseId;
    const variants = isPlainObject(record.variants) ? Object.keys(record.variants) : [];

    if (variants.length === 0) {
      models.push({ id: baseId, name: displayName });
      continue;
    }

    for (const variant of variants) {
      models.push({ id: `${baseId}#${variant}`, name: `${displayName} (${variant})` });
    }
  }

  return models;
}

export function parseOpenCodeJsonText(output: string): string {
  const chunks: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed) as unknown;
      if (!isPlainObject(event) || event.type !== "text" || !isPlainObject(event.part)) continue;
      const text = event.part.text;
      if (typeof text === "string") chunks.push(text);
    } catch {
      // Ignore non-JSON progress lines. OpenCode --format json emits NDJSON text events.
    }
  }

  return chunks.join("");
}

export const opencodeAdapter: CLIProviderAdapter = {
  providerId: "opencode",
  mode: "cli",
  binary: "opencode",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const { model: baseModel, variant } = parseDynamicVariantModel(model);
    const args = ["opencode", "run", "--pure", "--model", baseModel];

    if (variant) {
      args.push("--variant", variant);
    }

    args.push("--agent", OPENCODE_AGENT, "--format", "json", prompt);

    const config = {
      model: baseModel,
      default_agent: OPENCODE_AGENT,
      agent: {
        [OPENCODE_AGENT]: {
          prompt: system,
          permission: { "*": "deny" },
        },
      },
    };

    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      },
    });

    const { stdout, stderr, exitCode } = await readProcessOutput(proc);
    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`OpenCode CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return parseOpenCodeJsonText(stdout);
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("opencode"));
  },

  async fetchModels(): Promise<DynamicCLIModel[]> {
    const proc = Bun.spawn(["opencode", "models", "--verbose"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const { stdout, stderr, exitCode } = await readProcessOutput(proc);
    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`OpenCode model listing failed (exit code ${exitCode}): ${errorMessage}`);
    }

    const models = parseOpenCodeModelsVerbose(stdout);
    if (models.length === 0) {
      throw new Error(
        "OpenCode returned no usable models. Run `opencode models --verbose` to verify setup.",
      );
    }

    return models;
  },
};
