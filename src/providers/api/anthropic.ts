import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { APIProviderAdapter, InvokeOptions } from "../types.ts";
import { getApiKey } from "./credentials.ts";
import { getProviderById } from "../registry.ts";

// ==============================================================================
// ANTHROPIC API ADAPTER
// ==============================================================================

/**
 * Anthropic API adapter.
 * Direct access to Claude models via Anthropic's API.
 *
 * Supported models:
 * - claude-sonnet-4-20250514 (Claude Sonnet 4)
 * - claude-3-5-sonnet-latest (Claude 3.5 Sonnet)
 * - claude-3-5-haiku-latest (Claude 3.5 Haiku)
 * - claude-3-opus-latest (Claude 3 Opus)
 *
 * Requires ANTHROPIC_API_KEY environment variable or keychain storage.
 */
export const anthropicAdapter: APIProviderAdapter = {
  providerId: "anthropic",
  mode: "api",

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("anthropic");
    if (!apiKey) {
      throw new Error(
        "Anthropic API key not configured. " +
          "Set ANTHROPIC_API_KEY environment variable or run 'ai-git --setup' to configure."
      );
    }

    // Get provider definition for custom base URL support
    const provider = getProviderById("anthropic");
    const baseURL = provider?.defaultBaseUrl;

    const anthropic = createAnthropic({
      apiKey,
      ...(baseURL && { baseURL }),
    });

    const { text } = await generateText({
      model: anthropic(model),
      prompt,
    });

    return text;
  },

  async checkAvailable(): Promise<boolean> {
    const apiKey = await getApiKey("anthropic");
    return !!apiKey;
  },
};
