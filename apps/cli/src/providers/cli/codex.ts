import { homedir } from "node:os";
import { join } from "node:path";
import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

type ReasoningEffort = "xhigh" | "high" | "medium" | "low";

const CODEX_DISABLED_FEATURES = ["shell_tool", "shell_snapshot", "codex_hooks"] as const;

const CODEX_FIXED_CONFIG_OVERRIDES = [
  "check_for_update_on_startup=false",
  "analytics.enabled=false",
  "history.persistence=none",
  "memories.generate_memories=false",
  "memories.use_memories=false",
  "project_doc_max_bytes=0",
  "include_permissions_instructions=false",
  "include_apps_instructions=false",
  "include_environment_context=false",
] as const;

/**
 * Parse a virtual model ID into its base model and reasoning effort.
 * e.g. "gpt-5.4-high" → { model: "gpt-5.4", effort: "high" }
 * Falls back to using the full ID as model with "medium" effort.
 */
function parseModelId(virtualId: string): {
  model: string;
  effort: ReasoningEffort;
} {
  const match = virtualId.match(/^(.+)-(xhigh|high|medium|low)$/);
  if (match?.[1] && match[2]) {
    return { model: match[1], effort: match[2] as ReasoningEffort };
  }
  return { model: virtualId, effort: "medium" };
}

function getCodexConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const codexHome = env.CODEX_HOME?.trim();
  return join(codexHome && codexHome.length > 0 ? codexHome : join(homedir(), ".codex"), "config.toml");
}

async function readOptionalTextFile(path: string): Promise<string | undefined> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return undefined;
    return await file.text();
  } catch {
    return undefined;
  }
}

function extractMcpServerIds(configText: string): string[] {
  const ids = new Set<string>();
  const headerPattern = /^\s*\[mcp_servers\.((?:"(?:[^"\\]|\\.)+")|(?:[^.\]\s]+))/gm;

  for (const match of configText.matchAll(headerPattern)) {
    const rawId = match[1];
    if (!rawId) continue;
    ids.add(rawId.startsWith('"') ? rawId.slice(1, -1) : rawId);
  }

  return Array.from(ids).sort();
}

function formatMcpDisableOverride(serverId: string): string | undefined {
  // Codex CLI override paths are split on '.', so dotted server ids cannot be
  // safely targeted with `-c mcp_servers.<id>.enabled=false`.
  if (!serverId || serverId.includes(".")) return undefined;
  return `mcp_servers.${serverId}.enabled=false`;
}

export async function loadCodexMcpDisableOverrides(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const configText = await readOptionalTextFile(getCodexConfigPath(env));
  if (!configText) return [];

  return extractMcpServerIds(configText)
    .map(formatMcpDisableOverride)
    .filter((override): override is string => !!override);
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
 *     -c model_reasoning_effort=<effort> -c 'developer_instructions=<system>' \
 *     -c 'web_search="disabled"' exec --sandbox read-only --ephemeral "<prompt>"
 *
 * Top-level options (before exec):
 * - `-a never` prevents interactive approval prompts
 * - `--disable shell_tool` removes shell tool from model's available tools
 * - `-c web_search="disabled"` disables web search
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
    const mcpDisableOverrides = await loadCodexMcpDisableOverrides();
    const args = [
      "codex",
      "--model",
      baseModel,
      "-a",
      "never",
      ...CODEX_DISABLED_FEATURES.flatMap((feature) => ["--disable", feature] as const),
      ...CODEX_FIXED_CONFIG_OVERRIDES.flatMap((override) => ["-c", override] as const),
      ...mcpDisableOverrides.flatMap((override) => ["-c", override] as const),
      "-c",
      `model_reasoning_effort=${effort}`,
      "-c",
      `developer_instructions=${system}`,
      "-c",
      `web_search="disabled"`,
      "exec",
      "--sandbox",
      "read-only",
      "--ephemeral",
      prompt,
    ];
    const proc = Bun.spawn(
      args,
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
};
