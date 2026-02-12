import { readFile } from "node:fs/promises";
import type { APIModelDefinition } from "../../types.ts";
import { normalizeModelKey } from "./provider-rules.ts";
import { MODEL_CATALOG_SNAPSHOT } from "./snapshot.ts";
import {
  createCatalogFromRaw,
  fetchModelsDevCatalog,
  loadCatalogCache,
  saveCatalogCache,
} from "./models-dev-client.ts";
import type {
  CatalogModelDefinition,
  CatalogProviderId,
  ModelCatalog,
  ProviderModelCatalog,
  SupportedAPIProviderId,
} from "./types.ts";

let inMemoryCatalog: ModelCatalog | null = null;
let inFlightCatalog: Promise<ModelCatalog> | null = null;

function toProviderCatalog(
  providerId: CatalogProviderId,
  models: Record<string, CatalogModelDefinition>
): ProviderModelCatalog {
  const normalizedModelIndex: Record<string, string> = {};

  for (const modelId of Object.keys(models)) {
    const normalized = normalizeModelKey(modelId);
    if (!normalizedModelIndex[normalized]) {
      normalizedModelIndex[normalized] = modelId;
    }
  }

  return {
    providerId,
    models,
    normalizedModelIndex,
  };
}

function normalizeCatalog(catalog: ModelCatalog, source: ModelCatalog["source"]): ModelCatalog {
  return {
    fetchedAt: catalog.fetchedAt || new Date().toISOString(),
    source,
    providers: {
      anthropic: toProviderCatalog("anthropic", catalog.providers.anthropic.models),
      openai: toProviderCatalog("openai", catalog.providers.openai.models),
      google: toProviderCatalog("google", catalog.providers.google.models),
    },
  };
}

export function createSnapshotModelCatalog(): ModelCatalog {
  const now = new Date().toISOString();

  return {
    fetchedAt: now,
    source: "snapshot",
    providers: {
      anthropic: toProviderCatalog("anthropic", MODEL_CATALOG_SNAPSHOT.anthropic.models),
      openai: toProviderCatalog("openai", MODEL_CATALOG_SNAPSHOT.openai.models),
      google: toProviderCatalog("google", MODEL_CATALOG_SNAPSHOT.google.models),
    },
  };
}

async function loadCatalogFromOverride(): Promise<ModelCatalog | null> {
  const overrideFile = process.env.AI_GIT_MODEL_CATALOG_OVERRIDE;
  if (!overrideFile) return null;

  try {
    const rawText = await readFile(overrideFile, "utf8");
    const parsed = JSON.parse(rawText) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "providers" in parsed &&
      (parsed as ModelCatalog).providers?.anthropic?.models
    ) {
      return normalizeCatalog(parsed as ModelCatalog, "snapshot");
    }

    return createCatalogFromRaw(parsed, "snapshot");
  } catch {
    return null;
  }
}

async function resolveCatalog(forceRefresh: boolean): Promise<ModelCatalog> {
  if (!forceRefresh && inMemoryCatalog) {
    return inMemoryCatalog;
  }

  const overrideCatalog = await loadCatalogFromOverride();
  if (overrideCatalog) {
    inMemoryCatalog = overrideCatalog;
    return overrideCatalog;
  }

  try {
    const networkCatalog = await fetchModelsDevCatalog();
    const normalized = normalizeCatalog(networkCatalog, "network");
    await saveCatalogCache(normalized);
    inMemoryCatalog = normalized;
    return normalized;
  } catch {
    const cachedCatalog = await loadCatalogCache();
    if (cachedCatalog) {
      const normalized = normalizeCatalog(cachedCatalog, "cache");
      inMemoryCatalog = normalized;
      return normalized;
    }

    const fallback = createSnapshotModelCatalog();
    inMemoryCatalog = fallback;
    return fallback;
  }
}

export async function getModelCatalog(options?: {
  forceRefresh?: boolean;
}): Promise<ModelCatalog> {
  const forceRefresh = options?.forceRefresh ?? false;

  if (!forceRefresh && inMemoryCatalog) {
    return inMemoryCatalog;
  }

  if (!forceRefresh && inFlightCatalog) {
    return inFlightCatalog;
  }

  inFlightCatalog = resolveCatalog(forceRefresh);

  try {
    return await inFlightCatalog;
  } finally {
    inFlightCatalog = null;
  }
}

function resolveCatalogProvider(
  providerId: SupportedAPIProviderId,
  model: APIModelDefinition
): { provider: CatalogProviderId; modelId: string } | null {
  if (providerId === "openrouter") {
    const providerFromModel = model.provider || model.id.split("/")[0] || "";
    const mappedProvider =
      providerFromModel === "anthropic" ||
      providerFromModel === "openai" ||
      providerFromModel === "google"
        ? providerFromModel
        : null;

    if (!mappedProvider) {
      return null;
    }

    const modelId = model.id.split("/").slice(1).join("/") || model.id;
    return { provider: mappedProvider, modelId };
  }

  if (providerId === "google-ai-studio") {
    return { provider: "google", modelId: model.id };
  }

  return {
    provider: providerId,
    modelId: model.id,
  };
}

function findCatalogModelId(provider: ProviderModelCatalog, modelId: string): string | null {
  const normalized = normalizeModelKey(modelId);

  const exact = provider.normalizedModelIndex[normalized];
  if (exact) {
    return exact;
  }

  let bestMatch: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [normalizedId, actualId] of Object.entries(provider.normalizedModelIndex)) {
    if (normalizedId.includes(normalized) || normalized.includes(normalizedId)) {
      const distance = Math.abs(normalizedId.length - normalized.length);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = actualId;
      }
    }
  }

  return bestMatch;
}

export function getCatalogModelMetadata(
  providerId: SupportedAPIProviderId,
  model: APIModelDefinition,
  catalog: ModelCatalog
): CatalogModelDefinition | null {
  const resolved = resolveCatalogProvider(providerId, model);
  if (!resolved) return null;

  const providerCatalog = catalog.providers[resolved.provider];
  const modelCatalogId = findCatalogModelId(providerCatalog, resolved.modelId);
  if (!modelCatalogId) return null;

  return providerCatalog.models[modelCatalogId] || null;
}

export function isDeprecatedModel(metadata: CatalogModelDefinition | null): boolean {
  return metadata?.status === "deprecated";
}

export function clearModelCatalogForTests(): void {
  inMemoryCatalog = null;
  inFlightCatalog = null;
}
