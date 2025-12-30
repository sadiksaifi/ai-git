import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";

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
 * Models to include (filter out fine-tuned, embedding, and legacy models).
 */
const INCLUDED_MODEL_PREFIXES = [
  "gpt-4",
  "gpt-3.5",
  "o1",
  "o3",
];

/**
 * Models to exclude (internal or specialized models).
 */
const EXCLUDED_MODEL_PATTERNS = [
  "instruct",
  "vision",
  "audio",
  "realtime",
  "embedding",
  "whisper",
  "tts",
  "dall-e",
  "babbage",
  "davinci",
];

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
    "o1": "o1 (Reasoning)",
    "o1-mini": "o1 Mini (Reasoning)",
    "o1-preview": "o1 Preview",
    "o3-mini": "o3 Mini (Reasoning)",
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
 * Priority order for OpenAI models (lower = higher priority).
 */
const MODEL_PRIORITY: Record<string, number> = {
  "gpt-4o-mini": 0,
  "gpt-4o": 1,
  "o1-mini": 2,
  "o1": 3,
  "o3-mini": 4,
  "gpt-4-turbo": 5,
  "gpt-4": 6,
  "gpt-3.5-turbo": 7,
};

/**
 * OpenAI API adapter using Vercel AI SDK.
 */
export const openAIAdapter: APIProviderAdapter = {
  providerId: "openai",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("openai");

    const openai = createOpenAI({
      apiKey,
    });

    const { text } = await generateText({
      model: openai(model),
      prompt,
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

      // Filter to relevant models
      const filteredModels = data.data.filter((m) => {
        // Must start with an included prefix
        const hasIncludedPrefix = INCLUDED_MODEL_PREFIXES.some((prefix) =>
          m.id.startsWith(prefix)
        );
        if (!hasIncludedPrefix) return false;

        // Must not contain excluded patterns
        const hasExcludedPattern = EXCLUDED_MODEL_PATTERNS.some((pattern) =>
          m.id.toLowerCase().includes(pattern)
        );
        return !hasExcludedPattern;
      });

      // Map and sort by priority
      const models: APIModelDefinition[] = filteredModels
        .map((m) => ({
          id: m.id,
          name: getModelDisplayName(m.id),
        }))
        .sort((a, b) => {
          // Get base model name for priority lookup
          const getPriority = (id: string): number => {
            for (const [key, priority] of Object.entries(MODEL_PRIORITY)) {
              if (id.startsWith(key)) return priority;
            }
            return 100;
          };
          return getPriority(a.id) - getPriority(b.id);
        });

      // Remove duplicates (keep first occurrence which is highest priority)
      const seen = new Set<string>();
      return models.filter((m) => {
        // Normalize: "gpt-4o-2024-11-20" -> "gpt-4o"
        const baseId = m.id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
        if (seen.has(baseId)) return false;
        seen.add(baseId);
        return true;
      });
    } finally {
      cleanup();
    }
  },
};
