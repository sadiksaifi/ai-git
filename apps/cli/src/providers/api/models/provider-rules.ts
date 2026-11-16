import type { APIModelDefinition } from "../../types.ts";
import type {
  CatalogModelDefinition,
  CatalogProviderId,
  ModelTier,
  ProviderModelRuleContext,
  ProviderModelRules,
  SupportedAPIProviderId,
} from "./types.ts";

export const DEFAULT_PROVIDER_ORDER: CatalogProviderId[] = ["anthropic", "openai", "google"];

export const MODEL_TIER_ORDER: ModelTier[] = ["default", "fast", "reasoning", "legacy", "other"];

export function normalizeModelKey(modelId: string): string {
  return modelId.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCatalogProviderFromModel(model: APIModelDefinition): CatalogProviderId | null {
  if (
    model.provider === "anthropic" ||
    model.provider === "openai" ||
    model.provider === "google"
  ) {
    return model.provider;
  }

  const [provider] = model.id.split("/");
  if (provider === "anthropic" || provider === "openai" || provider === "google") {
    return provider;
  }

  return null;
}

function stripDateSuffix(id: string): string {
  return id
    .replace(/-\d{4}-\d{2}-\d{2}$/i, "")
    .replace(/-\d{8}$/i, "")
    .replace(/-\d{3}$/i, "");
}

function baseOpenAIModelId(id: string): string {
  return stripDateSuffix(id)
    .replace(/-latest$/i, "")
    .replace(/:(?:free|beta|alpha|extended|thinking)$/i, "");
}

function baseAnthropicModelId(id: string): string {
  return stripDateSuffix(id)
    .replace(/\.([0-9]+)/g, "-$1")
    .replace(/-latest$/i, "")
    .replace(/:(?:thinking|beta|alpha)$/i, "");
}

function baseGoogleModelId(id: string): string {
  return stripDateSuffix(id)
    .replace(/-preview(?:-[\d-]+)?$/i, "")
    .replace(/-latest$/i, "")
    .replace(/:(?:free|beta|alpha)$/i, "");
}

function isLegacyModel(metadata: CatalogModelDefinition | null): boolean {
  if (!metadata?.lastUpdated) return false;
  // Stable cutoff: older catalog entries are treated as legacy in ranking.
  return metadata.lastUpdated < "2025-01-01";
}

/**
 * Assign a ranking tier from model family names, not version numbers, so new
 * releases in a known family rank correctly without code changes. Within a tier,
 * ranking sorts newest first using models.dev dates.
 */
function resolveTierForCatalogProvider(
  catalogProvider: CatalogProviderId,
  modelId: string,
  metadata: CatalogModelDefinition | null,
): ModelTier {
  const id = modelId.toLowerCase();

  if (isLegacyModel(metadata)) {
    return "legacy";
  }

  if (catalogProvider === "anthropic") {
    if (/claude-(?:instant|[12](?:\.\d)?(?:$|-)|3-(?:haiku|sonnet|opus))/.test(id)) {
      return "legacy";
    }
    if (/haiku/.test(id)) {
      return "fast";
    }
    if (/sonnet/.test(id)) {
      return "default";
    }
    if (/thinking|opus|fable/.test(id)) {
      return "reasoning";
    }
    return "other";
  }

  if (catalogProvider === "openai") {
    if (/gpt-3\.5|gpt-4(?:$|-turbo|-\d{4})|0314|0613/.test(id)) {
      return "legacy";
    }
    if (/luna|mini|nano|flash|lite|spark/.test(id)) {
      return "fast";
    }
    if (/^o\d|reason|deep-research|codex/.test(id)) {
      return "reasoning";
    }
    if (/^(?:chat)?gpt-\d/.test(id)) {
      return "default";
    }
    if (/preview/.test(id)) {
      return "legacy";
    }
    return "other";
  }

  if (/gemini-1\.|gemini-2\.0/.test(id)) {
    return "legacy";
  }
  if (/flash/.test(id)) {
    return "fast";
  }
  if (/pro/.test(id)) {
    return "default";
  }
  if (/thinking/.test(id)) {
    return "reasoning";
  }
  return "other";
}

const OPENROUTER_PROVIDER_RANK = new Map<CatalogProviderId, number>([
  ["anthropic", 0],
  ["openai", 1],
  ["google", 2],
]);

function getProviderRankForOpenRouter(model: APIModelDefinition): number {
  const provider = getCatalogProviderFromModel(model);
  if (!provider) return 99;
  return OPENROUTER_PROVIDER_RANK.get(provider) ?? 99;
}

function resolveTier(ctx: ProviderModelRuleContext): ModelTier {
  const catalogProvider =
    ctx.providerId === "openrouter"
      ? getCatalogProviderFromModel(ctx.model)
      : ctx.providerId === "google-ai-studio"
        ? "google"
        : ctx.providerId === "cerebras"
          ? null
          : ctx.providerId;

  if (!catalogProvider) {
    return "other";
  }

  const modelId =
    ctx.providerId === "openrouter"
      ? ctx.model.id.split("/").slice(1).join("/") || ctx.model.id
      : ctx.model.id;

  return resolveTierForCatalogProvider(catalogProvider, modelId, ctx.metadata);
}

export const PROVIDER_MODEL_RULES: Record<SupportedAPIProviderId, ProviderModelRules> = {
  anthropic: {
    includePatterns: [/^claude-/i],
    excludePatterns: [/embed/i, /moderation/i],
    dedupeKey: (modelId: string) => baseAnthropicModelId(modelId),
    resolveCatalogProvider: () => "anthropic",
    resolveTier,
  },
  openai: {
    includePatterns: [/^gpt-/i, /^o\d/i, /^chatgpt-/i, /^codex/i],
    excludePatterns: [
      /embedding/i,
      /audio/i,
      /realtime/i,
      /whisper/i,
      /tts/i,
      /dall-e/i,
      /instruct/i,
      /moderation/i,
      /search-preview/i,
    ],
    dedupeKey: (modelId: string) => baseOpenAIModelId(modelId),
    resolveCatalogProvider: () => "openai",
    resolveTier,
  },
  "google-ai-studio": {
    includePatterns: [/^gemini-/i],
    excludePatterns: [/embedding/i, /aqa/i, /vision/i, /native-audio/i, /tts/i, /image/i],
    dedupeKey: (modelId: string) => baseGoogleModelId(modelId),
    resolveCatalogProvider: () => "google",
    resolveTier,
  },
  openrouter: {
    includePatterns: [/^anthropic\//i, /^openai\//i, /^google\//i],
    excludePatterns: [/\/(?:.*)(?:embedding|audio|realtime|whisper|tts|dall-e)/i, /:free$/i],
    dedupeKey: (modelId: string) => {
      const [provider, ...rest] = modelId.split("/");
      const model = rest.join("/");

      if (provider === "anthropic") return `${provider}/${baseAnthropicModelId(model)}`;
      if (provider === "openai") return `${provider}/${baseOpenAIModelId(model)}`;
      if (provider === "google") return `${provider}/${baseGoogleModelId(model)}`;

      return modelId;
    },
    resolveCatalogProvider: (model: APIModelDefinition) => getCatalogProviderFromModel(model),
    resolveTier,
    resolveProviderRank: getProviderRankForOpenRouter,
  },
  cerebras: {
    // The Cerebras models endpoint lists only models it serves, so accept every family.
    includePatterns: [/./],
    excludePatterns: [/embedding/i, /moderation/i, /tts/i, /whisper/i, /vision/i],
    dedupeKey: (modelId: string) => {
      // Normalize Cerebras model IDs: collapse variant + date suffixes to base model
      return stripDateSuffix(modelId).replace(/-(instruct|thinking)(-\d+)?$/i, "");
    },
    resolveCatalogProvider: () => null, // Not in catalog
    resolveTier: (ctx: ProviderModelRuleContext) => {
      const id = ctx.model.id.toLowerCase();

      // Fast/small models
      if (/8b|7b|3b|1b|mini|lite|flash/.test(id)) {
        return "fast";
      }

      // Reasoning models
      if (/thinking|reasoning|deep/.test(id)) {
        return "reasoning";
      }

      // Large models as default
      if (/70b|120b|235b|32b/.test(id)) {
        return "default";
      }

      return "other";
    },
  },
};

export function matchesProviderRules(providerId: SupportedAPIProviderId, modelId: string): boolean {
  const rules = PROVIDER_MODEL_RULES[providerId];

  const included = rules.includePatterns.some((pattern) => pattern.test(modelId));
  if (!included) return false;

  const excluded = rules.excludePatterns.some((pattern) => pattern.test(modelId));
  return !excluded;
}
