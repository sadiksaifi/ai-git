import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import type { APIProviderAdapter, InvokeOptions } from "../types.ts";
import { getApiKey } from "./credentials.ts";

// ==============================================================================
// GOOGLE AI API ADAPTER
// ==============================================================================

/**
 * Google AI API adapter.
 * Direct access to Gemini models via Google's Generative AI API.
 *
 * Supported models:
 * - gemini-2.0-flash (Gemini 2.0 Flash)
 * - gemini-2.0-flash-lite (Gemini 2.0 Flash Lite)
 * - gemini-1.5-pro (Gemini 1.5 Pro)
 * - gemini-1.5-flash (Gemini 1.5 Flash)
 *
 * Requires GOOGLE_API_KEY environment variable or keychain storage.
 * Get your API key from: https://aistudio.google.com/apikey
 */
export const googleAdapter: APIProviderAdapter = {
  providerId: "google",
  mode: "api",

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("google");
    if (!apiKey) {
      throw new Error(
        "Google API key not configured. " +
          "Set GOOGLE_API_KEY environment variable or run 'ai-git --setup' to configure."
      );
    }

    const google = createGoogleGenerativeAI({
      apiKey,
    });

    const { text } = await generateText({
      model: google(model),
      prompt,
    });

    return text;
  },

  async checkAvailable(): Promise<boolean> {
    const apiKey = await getApiKey("google");
    return !!apiKey;
  },
};
