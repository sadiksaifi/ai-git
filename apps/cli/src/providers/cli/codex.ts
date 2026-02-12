import { $ } from "bun";
import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

/**
 * Codex CLI adapter.
 * Handles invocation of the `codex` CLI tool.
 *
 * CLI Pattern: codex exec --model <model> <prompt>
 * - Uses `exec` subcommand for non-interactive mode
 * - `--model` specifies the model to use
 * - Prompt is passed as positional argument
 */
export const codexAdapter: CLIProviderAdapter = {
  providerId: "codex",
  mode: "cli",
  binary: "codex",

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const proc = Bun.spawn(["codex", "--model", model, "exec", prompt], {
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
    try {
      await $`which codex`.quiet();
      return true;
    } catch {
      return false;
    }
  },
};
