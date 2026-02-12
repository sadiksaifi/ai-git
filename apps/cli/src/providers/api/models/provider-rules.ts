import type {
  APIModelDefinition,
} from "../../types.ts";
import type {
  CatalogModelDefinition,
  CatalogProviderId,
  ModelTier,
  ProviderModelRuleContext,
  ProviderModelRules,
  SupportedAPIProviderId,
} from "./types.ts";

export const DEFAULT_PROVIDER_ORDER: CatalogProviderId[] = [
  "anthropic",
  "openai",
  "google",
];

export const MODEL_TIER_ORDER: ModelTier[] = [
  "default",
  "fast",
  "reasoning",
  "legacy",
  "other",
];

export function normalizeModelKey(modelId: string): string {
  return modelId.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCatalogProviderFromModel(model: APIModelDefinition): CatalogProviderId | null {
  if (model.provider === "anthropic" || model.provider === "openai" || model.provider === "google") {
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

function resolveTierForCatalogProvider(
  catalogProvider: CatalogProviderId,
  modelId: string,
  metadata: CatalogModelDefinition | null
): ModelTier {
  const id = modelId.toLowerCase();

  if (catalogProvider === "anthropic") {
    if (/claude-(sonnet|haiku)-4-5|claude-3-7-sonnet|claude-3-5-haiku/.test(id)) {
      return "default";
    }
    if (/haiku|mini|flash|lite/.test(id)) {
      return "fast";
    }
    if (/thinking|opus/.test(id)) {
      return "reasoning";
    }
    if (/claude-3-(haiku|sonnet|opus)/.test(id) || isLegacyModel(metadata)) {
      return "legacy";
    }
    return "other";
  }

  if (catalogProvider === "openai") {
    if (/^gpt-5(?:$|\.|-chat-latest|-pro)/.test(id) || /^gpt-4\.1$/.test(id) || /^gpt-4o$/.test(id)) {
      return "default";
    }
    if (/mini|nano|flash|lite/.test(id)) {
      return "fast";
    }
    if (/^o\d|reason|deep-research|codex/.test(id)) {
      return "reasoning";
    }
    if (/gpt-3\.5|gpt-4(?:$|-turbo)|preview|0314|0613/.test(id) || isLegacyModel(metadata)) {
      return "legacy";
    }
    return "other";
  }

  if (/gemini-(3-pro-preview|2\.5-pro|flash-latest)/.test(id)) {
    return "default";
  }
  if (/flash-lite|flash/.test(id)) {
    return "fast";
  }
  if (/thinking|pro/.test(id)) {
    return "reasoning";
  }
  if (/gemini-1\.5|gemini-2\.0/.test(id) || isLegacyModel(metadata)) {
    return "legacy";
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
      : (ctx.providerId === "google-ai-studio"
          ? "google"
          : ctx.providerId);

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
    excludePatterns: [
      /\/(?:.*)(?:embedding|audio|realtime|whisper|tts|dall-e)/i,
      /:free$/i,
    ],
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
};

export function matchesProviderRules(providerId: SupportedAPIProviderId, modelId: string): boolean {
  const rules = PROVIDER_MODEL_RULES[providerId];

  const included = rules.includePatterns.some((pattern) => pattern.test(modelId));
  if (!included) return false;

  const excluded = rules.excludePatterns.some((pattern) => pattern.test(modelId));
  return !excluded;
}
