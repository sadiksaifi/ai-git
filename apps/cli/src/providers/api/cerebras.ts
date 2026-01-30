import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { APIProviderAdapter, APIModelDefinition, InvokeOptions } from "../types.ts";
import { getApiKey, createTimeoutController, COMMON_HEADERS } from "./utils.ts";

// ==============================================================================
// CEREBRAS API ADAPTER
// ==============================================================================

const BASE_URL = "https://api.cerebras.ai/v1";

interface CerebrasModelsResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

const INCLUDED_MODEL_PREFIXES = [
  "llama",
  "gpt",
  "qwen",
  "zai",
];

const EXCLUDED_MODEL_PATTERNS = [
  "embedding",
];

function getModelDisplayName(modelId: string): string {
  const nameMap: Record<string, string> = {
    "llama3.1-8b": "Llama 3.1 8B",
    "llama-3.3-70b": "Llama 3.3 70B",
    "gpt-oss-120b": "GPT OSS 120B",
    "qwen-3-32b": "Qwen 3 32B",
    "qwen-3-235b-a22b-instruct-2507": "Qwen 3 235B Instruct (Preview)",
    "zai-glm-4.7": "Z.ai GLM 4.7 (Preview)",
  };

  if (nameMap[modelId]) return nameMap[modelId];

  return modelId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const MODEL_PRIORITY: Record<string, number> = {
  "llama-3.3-70b": 0,
  "llama3.1-8b": 1,
  "gpt-oss-120b": 2,
  "qwen-3-32b": 3,
};

export const cerebrasAdapter: APIProviderAdapter = {
  providerId: "cerebras",
  mode: "api",
  baseUrl: BASE_URL,

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const apiKey = await getApiKey("cerebras");

    const cerebras = createOpenAI({
      apiKey,
      baseURL: BASE_URL,
    });

    const { text } = await generateText({
      model: cerebras(model),
      prompt,
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

      const filteredModels = data.data.filter((m) => {
        const hasIncludedPrefix = INCLUDED_MODEL_PREFIXES.some((prefix) =>
          m.id.startsWith(prefix)
        );
        if (!hasIncludedPrefix) return false;

        const hasExcludedPattern = EXCLUDED_MODEL_PATTERNS.some((pattern) =>
          m.id.toLowerCase().includes(pattern)
        );
        return !hasExcludedPattern;
      });

      const models: APIModelDefinition[] = filteredModels
        .map((m) => ({
          id: m.id,
          name: getModelDisplayName(m.id),
        }))
        .sort((a, b) => {
          const getPriority = (id: string): number => {
            return MODEL_PRIORITY[id] ?? 100;
          };
          return getPriority(a.id) - getPriority(b.id);
        });

      const seen = new Set<string>();
      return models.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    } finally {
      cleanup();
    }
  },
};
