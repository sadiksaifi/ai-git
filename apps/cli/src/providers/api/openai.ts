import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";
import { dedupeProviderModels, getModelCatalog, rankProviderModels } from "./models/index.ts";

// ==============================================================================
// OPENAI API ADAPTER
// ==============================================================================

const BASE_URL = "https://api.openai.com/v1";

/**
 * OpenAI API response shape for models endpoint.
 */
interface OpenAIModelsResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

/**
 * Get a human-readable name for an OpenAI model.
 */
function getModelDisplayName(modelId: string): string {
  // Convert model IDs to readable names
  const nameMap: Record<string, string> = {
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-4": "GPT-4",
    "gpt-3.5-turbo": "GPT-3.5 Turbo",
    o1: "o1 (Reasoning)",
    "o1-mini": "o1 Mini (Reasoning)",
    "o1-preview": "o1 Preview",
    "o1-pro": "o1 Pro (Reasoning)",
    o3: "o3 (Reasoning)",
    "o3-mini": "o3 Mini (Reasoning)",
    "o3-pro": "o3 Pro (Reasoning)",
    "o4-mini": "o4 Mini (Reasoning)",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-5": "GPT-5",
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-5-pro": "GPT-5 Pro",
    "gpt-5.2": "GPT-5.2",
    "gpt-5.2-chat-latest": "GPT-5.2 Chat",
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
 * Check if a model ID is a reasoning model that doesn't support temperature.
 * Covers o-series (o1, o3, o4) and GPT-5 family (hybrid reasoning).
 */
function isReasoningModel(modelId: string): boolean {
  return /^(o1|o3|o4|gpt-5)/.test(modelId);
}

/**
 * OpenAI API adapter using Vercel AI SDK.
 */
export const openAIAdapter: APIProviderAdapter = {
  providerId: "openai",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("openai");

    const openai = createOpenAI({ apiKey });

    const { text } = await generateText({
      model: openai(model),
      system,
      prompt,
      maxOutputTokens: 1024,
      timeout: 60_000,
      maxRetries: 2,
      ...(isReasoningModel(model) ? {} : { temperature: 0 }),
      providerOptions: {
        openai: {
          ...(isReasoningModel(model) ? { reasoningEffort: "low" as const } : {}),
          store: false,
        },
      },
    });

    return text;
  },

  async checkAvailable(): Promise<boolean> {
    try {
      const apiKey = await getApiKey("openai");
      return !!apiKey;
    } catch {
      return false;
    }
  },

  async fetchModels(providedApiKey?: string): Promise<APIModelDefinition[]> {
    const apiKey = await getApiKey("openai", providedApiKey);

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
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as OpenAIModelsResponse;
      const catalog = await getModelCatalog();

      const models: APIModelDefinition[] = data.data.map((m) => ({
        id: m.id,
        name: getModelDisplayName(m.id),
      }));

      const ranked = rankProviderModels("openai", models, catalog);
      return dedupeProviderModels("openai", ranked);
    } finally {
      cleanup();
    }
  },
};
