import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import {
  getApiKey,
  createTimeoutController,
  COMMON_HEADERS,
  formatProviderError,
} from "./utils.ts";
import { dedupeProviderModels, getModelCatalog, rankProviderModels } from "./models/index.ts";
import type { ModelCatalog } from "./models/types.ts";

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
 * Uses the models.dev name when the catalog lists the exact ID.
 */
export function getModelDisplayName(modelId: string, catalog: ModelCatalog): string {
  const catalogName = catalog.providers.openai.models[modelId]?.name;
  if (catalogName) return catalogName;

  return modelId
    .split("-")
    .map((word) => (/^gpt$/i.test(word) ? "GPT" : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/**
 * Check if a model ID is a reasoning model that doesn't support temperature.
 * Uses the models.dev `reasoning` flag when the catalog lists the model;
 * otherwise treats o-series and GPT-5 or later as reasoning models.
 */
export function isReasoningModel(modelId: string, catalog: ModelCatalog | null): boolean {
  const metadata = catalog?.providers.openai.models[modelId];
  if (metadata) return metadata.reasoning;
  return /^(?:o\d|gpt-(?:[5-9]|\d{2,}))/.test(modelId);
}

async function loadCatalogForInvoke(): Promise<ModelCatalog | null> {
  try {
    return await getModelCatalog({ signal: AbortSignal.timeout(2000) });
  } catch {
    return null;
  }
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
    const reasoning = isReasoningModel(model, await loadCatalogForInvoke());

    const { text } = await generateText({
      model: openai(model),
      system,
      prompt,
      maxOutputTokens: 1024,
      timeout: 60_000,
      maxRetries: 2,
      ...(reasoning ? {} : { temperature: 0 }),
      providerOptions: {
        openai: {
          // The SDK's own reasoning-model check lags new families (e.g. GPT-6),
          // and it drops reasoningEffort for models it does not recognize.
          ...(reasoning ? { forceReasoning: true, reasoningEffort: "low" as const } : {}),
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
        const err = formatProviderError("OpenAI", response.status, errorText);
        throw new Error(`${err.userMessage}: ${err.suggestion}`);
      }

      const data = (await response.json()) as OpenAIModelsResponse;
      const catalog = await getModelCatalog();

      const models: APIModelDefinition[] = data.data.map((m) => ({
        id: m.id,
        name: getModelDisplayName(m.id, catalog),
      }));

      const ranked = rankProviderModels("openai", models, catalog);
      return dedupeProviderModels("openai", ranked);
    } finally {
      cleanup();
    }
  },
};
