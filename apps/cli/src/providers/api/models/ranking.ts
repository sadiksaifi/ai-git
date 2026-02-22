import type { APIModelDefinition } from "../../types.ts";
import { getCatalogModelMetadata, isDeprecatedModel } from "./catalog.ts";
import { MODEL_TIER_ORDER, PROVIDER_MODEL_RULES, matchesProviderRules } from "./provider-rules.ts";
import type { ModelCatalog, ModelTier, RankedModel, SupportedAPIProviderId } from "./types.ts";

export type RecommendationPolicy = "balanced" | "speed" | "capability";

const TIER_INDEX = new Map<ModelTier, number>(MODEL_TIER_ORDER.map((tier, index) => [tier, index]));

function rankModelsDetailed(
  providerId: SupportedAPIProviderId,
  models: APIModelDefinition[],
  catalog: ModelCatalog,
): RankedModel[] {
  const rules = PROVIDER_MODEL_RULES[providerId];

  const ranked = models
    .filter((model) => matchesProviderRules(providerId, model.id))
    .map((model) => {
      const metadata = getCatalogModelMetadata(providerId, model, catalog);
      const tier = rules.resolveTier({ providerId, model, metadata });
      const providerRank = rules.resolveProviderRank?.(model) ?? 0;
      const updatedAt = metadata?.lastUpdated || metadata?.releaseDate || "";

      return {
        ...model,
        tier,
        providerRank,
        knownInCatalog: metadata !== null,
        deprecated: isDeprecatedModel(metadata),
        updatedAt,
      };
    })
    .filter((model) => !model.deprecated)
    .sort((a, b) => {
      const tierDiff = (TIER_INDEX.get(a.tier) ?? 999) - (TIER_INDEX.get(b.tier) ?? 999);
      if (tierDiff !== 0) return tierDiff;

      const providerDiff = a.providerRank - b.providerRank;
      if (providerDiff !== 0) return providerDiff;

      if (a.knownInCatalog !== b.knownInCatalog) {
        return a.knownInCatalog ? -1 : 1;
      }

      const updatedDiff = b.updatedAt.localeCompare(a.updatedAt);
      if (updatedDiff !== 0) return updatedDiff;

      const nameDiff = a.name.localeCompare(b.name);
      if (nameDiff !== 0) return nameDiff;

      return a.id.localeCompare(b.id);
    });

  return ranked;
}

export function rankProviderModels(
  providerId: SupportedAPIProviderId,
  models: APIModelDefinition[],
  catalog: ModelCatalog,
): APIModelDefinition[] {
  return rankModelsDetailed(providerId, models, catalog).map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
  }));
}

export function dedupeProviderModels(
  providerId: SupportedAPIProviderId,
  models: APIModelDefinition[],
): APIModelDefinition[] {
  const rules = PROVIDER_MODEL_RULES[providerId];
  const seen = new Set<string>();

  return models.filter((model) => {
    const dedupeKey = rules.dedupeKey(model.id);
    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
}

export function findRecommendedModel(
  providerId: SupportedAPIProviderId,
  models: APIModelDefinition[],
  catalog: ModelCatalog,
  policy: RecommendationPolicy = "balanced",
): string | null {
  if (models.length === 0) return null;

  const ranked = dedupeProviderModels(providerId, rankProviderModels(providerId, models, catalog));
  if (ranked.length === 0) return null;

  const detailed = rankModelsDetailed(providerId, ranked, catalog);

  const preferredTiers: ModelTier[] =
    policy === "speed"
      ? ["fast", "default", "reasoning", "legacy", "other"]
      : policy === "capability"
        ? ["reasoning", "default", "fast", "legacy", "other"]
        : ["default", "fast", "reasoning", "legacy", "other"];

  for (const tier of preferredTiers) {
    const selected = detailed.find((model) => model.tier === tier);
    if (selected) {
      return selected.id;
    }
  }

  return ranked[0]?.id ?? null;
}
