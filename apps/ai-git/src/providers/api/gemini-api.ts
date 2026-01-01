import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";

// ==============================================================================
// GOOGLE GEMINI API ADAPTER
// ==============================================================================

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Gemini API response shape for models endpoint.
 */
interface GeminiModelsResponse {
  models: Array<{
    name: string;
    displayName: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
}

/**
 * Models to include (filter to only chat-capable models).
 */
const INCLUDED_MODEL_PATTERNS = ["gemini-1.5", "gemini-2.0", "gemini-exp", "gemini-pro"];

/**
 * Models to exclude (vision, embedding, etc).
 */
const EXCLUDED_MODEL_PATTERNS = ["vision", "embedding", "aqa"];

/**
 * Extract model ID from the full resource name.
 * "models/gemini-1.5-flash" -> "gemini-1.5-flash"
 */
function extractModelId(name: string): string {
  return name.replace(/^models\//, "");
}

/**
 * Priority order for Gemini models (lower = higher priority).
 */
const MODEL_PRIORITY: Record<string, number> = {
  "gemini-2.0-flash": 0,
  "gemini-1.5-pro": 1,
  "gemini-1.5-flash": 2,
  "gemini-2.0-flash-thinking": 3,
  "gemini-exp": 4,
  "gemini-1.5-flash-8b": 5,
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
 * Google Gemini API adapter using Vercel AI SDK.
 */
export const geminiApiAdapter: APIProviderAdapter = {
  providerId: "gemini-api",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("gemini-api");

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
    try {
      const apiKey = await getApiKey("gemini-api");
      return !!apiKey;
    } catch {
      return false;
    }
  },

  async fetchModels(providedApiKey?: string): Promise<APIModelDefinition[]> {
    const apiKey = await getApiKey("gemini-api", providedApiKey);

    const { controller, cleanup } = createTimeoutController();

    try {
      const response = await fetch(`${BASE_URL}/models?key=${apiKey}`, {
        headers: {
          ...COMMON_HEADERS,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as GeminiModelsResponse;

      // Filter to relevant models
      const filteredModels = data.models.filter((m) => {
        const modelId = extractModelId(m.name);

        // Must match an included pattern
        const isIncluded = INCLUDED_MODEL_PATTERNS.some((pattern) =>
          modelId.includes(pattern)
        );
        if (!isIncluded) return false;

        // Must not match excluded patterns
        const isExcluded = EXCLUDED_MODEL_PATTERNS.some((pattern) =>
          modelId.toLowerCase().includes(pattern)
        );
        if (isExcluded) return false;

        // Must support generateContent
        if (m.supportedGenerationMethods) {
          return m.supportedGenerationMethods.includes("generateContent");
        }

        return true;
      });

      // Map and sort by priority
      const models: APIModelDefinition[] = filteredModels
        .map((m) => ({
          id: extractModelId(m.name),
          name: m.displayName || extractModelId(m.name),
        }))
        .sort((a, b) => getModelPriority(a.id) - getModelPriority(b.id));

      // Remove duplicates (keep first occurrence which is highest priority)
      const seen = new Set<string>();
      return models.filter((m) => {
        // Normalize: remove version suffixes for deduplication
        const baseId = m.id.replace(/-\d{3}$/, "");
        if (seen.has(baseId)) return false;
        seen.add(baseId);
        return true;
      });
    } finally {
      cleanup();
    }
  },
};
