import { generateText } from "ai";
import { createCerebras } from "@ai-sdk/cerebras";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import {
  getApiKey,
  createTimeoutController,
  COMMON_HEADERS,
  formatProviderError,
} from "./utils.ts";
import { dedupeProviderModels, getModelCatalog, rankProviderModels } from "./models/index.ts";

// ==============================================================================
// CEREBRAS API ADAPTER
// ==============================================================================

const BASE_URL = "https://api.cerebras.ai/v1";

/**
 * Cerebras API response shape for models endpoint.
 */
interface CerebrasModelsResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

/**
 * Get a human-readable name for a Cerebras model from its ID.
 * The Cerebras models endpoint returns IDs only.
 */
export function getModelDisplayName(modelId: string): string {
  return modelId
    .split("-")
    .map((word) =>
      /^(?:gpt|oss|glm|zai|\d+b)$/i.test(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/**
 * Cerebras API adapter using Vercel AI SDK.
 */
export const cerebrasAdapter: APIProviderAdapter = {
  providerId: "cerebras",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("cerebras");

    const cerebras = createCerebras({ apiKey });

    const { text } = await generateText({
      model: cerebras(model),
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
      const apiKey = await getApiKey("cerebras");
      return !!apiKey;
    } catch {
      return false;
    }
  },

  async fetchModels(providedApiKey?: string): Promise<APIModelDefinition[]> {
    const apiKey = await getApiKey("cerebras", providedApiKey);

    const { controller, cleanup } = createTimeoutController();

    try {
      const response = await fetch(`${BASE_URL}/models`, {
        headers: {
          ...COMMON_HEADERS,
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = formatProviderError("Cerebras", response.status, errorText);
        throw new Error(`${err.userMessage}: ${err.suggestion}`);
      }

      const data = (await response.json()) as CerebrasModelsResponse;
      const catalog = await getModelCatalog();

      const models: APIModelDefinition[] = data.data.map((m) => ({
        id: m.id,
        name: getModelDisplayName(m.id),
      }));

      const ranked = rankProviderModels("cerebras", models, catalog);
      return dedupeProviderModels("cerebras", ranked);
    } finally {
      cleanup();
    }
  },
};
