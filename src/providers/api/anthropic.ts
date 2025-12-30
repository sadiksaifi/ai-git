import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";

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
 * Priority order for Anthropic models (lower = higher priority).
 */
const MODEL_PRIORITY: Record<string, number> = {
  // Claude 4.5 (latest)
  "claude-3-5-haiku": 0,
  "claude-sonnet-4": 1,
  "claude-opus-4": 2,
  // Claude 3.5
  "claude-3-5-sonnet": 3,
  // Claude 3
  "claude-3-haiku": 4,
  "claude-3-sonnet": 5,
  "claude-3-opus": 6,
};

/**
 * Get priority for a model (lower = higher priority).
 */
function getModelPriority(modelId: string): number {
  for (const [key, priority] of Object.entries(MODEL_PRIORITY)) {
    if (modelId.includes(key)) return priority;
  }
  return 100;
}

/**
 * Anthropic API adapter using Vercel AI SDK.
 */
export const anthropicAdapter: APIProviderAdapter = {
  providerId: "anthropic",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("anthropic");

    const anthropic = createAnthropic({
      apiKey,
    });

    const { text } = await generateText({
      model: anthropic(model),
      prompt,
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

      // Filter to only model types
      const chatModels = data.data.filter((m) => m.type === "model");

      // Map and sort by priority
      const models: APIModelDefinition[] = chatModels
        .map((m) => ({
          id: m.id,
          name: getModelDisplayName(m),
        }))
        .sort((a, b) => getModelPriority(a.id) - getModelPriority(b.id));

      return models;
    } finally {
      cleanup();
    }
  },
};
