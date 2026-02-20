import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";
import {
  dedupeProviderModels,
  getModelCatalog,
  rankProviderModels,
} from "./models/index.ts";

// ==============================================================================
// ANTHROPIC API ADAPTER
// ==============================================================================

const BASE_URL = "https://api.anthropic.com/v1";

/**
 * Anthropic API response shape for models endpoint.
 */
interface AnthropicModelsResponse {
  data: Array<{
    id: string;
    display_name: string;
    type: string;
    created_at?: string;
  }>;
  has_more: boolean;
  first_id?: string;
  last_id?: string;
}

/**
 * Get a human-readable name for an Anthropic model.
 */
function getModelDisplayName(model: { id: string; display_name?: string }): string {
  if (model.display_name) return model.display_name;

  // Fallback: convert model ID to readable name
  // e.g., "claude-3-5-haiku-latest" -> "Claude 3.5 Haiku"
  return model.id
    .replace("claude-", "Claude ")
    .replace(/-latest$/, "")
    .replace(/-(\d+)-(\d+)/, " $1.$2")
    .replace(/-/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Anthropic API adapter using Vercel AI SDK.
 */
export const anthropicAdapter: APIProviderAdapter = {
  providerId: "anthropic",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("anthropic");

    const anthropic = createAnthropic({ apiKey });

    const { text } = await generateText({
      model: anthropic(model),
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
      const apiKey = await getApiKey("anthropic");
      return !!apiKey;
    } catch {
      return false;
    }
  },

  async fetchModels(providedApiKey?: string): Promise<APIModelDefinition[]> {
    const apiKey = await getApiKey("anthropic", providedApiKey);

    const { controller, cleanup } = createTimeoutController();

    try {
      const response = await fetch(`${BASE_URL}/models`, {
        headers: {
          ...COMMON_HEADERS,
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as AnthropicModelsResponse;

      const catalog = await getModelCatalog();

      // Filter to only model types
      const chatModels = data.data.filter((m) => m.type === "model");

      // Map, rank, and dedupe through shared model catalog utilities.
      const models: APIModelDefinition[] = chatModels
        .map((m) => ({
          id: m.id,
          name: getModelDisplayName(m),
        }));

      const ranked = rankProviderModels("anthropic", models, catalog);
      return dedupeProviderModels("anthropic", ranked);
    } finally {
      cleanup();
    }
  },
};
