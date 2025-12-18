import { $ } from "bun";
import type { ProviderAdapter, InvokeOptions } from "./types.ts";

/**
 * Gemini CLI adapter.
 * Handles invocation of the `gemini` CLI tool.
 *
 * CLI Pattern: gemini --model <model> <input>
 */
export const geminiAdapter: ProviderAdapter = {
  providerId: "gemini",
  binary: "gemini",

  async invoke({ model, input }: InvokeOptions): Promise<string> {
    const result = await $`gemini --model ${model} ${input}`.text();
    return result;
  },

  async checkAvailable(): Promise<boolean> {
    try {
      await $`which gemini`.quiet();
      return true;
    } catch {
      return false;
    }
  },
};
