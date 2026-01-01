import type { CachedModel } from "./model-cache.ts";

// ==============================================================================
// POPULAR PROVIDERS & FEATURED MODELS
// ==============================================================================

/**
 * Popular providers that should be prioritized in model lists.
 * Order matters - first provider's models appear first.
 */
export const POPULAR_PROVIDERS = ["anthropic", "openai", "google"] as const;

/**
 * Featured models per provider (for OpenRouter).
 * These are the top models that should appear first in the selection list.
 * Models are listed in priority order within each provider.
 *
 * Note: Model IDs use OpenRouter's format: "provider/model-name"
 */
export const FEATURED_MODELS: Record<string, string[]> = {
  anthropic: [
    "anthropic/claude-3.5-haiku", // Latest Haiku (recommended for speed/cost)
    "anthropic/claude-sonnet-4", // Latest Sonnet
    "anthropic/claude-3.5-sonnet", // Previous Sonnet (widely used)
    "anthropic/claude-opus-4", // Latest Opus (most capable)
  ],
  openai: [
    "openai/gpt-4o-mini", // Fast & cost-effective
    "openai/gpt-4o", // Latest GPT-4o
    "openai/gpt-4-turbo", // GPT-4 Turbo
    "openai/o1-mini", // Reasoning model
  ],
  google: [
    "google/gemini-2.0-flash-001", // Latest Flash
    "google/gemini-1.5-pro", // Pro model
    "google/gemini-1.5-flash", // Previous Flash
    "google/gemini-2.0-flash-thinking-exp", // Experimental thinking
  ],
};

/**
 * Default recommended model for OpenRouter.
 */
export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-3.5-haiku";

/**
 * Default recommended models per direct API provider.
 */
export const DEFAULT_MODELS: Record<string, string> = {
  openrouter: "anthropic/claude-3.5-haiku",
  anthropic: "claude-3-5-haiku-latest",
  openai: "gpt-4o-mini",
  "gemini": "gemini-2.0-flash",
};

// ==============================================================================
// RANKING FUNCTIONS
// ==============================================================================

/**
 * Get the provider from an OpenRouter model ID.
 * OpenRouter model IDs follow the format: "provider/model-name"
 *
 * @param modelId - The full model ID (e.g., "anthropic/claude-3.5-haiku")
 * @returns The provider portion (e.g., "anthropic")
 */
export function getProviderFromModelId(modelId: string): string {
  const parts = modelId.split("/");
  return parts[0] || modelId;
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
  if (!featuredForProvider) return false;
  return featuredForProvider.includes(modelId);
}

/**
 * Get the rank of a featured model (lower = higher priority).
 * Returns a high number for non-featured models.
 */
function getFeaturedRank(modelId: string): number {
  const provider = getProviderFromModelId(modelId);
  const providerIndex = POPULAR_PROVIDERS.indexOf(
    provider as (typeof POPULAR_PROVIDERS)[number]
  );

  if (providerIndex === -1) return 1000; // Not a popular provider

  const featuredForProvider = FEATURED_MODELS[provider];
  if (!featuredForProvider) return 1000;

  const modelIndex = featuredForProvider.indexOf(modelId);
  if (modelIndex === -1) return 500 + providerIndex * 10; // Popular provider but not featured

  // Featured model: rank by provider order, then model order within provider
  // e.g., anthropic models: 0-3, openai models: 10-13, google models: 20-23
  return providerIndex * 10 + modelIndex;
}

/**
 * Rank models for display in the selection list.
 *
 * Ranking order:
 * 1. Featured models from popular providers (in FEATURED_MODELS order)
 * 2. Other models from popular providers
 * 3. All other models (alphabetically)
 *
 * @param models - The unranked model list
 * @returns The ranked model list with rank property set
 */
export function rankModels(models: CachedModel[]): CachedModel[] {
  // Add provider and rank to each model
  const rankedModels = models.map((model) => ({
    ...model,
    provider: model.provider || getProviderFromModelId(model.id),
    rank: getFeaturedRank(model.id),
  }));

  // Sort by rank (ascending), then alphabetically by name
  return rankedModels.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Find the default/recommended model in a list.
 * @param models - The model list to search
 * @param providerId - The provider ID to get the default for
 * @returns The default model ID, or the first model if not found
 */
export function findDefaultModel(
  models: CachedModel[],
  providerId: string
): string | null {
  if (models.length === 0) return null;

  const defaultModelId = DEFAULT_MODELS[providerId];
  if (defaultModelId) {
    // Try to find exact match
    const exactMatch = models.find((m) => m.id === defaultModelId);
    if (exactMatch) return exactMatch.id;

    // Try partial match (for cases like "claude-3.5-haiku" matching "claude-3-5-haiku-latest")
    const partialMatch = models.find(
      (m) =>
        m.id.includes(defaultModelId) ||
        defaultModelId.includes(m.id) ||
        m.name.toLowerCase().includes(defaultModelId.toLowerCase())
    );
    if (partialMatch) return partialMatch.id;
  }

  // Fall back to first model (which should be highest ranked after ranking)
  return models[0]?.id ?? null;
}
