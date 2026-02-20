import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

/**
 * Gemini CLI adapter.
 * Handles invocation of the `gemini` CLI tool.
 *
 * System prompt injection uses GEMINI_SYSTEM_MD environment variable
 * pointing to a temporary file. This is the only mechanism that places
 * content in the actual system message (not conversation context).
 *
 * CLI Pattern:
 *   GEMINI_SYSTEM_MD=/tmp/ai-git-system-xxx.md \
 *     gemini -p --model <model> --output-format text --approval-mode plan "<prompt>"
 *
 * - `-p` enables headless/non-interactive mode
 * - `--output-format text` ensures clean text output
 * - `--approval-mode plan` locks down to read-only (no file edits, no shell commands)
 * - GEMINI_SYSTEM_MD replaces the entire default system prompt
 */
export const geminiCliAdapter: CLIProviderAdapter = {
  providerId: "gemini-cli",
  mode: "cli",
  binary: "gemini",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    // Write system prompt to temp file for GEMINI_SYSTEM_MD
    const tmpFile = join(
      tmpdir(),
      `ai-git-system-${Date.now()}-${randomBytes(4).toString("hex")}.md`
    );

    try {
      await Bun.write(tmpFile, system);

      const proc = Bun.spawn(
        [
          "gemini",
          "-p",
          "--model", model,
          "--output-format", "text",
          "--approval-mode", "plan",
          prompt,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            GEMINI_SYSTEM_MD: tmpFile,
          },
        }
      );

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
    } finally {
      // Cleanup temp file — silently ignore errors
      await unlink(tmpFile).catch(() => {});
    }
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("gemini"));
  },
};
