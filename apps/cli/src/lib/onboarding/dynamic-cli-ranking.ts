import type { ModelCatalog, CatalogModelDefinition } from "../../providers/api/models/types.ts";
import { normalizeModelKey } from "../../providers/api/models/provider-rules.ts";
import { parseDynamicVariantModel } from "../../providers/cli/dynamic.ts";
import type { CachedModel } from "../model-cache.ts";

type CatalogBackedProvider = "anthropic" | "openai" | "google";

const PROVIDER_PRIORITY: Array<{ rank: number; aliases: RegExp[] }> = [
  { rank: 0, aliases: [/^openai-codex$/i] },
  { rank: 1, aliases: [/^openai$/i] },
  { rank: 2, aliases: [/^anthropic$/i] },
  { rank: 3, aliases: [/^google$/i, /^gemini$/i] },
  { rank: 4, aliases: [/^moonshot$/i, /^kimi$/i] },
  { rank: 5, aliases: [/^zai$/i, /^glm$/i] },
  { rank: 6, aliases: [/^deepseek$/i] },
  { rank: 7, aliases: [/^qwen$/i, /^alibaba$/i] },
  { rank: 8, aliases: [/^xai$/i, /^grok$/i] },
];

const FAST_TIER_PATTERNS = [
  /(?:^|[-_])(?:mini|flash|haiku|spark|fast|nano|lite|turbo|air)(?:$|[-_])/i,
];
const CAPABILITY_TIER_PATTERNS = [/(?:^|[-_])(?:pro|max|opus|large)(?:$|[-_])/i];
const EFFORT_ORDER = new Map([
  ["none", 0],
  ["minimal", 0],
  ["low", 1],
  ["medium", 2],
  ["high", 3],
  ["xhigh", 4],
  ["max", 5],
]);

interface DynamicModelRankKeys {
  model: CachedModel;
  originalIndex: number;
  providerRank: number;
  version: number[];
  updatedAt: string;
  tierRank: number;
  effortRank: number;
}

function splitProviderAndModel(baseModelId: string): { provider: string; modelId: string } {
  const parts = baseModelId.split("/");
  if (parts.length <= 1) {
    return { provider: "", modelId: baseModelId };
  }

  return {
    provider: parts[0] ?? "",
    modelId: parts.slice(1).join("/") || baseModelId,
  };
}

function normalizeProvider(provider: string, modelId: string): string {
  const normalized = provider.toLowerCase();
  if (normalized) return normalized;

  const lowerModel = modelId.toLowerCase();
  if (lowerModel.startsWith("gpt-") || lowerModel.startsWith("o")) return "openai";
  if (lowerModel.startsWith("claude-")) return "anthropic";
  if (lowerModel.startsWith("gemini-")) return "google";
  if (lowerModel.startsWith("kimi-")) return "kimi";
  if (lowerModel.startsWith("glm-")) return "glm";
  if (lowerModel.startsWith("deepseek-")) return "deepseek";
  if (lowerModel.startsWith("qwen")) return "qwen";
  if (lowerModel.startsWith("grok-")) return "grok";

  return normalized;
}

function getProviderRank(provider: string): number {
  for (const entry of PROVIDER_PRIORITY) {
    if (entry.aliases.some((alias) => alias.test(provider))) {
      return entry.rank;
    }
  }

  return 99;
}

function getCatalogProvider(provider: string): CatalogBackedProvider | null {
  if (provider === "openai" || provider === "openai-codex") return "openai";
  if (provider === "anthropic") return "anthropic";
  if (provider === "google" || provider === "gemini") return "google";
  return null;
}

function findCatalogMetadata(
  catalog: ModelCatalog | null | undefined,
  provider: string,
  modelId: string,
): CatalogModelDefinition | null {
  if (!catalog) return null;

  const catalogProviderId = getCatalogProvider(provider);
  if (!catalogProviderId) return null;

  const providerCatalog = catalog.providers[catalogProviderId];
  const normalized = normalizeModelKey(modelId);
  const exactId = providerCatalog.normalizedModelIndex[normalized];
  if (exactId) return providerCatalog.models[exactId] ?? null;

  let bestMatch: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [normalizedId, actualId] of Object.entries(providerCatalog.normalizedModelIndex)) {
    if (!normalizedId.includes(normalized) && !normalized.includes(normalizedId)) continue;

    const distance = Math.abs(normalizedId.length - normalized.length);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = actualId;
    }
  }

  return bestMatch ? (providerCatalog.models[bestMatch] ?? null) : null;
}

function extractVersion(modelId: string): number[] {
  const id = modelId.toLowerCase();
  const decimalMatch = id.match(/(?:^|[^0-9])(\d+(?:\.\d+)+)(?:[^0-9]|$)/);
  if (decimalMatch?.[1]) {
    return decimalMatch[1].split(".").map((part) => Number.parseInt(part, 10));
  }

  const numbers = id.match(/\d+/g) ?? [];
  return numbers
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => value > 0 && value < 1000)
    .slice(0, 3);
}

function compareVersionDesc(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function getTierRank(modelId: string): number {
  if (FAST_TIER_PATTERNS.some((pattern) => pattern.test(modelId))) return 0;
  if (CAPABILITY_TIER_PATTERNS.some((pattern) => pattern.test(modelId))) return 2;
  return 1;
}

function getEffortRank(variant: string | undefined): number {
  if (!variant) return 0;
  return EFFORT_ORDER.get(variant.toLowerCase()) ?? 99;
}

function toRankKeys(
  model: CachedModel,
  originalIndex: number,
  catalog: ModelCatalog | null | undefined,
): DynamicModelRankKeys {
  const { model: baseModelId, variant } = parseDynamicVariantModel(model.id);
  const { provider, modelId } = splitProviderAndModel(baseModelId);
  const normalizedProvider = normalizeProvider(provider, modelId);
  const metadata = findCatalogMetadata(catalog, normalizedProvider, modelId);

  return {
    model,
    originalIndex,
    providerRank: getProviderRank(normalizedProvider),
    version: extractVersion(modelId),
    updatedAt: metadata?.lastUpdated || metadata?.releaseDate || "",
    tierRank: getTierRank(modelId),
    effortRank: getEffortRank(variant),
  };
}

export function rankDynamicCLIModels(
  models: CachedModel[],
  catalog?: ModelCatalog | null,
): CachedModel[] {
  return models
    .map((model, index) => toRankKeys(model, index, catalog))
    .sort((a, b) => {
      const providerDiff = a.providerRank - b.providerRank;
      if (providerDiff !== 0) return providerDiff;

      const versionDiff = compareVersionDesc(a.version, b.version);
      if (versionDiff !== 0) return versionDiff;

      const updatedDiff = b.updatedAt.localeCompare(a.updatedAt);
      if (updatedDiff !== 0) return updatedDiff;

      const tierDiff = a.tierRank - b.tierRank;
      if (tierDiff !== 0) return tierDiff;

      const effortDiff = a.effortRank - b.effortRank;
      if (effortDiff !== 0) return effortDiff;

      return a.originalIndex - b.originalIndex;
    })
    .map((ranked) => ranked.model);
}
