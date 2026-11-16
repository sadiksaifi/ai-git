import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";
import { parseDynamicVariantModel, readProcessOutput, type DynamicCLIModel } from "./dynamic.ts";

/**
 * Effort suffixes used by model IDs saved before Codex models were listed live
 * (e.g. "gpt-5.6-luna-low"). New IDs use "<model>#<effort>". This list is frozen:
 * it only needs to cover IDs that older ai-git releases wrote.
 */
const LEGACY_EFFORT_SUFFIX = /^(.+)-(low|medium|high|xhigh|max)$/;

/**
 * Codex efforts that do not fit a single non-interactive generation call.
 * "ultra" enables automatic task delegation, which ai-git disables.
 */
const UNSUPPORTED_EFFORTS = new Set(["ultra"]);

/**
 * Parse a virtual model ID into its base model and optional reasoning effort.
 * e.g. "gpt-6.1-sol#high" → { model: "gpt-6.1-sol", effort: "high" }
 * Legacy IDs such as "gpt-5.6-sol-high" parse the same way.
 * Without an effort, Codex uses the model's default reasoning level.
 */
export function parseModelId(virtualId: string): {
  model: string;
  effort?: string;
} {
  const { model, variant } = parseDynamicVariantModel(virtualId);
  if (variant) return { model, effort: variant };

  const legacy = virtualId.match(LEGACY_EFFORT_SUFFIX);
  if (legacy?.[1] && legacy[2]) {
    return { model: legacy[1], effort: legacy[2] };
  }
  return { model: virtualId };
}

interface CodexCatalogModel {
  slug?: unknown;
  display_name?: unknown;
  visibility?: unknown;
  priority?: unknown;
  supported_reasoning_levels?: unknown;
}

function readEfforts(levels: unknown): string[] {
  if (!Array.isArray(levels)) return [];
  return levels.flatMap((level) => {
    const effort =
      typeof level === "string"
        ? level
        : typeof level === "object" && level !== null && "effort" in level
          ? (level as { effort?: unknown }).effort
          : undefined;
    return typeof effort === "string" && effort && !UNSUPPORTED_EFFORTS.has(effort) ? [effort] : [];
  });
}

/**
 * Parse `codex debug models` JSON into selectable model options.
 * Keeps models Codex shows in its own picker (visibility "list"), in Codex's
 * priority order, with one option per supported reasoning effort.
 * The first model at its first listed effort is marked recommended.
 */
export function parseCodexModelCatalog(output: string): DynamicCLIModel[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }

  const rawModels =
    typeof parsed === "object" && parsed !== null && "models" in parsed
      ? (parsed as { models?: unknown }).models
      : undefined;
  if (!Array.isArray(rawModels)) return [];

  const listed = (rawModels as CodexCatalogModel[])
    .map((model, index) => ({ model, index }))
    .filter(
      ({ model }) =>
        typeof model.slug === "string" &&
        model.slug.length > 0 &&
        (model.visibility === undefined || model.visibility === "list"),
    )
    .sort((a, b) => {
      const priorityA = typeof a.model.priority === "number" ? a.model.priority : Infinity;
      const priorityB = typeof b.model.priority === "number" ? b.model.priority : Infinity;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.index - b.index;
    });

  const options: DynamicCLIModel[] = [];
  for (const { model } of listed) {
    const slug = model.slug as string;
    const name =
      typeof model.display_name === "string" && model.display_name ? model.display_name : slug;
    const efforts = readEfforts(model.supported_reasoning_levels);

    if (efforts.length === 0) {
      options.push({ id: slug, name });
      continue;
    }

    for (const effort of efforts) {
      options.push({ id: `${slug}#${effort}`, name: `${name} (${effort})` });
    }
  }

  if (options[0]) {
    options[0] = { ...options[0], isRecommended: true };
  }
  return options;
}

async function runCodexModelListing(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(["codex", "debug", "models", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return await readProcessOutput(proc);
}

/**
 * Codex CLI adapter.
 * Handles invocation of the `codex` CLI tool.
 *
 * System prompt injection uses `-c developer_instructions=...` which injects
 * at the `developer` authority level (high priority, below system prompt).
 *
 * CLI Pattern:
 *   codex --model <base> -a never --disable shell_tool \
 *     [-c model_reasoning_effort=<effort>] -c 'developer_instructions=<system>' \
 *     -c 'web_search="disabled"' exec --sandbox read-only --ephemeral "<prompt>"
 *
 * Top-level options (before exec):
 * - `-a never` prevents interactive approval prompts
 * - `--disable ...` removes optional tools and ambient runtime features
 * - `-c web_search="disabled"` disables web search
 * - `-c history.persistence="none"` disables history persistence
 * - `-c mcp_servers={}` disables configured MCP servers
 *
 * Model listing:
 *   `codex debug models` prints the account's model catalog as JSON.
 *   `--bundled` prints the catalog shipped with the binary (no network).
 *
 * Exec subcommand options:
 * - `--sandbox read-only` enforces OS-level read-only filesystem
 * - `--ephemeral` skips session persistence
 */
export const codexAdapter: CLIProviderAdapter = {
  providerId: "codex",
  mode: "cli",
  binary: "codex",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const { model: baseModel, effort } = parseModelId(model);
    const effortArgs = effort ? ["-c", `model_reasoning_effort=${effort}`] : [];
    const proc = Bun.spawn(
      [
        "codex",
        "--model",
        baseModel,
        "-a",
        "never",
        "--disable",
        "shell_tool",
        "--disable",
        "shell_snapshot",
        "--disable",
        "apps",
        "--disable",
        "codex_hooks",
        "--disable",
        "multi_agent",
        "--disable",
        "personality",
        "--disable",
        "plugins",
        "-c",
        "check_for_update_on_startup=false",
        "-c",
        "analytics.enabled=false",
        "-c",
        'history.persistence="none"',
        "-c",
        "mcp_servers={}",
        ...effortArgs,
        "-c",
        `developer_instructions=${system}`,
        "-c",
        `web_search="disabled"`,
        "exec",
        "--sandbox",
        "read-only",
        "--ephemeral",
        prompt,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`Codex CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return stdout;
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("codex"));
  },

  async fetchModels(): Promise<DynamicCLIModel[]> {
    let result = await runCodexModelListing([]);
    if (result.exitCode !== 0) {
      // Fall back to the catalog bundled with the binary when the refresh fails.
      const bundled = await runCodexModelListing(["--bundled"]);
      if (bundled.exitCode === 0) result = bundled;
    }

    if (result.exitCode !== 0) {
      const errorMessage = result.stderr.trim() || result.stdout.trim() || "Unknown error";
      throw new Error(
        `Codex model listing failed (exit code ${result.exitCode}): ${errorMessage}\nUpdate Codex with \`codex update\` and try again.`,
      );
    }

    const models = parseCodexModelCatalog(result.stdout);
    if (models.length === 0) {
      throw new Error("Codex returned no usable models. Run `codex debug models` to verify setup.");
    }
    return models;
  },
};
