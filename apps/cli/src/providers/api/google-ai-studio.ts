import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";
import {
  dedupeProviderModels,
  getModelCatalog,
  rankProviderModels,
} from "./models/index.ts";

// ==============================================================================
// GOOGLE AI STUDIO ADAPTER
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
 * Extract model ID from the full resource name.
 * "models/gemini-1.5-flash" -> "gemini-1.5-flash"
 */
function extractModelId(name: string): string {
  return name.replace(/^models\//, "");
}

/**
 * Google AI Studio adapter using Vercel AI SDK.
 */
export const googleAiStudioAdapter: APIProviderAdapter = {
  providerId: "google-ai-studio",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("google-ai-studio");

    const google = createGoogleGenerativeAI({ apiKey });

    const { text } = await generateText({
      model: google(model),
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: 1024,
      timeout: 60_000,
      maxRetries: 2,
      // Disable safety filters — code diffs frequently trigger false positives
      // (e.g. security fix descriptions flagged as "dangerous content")
      providerOptions: {
        google: {
          safetySettings: [
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
          ],
        },
      },
    });

    return text;
  },

  async checkAvailable(): Promise<boolean> {
    try {
      const apiKey = await getApiKey("google-ai-studio");
      return !!apiKey;
    } catch {
      return false;
    }
  },

  async fetchModels(providedApiKey?: string): Promise<APIModelDefinition[]> {
    const apiKey = await getApiKey("google-ai-studio", providedApiKey);

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
      const catalog = await getModelCatalog();

      const models: APIModelDefinition[] = data.models
        .filter((m) => {
          // Keep only generative models.
          if (m.supportedGenerationMethods) {
            return m.supportedGenerationMethods.includes("generateContent");
          }
          return true;
        })
        .map((m) => ({
          id: extractModelId(m.name),
          name: m.displayName || extractModelId(m.name),
        }));

      const ranked = rankProviderModels("google-ai-studio", models, catalog);
      return dedupeProviderModels("google-ai-studio", ranked);
    } finally {
      cleanup();
    }
  },
};
