import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { APIProviderAdapter, InvokeOptions } from "../types.ts";
import { getApiKey } from "./credentials.ts";
import { getProviderById } from "../registry.ts";

// ==============================================================================
// OPENAI API ADAPTER
// ==============================================================================

/**
 * OpenAI API adapter.
 * Direct access to GPT models via OpenAI's API.
 *
 * Supported models:
 * - gpt-4o (GPT-4o)
 * - gpt-4o-mini (GPT-4o Mini)
 * - gpt-4-turbo (GPT-4 Turbo)
 * - o1 (o1 reasoning model)
 * - o1-mini (o1 Mini)
 *
 * Supports custom base URLs for Azure OpenAI or other compatible endpoints.
 * Requires OPENAI_API_KEY environment variable or keychain storage.
 */
export const openAIAdapter: APIProviderAdapter = {
  providerId: "openai",
  mode: "api",

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("openai");
    if (!apiKey) {
      throw new Error(
        "OpenAI API key not configured. " +
          "Set OPENAI_API_KEY environment variable or run 'ai-git --setup' to configure."
      );
    }

    // Get provider definition for custom base URL support
    const provider = getProviderById("openai");
    const baseURL = provider?.defaultBaseUrl;

    const openai = createOpenAI({
      apiKey,
      ...(baseURL && { baseURL }),
    });

    const { text } = await generateText({
      model: openai(model),
      prompt,
    });

    return text;
  },

  async checkAvailable(): Promise<boolean> {
    const apiKey = await getApiKey("openai");
    return !!apiKey;
  },
};
