import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

export type ClaudeEffortLevel = "low" | "medium" | "high";

/**
 * Parse a virtual Claude model ID into its base model and optional effort level.
 * e.g. "sonnet-high" → { model: "sonnet", effort: "high" }
 * Falls back to using the full ID as model with no effort.
 *
 * Note: This regex will parse "haiku-high" into { model: "haiku", effort: "high" },
 * but Haiku does NOT support effort levels. The registry deliberately excludes
 * haiku-low/medium/high variants, so invalid IDs like "haiku-high" are caught
 * at config validation time, not here.
 */
export function parseClaudeModelId(virtualId: string): {
  model: string;
  effort?: ClaudeEffortLevel;
} {
  const match = virtualId.match(/^(.+)-(low|medium|high)$/);
  if (match?.[1] && match[2]) {
    return { model: match[1], effort: match[2] as ClaudeEffortLevel };
  }
  return { model: virtualId };
}

/**
 * Claude Code CLI adapter.
 * Handles invocation of the `claude` CLI tool.
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
      "--model", baseModel,
      "--system-prompt", system,
      "--tools", "",
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
};
