import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

/**
 * Gemini CLI adapter.
 * Handles invocation of the `gemini` CLI tool.
 *
 * CLI Pattern: gemini --model <model> <input>
 */
export const geminiCliAdapter: CLIProviderAdapter = {
  providerId: "gemini-cli",
  mode: "cli",
  binary: "gemini",

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const proc = Bun.spawn(["gemini", "--model", model, prompt], {
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
      throw new Error(`Gemini CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return stdout;
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("gemini"));
  },
};
