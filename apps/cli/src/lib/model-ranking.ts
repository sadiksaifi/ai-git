import type { CachedModel } from "./model-cache.ts";
import {
  createSnapshotModelCatalog,
} from "../providers/api/models/catalog.ts";
import {
  dedupeProviderModels,
  findRecommendedModel,
  rankProviderModels,
} from "../providers/api/models/ranking.ts";
import type {
  SupportedAPIProviderId,
} from "../providers/api/models/types.ts";

// ==============================================================================
// COMPATIBILITY WRAPPER
// Delegates to shared provider model catalog + ranking utilities.
// ==============================================================================

export const POPULAR_PROVIDERS = ["anthropic", "openai", "google"] as const;

export const FEATURED_MODELS: Record<string, string[]> = {
  anthropic: [
    "anthropic/claude-sonnet-4-5",
    "anthropic/claude-haiku-4-5",
    "anthropic/claude-opus-4-6",
    "anthropic/claude-3.7-sonnet",
  ],
  openai: [
    "openai/gpt-5.2",
    "openai/gpt-5-mini",
    "openai/o3",
    "openai/gpt-4.1",
  ],
  google: [
    "google/gemini-3-pro-preview",
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    "google/gemini-flash-latest",
  ],
};

export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4-5";

export const DEFAULT_MODELS: Record<string, string> = {
  openrouter: DEFAULT_OPENROUTER_MODEL,
  anthropic: "claude-3-7-sonnet-latest",
  openai: "gpt-5-mini",
  "google-ai-studio": "gemini-2.5-flash",
};

const SNAPSHOT_CATALOG = createSnapshotModelCatalog();

function isSupportedProvider(providerId: string): providerId is SupportedAPIProviderId {
  return (
    providerId === "openrouter" ||
    providerId === "anthropic" ||
    providerId === "openai" ||
    providerId === "google-ai-studio"
  );
}

/**
 * Get the provider from an OpenRouter model ID.
 */
export function getProviderFromModelId(modelId: string): string {
  const [provider] = modelId.split("/");
  return provider || modelId;
}

/**
 * Check if a model ID is from a popular provider.
 */
export function isPopularProvider(modelId: string): boolean {
  const provider = getProviderFromModelId(modelId);
  return POPULAR_PROVIDERS.includes(provider as (typeof POPULAR_PROVIDERS)[number]);
}

/**
 * Check if a model is a featured model.
 */
export function isFeaturedModel(modelId: string): boolean {
  const provider = getProviderFromModelId(modelId);
  const featuredForProvider = FEATURED_MODELS[provider];
  return featuredForProvider ? featuredForProvider.includes(modelId) : false;
}

/**
 * Rank OpenRouter models using shared provider-layer utilities.
 */
export function rankModels(models: CachedModel[]): CachedModel[] {
  const normalized = models.map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider || getProviderFromModelId(model.id),
  }));

  const ranked = dedupeProviderModels(
    "openrouter",
    rankProviderModels("openrouter", normalized, SNAPSHOT_CATALOG)
  );

  return ranked.map((model, index) => ({
    ...model,
    provider: model.provider || getProviderFromModelId(model.id),
    rank: index,
  }));
}

/**
 * Find the default/recommended model in a list.
 */
export function findDefaultModel(
  models: CachedModel[],
  providerId: string
): string | null {
  if (models.length === 0) return null;

  if (isSupportedProvider(providerId)) {
    const recommended = findRecommendedModel(providerId, models, SNAPSHOT_CATALOG, "balanced");
    if (recommended) return recommended;
  }

  const fallbackDefault = DEFAULT_MODELS[providerId];
  if (fallbackDefault) {
    const exact = models.find((model) => model.id === fallbackDefault);
    if (exact) return exact.id;
  }

  return models[0]?.id ?? null;
}
