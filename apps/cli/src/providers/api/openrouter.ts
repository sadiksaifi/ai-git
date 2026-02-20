import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";
import {
  dedupeProviderModels,
  getModelCatalog,
  rankProviderModels,
} from "./models/index.ts";

// ==============================================================================
// OPENROUTER API ADAPTER
// ==============================================================================

const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter API response shape for models endpoint.
 */
interface OpenRouterModelsResponse {
  data: Array<{
    id: string;
    name: string;
    description?: string;
    context_length?: number;
    pricing?: {
      prompt: string;
      completion: string;
    };
  }>;
}

/**
 * OpenRouter API adapter using Vercel AI SDK.
 * Provides access to multiple AI providers through a single API.
 */
export const openRouterAdapter: APIProviderAdapter = {
  providerId: "openrouter",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("openrouter");

    const openrouter = createOpenRouter({
      apiKey,
      headers: {
        "HTTP-Referer": "https://github.com/sadiksaifi/ai-git",
        "X-Title": "ai-git",
      },
    });

    const { text } = await generateText({
      model: openrouter(model),
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: 1024,
      timeout: 60_000,
      maxRetries: 2,
    });

    return text;
  },

  async checkAvailable(): Promise<boolean> {
    try {
      const apiKey = await getApiKey("openrouter");
      return !!apiKey;
    } catch {
      return false;
    }
  },

  async fetchModels(providedApiKey?: string): Promise<APIModelDefinition[]> {
    const apiKey = await getApiKey("openrouter", providedApiKey);

    const { controller, cleanup } = createTimeoutController();

    try {
      const response = await fetch(`${BASE_URL}/models`, {
        headers: {
          ...COMMON_HEADERS,
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/sadiksaifi/ai-git",
          "X-Title": "ai-git",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as OpenRouterModelsResponse;

      const catalog = await getModelCatalog();

      const models: APIModelDefinition[] = data.data.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        provider: m.id.split("/")[0] || undefined,
      }));

      const ranked = rankProviderModels("openrouter", models, catalog);
      return dedupeProviderModels("openrouter", ranked);
    } finally {
      cleanup();
    }
  },
};
