import { $ } from "bun";
import type { ProviderAdapter, InvokeOptions } from "./types.ts";

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
export const claudeAdapter: ProviderAdapter = {
  providerId: "claude",
  binary: "claude",

  async invoke({ model, input }: InvokeOptions): Promise<string> {
    // Claude Code CLI uses -p for non-interactive output
    // Pass the entire input as system prompt to ensure it follows instructions
    // The main prompt just asks to generate the message
    const result = await $`claude -p --model ${model} --system-prompt ${input} ${"Generate the commit message now. Output ONLY the commit message, nothing else."}`.text();
    return result;
  },

  async checkAvailable(): Promise<boolean> {
    try {
      await $`which claude`.quiet();
      return true;
    } catch {
      return false;
    }
  },
};
