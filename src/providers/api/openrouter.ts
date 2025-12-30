import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";
import { rankModels, getProviderFromModelId } from "../../lib/model-ranking.ts";
import type { CachedModel } from "../../lib/model-cache.ts";

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

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("openrouter");

    const openrouter = createOpenRouter({
      apiKey,
    });

    const { text } = await generateText({
      model: openrouter(model),
      prompt,
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

      // Map to CachedModel format for ranking
      const models: CachedModel[] = data.data.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        provider: getProviderFromModelId(m.id),
      }));

      // Apply ranking (featured models first)
      const rankedModels = rankModels(models);

      // Return as APIModelDefinition
      return rankedModels.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
      }));
    } finally {
      cleanup();
    }
  },
};
