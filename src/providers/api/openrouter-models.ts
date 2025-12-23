import * as path from "node:path";
import { CACHE_DIR } from "../../config.ts";

// ==============================================================================
// OPENROUTER DYNAMIC MODELS FETCHER
// ==============================================================================

/**
 * OpenRouter model information from the API.
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
  };
}

/**
 * Cache structure for storing fetched models.
 */
interface ModelCache {
  timestamp: number;
  models: OpenRouterModel[];
}

/**
 * Path to the models cache file.
 */
const CACHE_FILE = path.join(CACHE_DIR, "openrouter-models.json");

/**
 * Cache TTL in milliseconds (24 hours).
 */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * OpenRouter API endpoint for models.
 */
const MODELS_API_URL = "https://openrouter.ai/api/v1/models";

/**
 * Curated list of top-tier models to prioritize.
 */
const CURATED_MODELS = [
  // User Provided Futuristic Models (Prioritized)
  "anthropic/claude-sonnet-4-5-20250929",
  "openai/gpt-5.2",
  "google/gemini-3-pro-preview",

  // Anthropic
  "anthropic/claude-opus-4-5-20251101",
  "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-3.5-sonnet",

  // OpenAI
  "openai/gpt-5.2-pro",
  "openai/gpt-5-mini",
  "openai/gpt-4o",

  // Google
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-image-preview",
  "google/gemini-2.0-flash-exp",

  // Meta
  "meta-llama/llama-3.1-70b-instruct",
  "meta-llama/llama-3.1-8b-instruct",
  // Mistral
  "mistralai/mistral-large",
];

/**
 * Popular providers to sort first in the list (fallback).
 */
const POPULAR_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "meta-llama",
  "mistralai",
  "cohere",
];

/**
 * Fetch all models from OpenRouter API.
 *
 * @param apiKey - OpenRouter API key (optional, but may be required for some endpoints)
 * @returns Array of OpenRouter models
 */
export async function fetchOpenRouterModels(
  apiKey?: string
): Promise<OpenRouterModel[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(MODELS_API_URL, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as { data: OpenRouterModel[] };
  return data.data || [];
}

/**
 * Load cached models from disk.
 *
 * @returns Cached models or undefined if cache doesn't exist or is expired
 */
async function loadCachedModels(): Promise<OpenRouterModel[] | undefined> {
  try {
    const file = Bun.file(CACHE_FILE);
    const exists = await file.exists();

    if (!exists) {
      return undefined;
    }

    const content = await file.text();
    const cache = JSON.parse(content) as ModelCache;

    // Check if cache is expired
    if (Date.now() - cache.timestamp > CACHE_TTL) {
      return undefined;
    }

    return cache.models;
  } catch {
    return undefined;
  }
}

/**
 * Save models to cache.
 *
 * @param models - Models to cache
 */
async function saveCachedModels(models: OpenRouterModel[]): Promise<void> {
  try {
    // Ensure cache directory exists
    const { mkdir } = await import("node:fs/promises");
    await mkdir(CACHE_DIR, { recursive: true });

    const cache: ModelCache = {
      timestamp: Date.now(),
      models,
    };

    await Bun.write(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // Silently fail - caching is optional
  }
}

/**
 * Get OpenRouter models, using cache if available.
 *
 * @param apiKey - OpenRouter API key
 * @param forceRefresh - Force refresh from API, ignoring cache
 * @returns Array of OpenRouter models
 */
export async function getOpenRouterModels(
  apiKey?: string,
  forceRefresh = false
): Promise<OpenRouterModel[]> {
  // Try cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = await loadCachedModels();
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  // Fetch from API
  const models = await fetchOpenRouterModels(apiKey);

  // Cache the results
  await saveCachedModels(models);

  return models;
}

/**
 * Filter models to only include text generation models.
 * Excludes image-only, audio-only, and embedding models.
 *
 * @param models - All models
 * @returns Filtered models that support text input and output
 */
export function filterTextModels(models: OpenRouterModel[]): OpenRouterModel[] {
  return models.filter((model) => {
    const { input_modalities, output_modalities } = model.architecture || {};

    // Must support text input
    const hasTextInput = input_modalities?.includes("text") ?? true;

    // Must support text output
    const hasTextOutput = output_modalities?.includes("text") ?? true;

    return hasTextInput && hasTextOutput;
  });
}

/**
 * Sort models by relevance for commit message generation.
 *
 * Priority:
 * 1. Popular providers (Anthropic, OpenAI, Google, etc.)
 * 2. Alphabetically by name within each provider
 *
 * @param models - Models to sort
 * @returns Sorted models
 */
export function sortModelsByRelevance(
  models: OpenRouterModel[]
): OpenRouterModel[] {
  return [...models].sort((a, b) => {
    // 1. Curated models always on top
    const aCuratedIndex = CURATED_MODELS.indexOf(a.id);
    const bCuratedIndex = CURATED_MODELS.indexOf(b.id);

    if (aCuratedIndex !== -1 && bCuratedIndex !== -1) {
      return aCuratedIndex - bCuratedIndex;
    }
    if (aCuratedIndex !== -1) return -1;
    if (bCuratedIndex !== -1) return 1;

    // 2. Popular providers
    const aProvider = a.id.split("/")[0] ?? "";
    const bProvider = b.id.split("/")[0] ?? "";

    const aPopularIndex = POPULAR_PROVIDERS.indexOf(aProvider);
    const bPopularIndex = POPULAR_PROVIDERS.indexOf(bProvider);

    if (aPopularIndex !== bPopularIndex) {
      // If one is popular and the other isn't, popular wins
      if (aPopularIndex === -1) return 1;
      if (bPopularIndex === -1) return -1;
      // Both are popular, sort by their order in the list
      return aPopularIndex - bPopularIndex;
    }

    // 3. Alphabetical sort
    return a.name.localeCompare(b.name);
  });
}

/**
 * Get filtered and sorted models ready for display.
 *
 * @param apiKey - OpenRouter API key
 * @param forceRefresh - Force refresh from API
 * @returns Filtered and sorted models
 */
export async function getDisplayModels(
  apiKey?: string,
  forceRefresh = false
): Promise<OpenRouterModel[]> {
  const models = await getOpenRouterModels(apiKey, forceRefresh);
  const filtered = filterTextModels(models);
  const sorted = sortModelsByRelevance(filtered);
  return sorted;
}

/**
 * Format context length for display.
 *
 * @param contextLength - Context length in tokens
 * @returns Formatted string (e.g., "128K", "1M")
 */
export function formatContextLength(contextLength: number): string {
  if (contextLength >= 1_000_000) {
    return `${(contextLength / 1_000_000).toFixed(1)}M`;
  }
  if (contextLength >= 1_000) {
    return `${Math.round(contextLength / 1_000)}K`;
  }
  return String(contextLength);
}

/**
 * Clear the models cache.
 */
export async function clearModelsCache(): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(CACHE_FILE);
  } catch {
    // Silently fail if file doesn't exist
  }
}
