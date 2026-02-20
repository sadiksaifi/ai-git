import { generateText } from "ai";
import { createCerebras } from "@ai-sdk/cerebras";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";
import {
  dedupeProviderModels,
  getModelCatalog,
  rankProviderModels,
} from "./models/index.ts";

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
 * Get a human-readable name for a Cerebras model.
 */
function getModelDisplayName(modelId: string): string {
  // Convert model IDs to readable names
  const nameMap: Record<string, string> = {
    "llama3.1-8b": "Llama 3.1 8B",
    "llama-3.3-70b": "Llama 3.3 70B",
    "gpt-oss-120b": "GPT-OSS 120B",
    "qwen-3-32b": "Qwen 3 32B",
    "qwen-3-235b-a22b-instruct-2507": "Qwen 3 235B Instruct",
    "qwen-3-235b-a22b-thinking-2507": "Qwen 3 235B Thinking",
    "zai-glm-4.6": "ZAI GLM 4.6",
    "zai-glm-4.7": "ZAI GLM 4.7",
  };

  // Check for exact match
  if (nameMap[modelId]) return nameMap[modelId];

  // Check for prefix match
  for (const [prefix, name] of Object.entries(nameMap)) {
    if (modelId.startsWith(prefix)) {
      const suffix = modelId.slice(prefix.length);
      if (suffix) return `${name} ${suffix}`;
      return name;
    }
  }

  // Fall back to formatted ID
  return modelId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
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
      temperature: 0.3,
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
        throw new Error(`Cerebras API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as CerebrasModelsResponse;
      const catalog = await getModelCatalog();

      const models: APIModelDefinition[] = data.data
        .map((m) => ({
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
