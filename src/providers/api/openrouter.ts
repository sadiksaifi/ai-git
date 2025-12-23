import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { APIProviderAdapter, InvokeOptions } from "../types.ts";
import { getApiKey } from "./credentials.ts";
import { getProviderById } from "../registry.ts";

// ==============================================================================
// OPENROUTER API ADAPTER
// ==============================================================================

/**
 * OpenRouter API adapter.
 * Provides access to 100+ models via a single API key.
 *
 * Supported models include:
 * - Anthropic Claude (claude-sonnet-4, claude-3.5-sonnet, claude-3-haiku, etc.)
 * - OpenAI GPT (gpt-4o, gpt-4o-mini, etc.)
 * - Google Gemini (gemini-2.0-flash, gemini-pro, etc.)
 * - Meta Llama (llama-3.3-70b, etc.)
 * - And many more via openrouter.ai
 *
 * Model IDs use the format: provider/model-name
 * Example: "anthropic/claude-3.5-sonnet", "openai/gpt-4o"
 */
export const openRouterAdapter: APIProviderAdapter = {
  providerId: "openrouter",
  mode: "api",

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("openrouter");
    if (!apiKey) {
      throw new Error(
        "OpenRouter API key not configured. " +
          "Set OPENROUTER_API_KEY environment variable or run 'ai-git --setup' to configure."
      );
    }

    // Get provider definition for custom base URL support
    const provider = getProviderById("openrouter");
    const baseURL = provider?.defaultBaseUrl || "https://openrouter.ai/api/v1";

    const openrouter = createOpenRouter({
      apiKey,
      baseURL,
    });

    const { text } = await generateText({
      model: openrouter(model),
      prompt,
    });

    return text;
  },

  async checkAvailable(): Promise<boolean> {
    const apiKey = await getApiKey("openrouter");
    return !!apiKey;
  },
};
