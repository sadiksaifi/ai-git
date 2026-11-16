import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";
import type { CatalogModelDefinition, ModelCatalog } from "../api/models/types.ts";
import { getModelCatalog } from "../api/models/catalog.ts";
import { MODEL_CATALOG_SNAPSHOT } from "../api/models/snapshot.ts";
import { parseDynamicVariantModel, readProcessOutput, type DynamicCLIModel } from "./dynamic.ts";

/**
 * Effort suffixes used by model IDs saved before Claude Code models were built
 * from live data (e.g. "sonnet-high"). New IDs use "<alias>#<effort>". This list
 * is frozen: it only needs to cover IDs that older ai-git releases wrote.
 */
const LEGACY_EFFORT_SUFFIX = /^(.+)-(low|medium|high|xhigh|max)$/;

/** A model family counts as current when its newest model is at most this old
 * relative to the newest Anthropic model in the catalog. */
const CURRENT_FAMILY_WINDOW_MS = 548 * 24 * 60 * 60 * 1000;

const CATALOG_TIMEOUT_MS = 3000;

/**
 * Parse a virtual Claude model ID into its base model and optional effort level.
 * e.g. "sonnet#high" → { model: "sonnet", effort: "high" }
 * Legacy IDs such as "sonnet-high" parse the same way.
 * Falls back to using the full ID as model with no effort.
 */
export function parseClaudeModelId(virtualId: string): {
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

/**
 * Read the `--effort` levels from `claude --help` output.
 * - No `--effort` option (older Claude Code): returns [], so no effort is offered.
 * - `--effort` without a parseable level list: returns null, so the catalog decides.
 */
export function parseClaudeEffortLevels(helpText: string): string[] | null {
  const lines = helpText.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*--effort\b/.test(line));
  if (start < 0) return [];

  const block = [lines[start] ?? ""];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*-/.test(line) || !line.trim()) break;
    block.push(line);
  }

  const list = block.join(" ").match(/\(([^)]*)\)/)?.[1];
  if (!list) return null;

  const levels = list
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-z]+$/.test(value));
  return levels.length > 0 ? levels : null;
}

function familyAlias(model: CatalogModelDefinition): string | null {
  const family = model.family?.match(/^claude-([a-z]+)$/)?.[1];
  if (family) return family;
  return model.id.match(/^claude-(?:\d+(?:-\d+)?-)?([a-z]+)(?:-|$)/)?.[1] ?? null;
}

function releaseTime(model: CatalogModelDefinition): number {
  const time = Date.parse(model.releaseDate || model.lastUpdated || "");
  return Number.isNaN(time) ? 0 : time;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Build Claude Code model options from models.dev Anthropic data.
 *
 * Claude Code resolves family aliases ("haiku", "sonnet", ...) to the newest
 * model in that family, so one option per current family and effort is enough.
 * - Families come from models.dev `family` (fallback: parsed from the model ID).
 * - Efforts come from the newest model's models.dev effort values, limited to the
 *   levels the installed CLI accepts when those are known. An empty CLI list means
 *   the CLI has no `--effort` flag, so each family is offered as a bare alias.
 * - Families sort by price (cheapest first). The cheapest family at its lowest
 *   effort is recommended.
 */
export function buildClaudeCodeModels(
  catalogModels: Record<string, CatalogModelDefinition>,
  cliEfforts: string[] | null,
): DynamicCLIModel[] {
  const newestByFamily = new Map<string, CatalogModelDefinition>();

  for (const model of Object.values(catalogModels)) {
    if (model.status === "deprecated") continue;
    const alias = familyAlias(model);
    if (!alias) continue;

    const current = newestByFamily.get(alias);
    if (!current || releaseTime(model) > releaseTime(current)) {
      newestByFamily.set(alias, model);
    }
  }

  const newestRelease = Math.max(0, ...[...newestByFamily.values()].map(releaseTime));
  const families = [...newestByFamily.entries()]
    .filter(([, model]) => newestRelease - releaseTime(model) <= CURRENT_FAMILY_WINDOW_MS)
    .sort(([aliasA, a], [aliasB, b]) => {
      const inputDiff = (a.cost?.input ?? Infinity) - (b.cost?.input ?? Infinity);
      if (inputDiff !== 0 && !Number.isNaN(inputDiff)) return inputDiff;
      const outputDiff = (a.cost?.output ?? Infinity) - (b.cost?.output ?? Infinity);
      if (outputDiff !== 0 && !Number.isNaN(outputDiff)) return outputDiff;
      return aliasA.localeCompare(aliasB);
    });

  const options: DynamicCLIModel[] = [];
  for (const [alias, model] of families) {
    const name = `Claude ${capitalize(alias)}`;
    const efforts = (model.reasoningEfforts ?? []).filter(
      (effort) => !cliEfforts || cliEfforts.includes(effort),
    );

    if (efforts.length === 0) {
      options.push({ id: alias, name });
      continue;
    }
    for (const effort of efforts) {
      options.push({ id: `${alias}#${effort}`, name: `${name} (${effort})` });
    }
  }

  if (options[0]) {
    options[0] = { ...options[0], isRecommended: true };
  }
  return options;
}

function hasFamilyData(models: Record<string, CatalogModelDefinition>): boolean {
  return Object.values(models).some((model) => typeof model.family === "string");
}

/**
 * Pick the Anthropic model data to build options from. Catalog caches written by
 * older ai-git releases lack family data; use the bundled snapshot for those.
 */
export function selectAnthropicCatalogModels(
  catalog: ModelCatalog | null,
): Record<string, CatalogModelDefinition> {
  const models = catalog?.providers.anthropic.models;
  return models && hasFamilyData(models) ? models : MODEL_CATALOG_SNAPSHOT.anthropic.models;
}

async function loadCatalog(): Promise<ModelCatalog | null> {
  try {
    // On timeout or network failure the catalog loader falls back to cache, then snapshot.
    return await getModelCatalog({ signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) });
  } catch {
    return null;
  }
}

/**
 * Claude Code CLI adapter.
 * Handles invocation of the `claude` CLI tool.
 *
 * Model listing:
 *   Claude Code has no model listing command. Options are built from models.dev
 *   Anthropic families and the `--effort` levels printed by `claude --help`.
 *
 * CLI Pattern:
 *   claude -p --model <model> --system-prompt "<system>" --tools "" \
 *     --no-session-persistence --disable-slash-commands --strict-mcp-config "<prompt>"
 *
 * - `-p` enables non-interactive mode
 * - `--system-prompt` replaces the entire default system prompt with our rules
 * - `--tools ""` disables all built-in tools (pure text generation)
 * - `--no-session-persistence` skips writing session files
 * - `--disable-slash-commands` disables all skills
 * - `--strict-mcp-config` with no --mcp-config blocks all MCP servers
 * - Positional argument is the user content (context + diff)
 */
export const claudeCodeAdapter: CLIProviderAdapter = {
  providerId: "claude-code",
  mode: "cli",
  binary: "claude",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const { model: baseModel, effort } = parseClaudeModelId(model);

    const args = [
      "claude",
      "-p",
      "--model",
      baseModel,
      "--system-prompt",
      system,
      "--tools",
      "",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--strict-mcp-config",
    ];

    if (effort) {
      args.push("--effort", effort);
    }

    args.push(prompt);

    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`Claude CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return stdout;
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("claude"));
  },

  async fetchModels(): Promise<DynamicCLIModel[]> {
    const proc = Bun.spawn(["claude", "--help"], { stdout: "pipe", stderr: "pipe" });
    const [help, catalog] = await Promise.all([readProcessOutput(proc), loadCatalog()]);

    if (help.exitCode !== 0) {
      const errorMessage = help.stderr.trim() || help.stdout.trim() || "Unknown error";
      throw new Error(`Claude Code CLI check failed (exit code ${help.exitCode}): ${errorMessage}`);
    }

    const models = buildClaudeCodeModels(
      selectAnthropicCatalogModels(catalog),
      parseClaudeEffortLevels(help.stdout),
    );
    if (models.length === 0) {
      throw new Error("No Claude model families found in the model catalog.");
    }
    return models;
  },
};
