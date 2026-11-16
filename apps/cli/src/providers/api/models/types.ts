import type { APIModelDefinition } from "../../types.ts";

export type CatalogSource = "network" | "cache" | "snapshot";

export type CatalogProviderId = "anthropic" | "openai" | "google";

export type SupportedAPIProviderId =
  | "anthropic"
  | "openai"
  | "google-ai-studio"
  | "openrouter"
  | "cerebras";

export type ModelTier = "default" | "fast" | "reasoning" | "legacy" | "other";

export interface CatalogModelDefinition {
  id: string;
  name: string;
  status?: "alpha" | "beta" | "deprecated";
  releaseDate?: string;
  lastUpdated?: string;
  reasoning: boolean;
  toolCall: boolean;
  /** Model family from models.dev (e.g. "claude-haiku", "gpt-luna") */
  family?: string;
  /** Effort values the model accepts. Absent when models.dev lists no effort option. */
  reasoningEfforts?: string[];
  /** USD per million tokens */
  cost?: { input?: number; output?: number };
  /** Output modalities from models.dev (e.g. ["text"], ["image"]) */
  outputModalities?: string[];
}

export interface ProviderModelCatalog {
  providerId: CatalogProviderId;
  models: Record<string, CatalogModelDefinition>;
  normalizedModelIndex: Record<string, string>;
}

export interface ModelCatalog {
  fetchedAt: string;
  source: CatalogSource;
  providers: Record<CatalogProviderId, ProviderModelCatalog>;
}

export interface RankedModel extends APIModelDefinition {
  tier: ModelTier;
  providerRank: number;
  knownInCatalog: boolean;
}

export interface ProviderModelRuleContext {
  providerId: SupportedAPIProviderId;
  model: APIModelDefinition;
  metadata: CatalogModelDefinition | null;
}

export interface ProviderModelRules {
  includePatterns: RegExp[];
  excludePatterns: RegExp[];
  dedupeKey: (modelId: string) => string;
  resolveCatalogProvider: (model: APIModelDefinition) => CatalogProviderId | null;
  resolveTier: (ctx: ProviderModelRuleContext) => ModelTier;
  resolveProviderRank?: (model: APIModelDefinition) => number;
}
