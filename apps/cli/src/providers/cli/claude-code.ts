import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

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
    const proc = Bun.spawn(
      [
        "claude",
        "-p",
        "--model", model,
        "--system-prompt", system,
        "--tools", "",
        "--no-session-persistence",
        "--disable-slash-commands",
        "--strict-mcp-config",
        prompt,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

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
