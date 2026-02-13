import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

/**
 * Claude Code CLI adapter.
 * Handles invocation of the `claude` CLI tool.
 *
 * CLI Pattern: claude -p --model <model> --system-prompt "<system>" "<prompt>"
 * - `-p` (--print) enables non-interactive mode
 * - `--model` specifies the model to use
 * - `--system-prompt` sets the system instructions
 * - Main prompt is passed as positional argument
 */
export const claudeCodeAdapter: CLIProviderAdapter = {
  providerId: "claude-code",
  mode: "cli",
  binary: "claude",

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    // Claude Code CLI uses -p for non-interactive output
    // Pass the entire input as system prompt to ensure it follows instructions
    // The main prompt just asks to generate the message
    const proc = Bun.spawn(
      [
        "claude",
        "-p",
        "--model",
        model,
        "--system-prompt",
        prompt,
        "Generate the commit message now. Output ONLY the commit message, nothing else.",
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
