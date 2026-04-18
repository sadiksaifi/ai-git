import { resolveCodexConfigFile } from "../../lib/paths.ts";
import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

type ReasoningEffort = "xhigh" | "high" | "medium" | "low";
type CodexConfig = {
  mcp_servers?: Record<string, unknown>;
};

const CODEX_DISABLED_FEATURES = ["shell_tool", "shell_snapshot", "codex_hooks"] as const;
const MCP_SERVER_BARE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

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

async function readOptionalTextFile(path: string): Promise<string | undefined> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return undefined;
    return await file.text();
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeMcpServerConfig(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  return "command" in value || "url" in value || "transport" in value;
}

function formatMcpDisableOverride(serverId: string, value: unknown): string | undefined {
  // Codex CLI override paths use TOML bare keys, so skip ids that would
  // require quoting or path escaping.
  if (!MCP_SERVER_BARE_KEY_PATTERN.test(serverId)) return undefined;
  if (!looksLikeMcpServerConfig(value)) return undefined;
  return `mcp_servers.${serverId}.enabled=false`;
}

function extractMcpDisableOverrides(configText: string): string[] {
  try {
    const parsed = Bun.TOML.parse(configText) as CodexConfig;
    if (!isPlainObject(parsed.mcp_servers)) return [];

    return Object.entries(parsed.mcp_servers)
      .map(([serverId, value]) => formatMcpDisableOverride(serverId, value))
      .filter((override): override is string => !!override)
      .sort();
  } catch {
    return [];
  }
}

export async function loadCodexMcpDisableOverrides(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const configText = await readOptionalTextFile(resolveCodexConfigFile(env));
  if (!configText) return [];
  return extractMcpDisableOverrides(configText);
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
      throw new Error(`Codex CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return stdout;
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("codex"));
  },
};
