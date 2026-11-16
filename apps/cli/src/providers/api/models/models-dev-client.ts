import * as path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { normalizeModelKey } from "./provider-rules.ts";
import type {
  CatalogModelDefinition,
  CatalogProviderId,
  ModelCatalog,
  ProviderModelCatalog,
} from "./types.ts";

export const MODELS_DEV_API_URL = "https://models.dev/api.json";
export const MODELS_DEV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Bump when the cached catalog gains fields that filtering depends on, so caches
 * written by older versions are ignored instead of read with those fields missing.
 */
export const MODELS_DEV_CACHE_VERSION = 2;

const MODELS_DEV_PROVIDER_IDS: CatalogProviderId[] = ["anthropic", "openai", "google"];

export interface ModelsDevRawModel {
  name?: string;
  status?: "alpha" | "beta" | "deprecated";
  release_date?: string;
  last_updated?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  family?: string;
  reasoning_options?: Array<{ type?: string; values?: unknown }>;
  cost?: { input?: number; output?: number };
  modalities?: { input?: unknown; output?: unknown };
}

interface ModelsDevRawProvider {
  models?: Record<string, ModelsDevRawModel>;
}

import { getModelsDevCacheFilePath } from "../../../lib/paths.ts";
export { getModelsDevCacheFilePath };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Read the effort values from a models.dev `reasoning_options` list.
 * Returns undefined when the model has no effort option.
 */
export function extractReasoningEfforts(
  options: ModelsDevRawModel["reasoning_options"],
): string[] | undefined {
  if (!Array.isArray(options)) return undefined;
  const effort = options.find((option) => isRecord(option) && option.type === "effort");
  if (!effort || !Array.isArray(effort.values)) return undefined;
  return effort.values.filter((value): value is string => typeof value === "string");
}

function extractCost(cost: ModelsDevRawModel["cost"]): CatalogModelDefinition["cost"] {
  if (!isRecord(cost)) return undefined;
  const input = typeof cost.input === "number" ? cost.input : undefined;
  const output = typeof cost.output === "number" ? cost.output : undefined;
  if (input === undefined && output === undefined) return undefined;
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
  };
}

export function toCatalogModelDefinition(
  id: string,
  model: ModelsDevRawModel,
): CatalogModelDefinition {
  const reasoningEfforts = extractReasoningEfforts(model.reasoning_options);
  const cost = extractCost(model.cost);
  const outputModalities = Array.isArray(model.modalities?.output)
    ? model.modalities.output.filter((value): value is string => typeof value === "string")
    : undefined;

  return {
    id,
    name: model.name || id,
    ...(model.status ? { status: model.status } : {}),
    ...(model.release_date ? { releaseDate: model.release_date } : {}),
    ...(model.last_updated ? { lastUpdated: model.last_updated } : {}),
    reasoning: model.reasoning ?? false,
    toolCall: model.tool_call ?? false,
    ...(typeof model.family === "string" && model.family ? { family: model.family } : {}),
    ...(reasoningEfforts ? { reasoningEfforts } : {}),
    ...(cost ? { cost } : {}),
    ...(outputModalities?.length ? { outputModalities } : {}),
  };
}

function toProviderModelCatalog(
  providerId: CatalogProviderId,
  rawProvider: ModelsDevRawProvider | undefined,
): ProviderModelCatalog {
  const rawModels = rawProvider?.models || {};
  const models: Record<string, CatalogModelDefinition> = {};
  const normalizedModelIndex: Record<string, string> = {};

  for (const [modelId, rawModel] of Object.entries(rawModels)) {
    models[modelId] = toCatalogModelDefinition(modelId, rawModel);

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

export function createCatalogFromRaw(raw: unknown, source: ModelCatalog["source"]): ModelCatalog {
  const rawRecord = isRecord(raw) ? raw : {};

  const providers = {
    anthropic: toProviderModelCatalog(
      "anthropic",
      (rawRecord.anthropic as ModelsDevRawProvider | undefined) || undefined,
    ),
    openai: toProviderModelCatalog(
      "openai",
      (rawRecord.openai as ModelsDevRawProvider | undefined) || undefined,
    ),
    google: toProviderModelCatalog(
      "google",
      (rawRecord.google as ModelsDevRawProvider | undefined) || undefined,
    ),
  };

  return {
    fetchedAt: new Date().toISOString(),
    source,
    providers,
  };
}

export async function fetchModelsDevCatalog(signal?: AbortSignal): Promise<ModelCatalog> {
  const response = await fetch(MODELS_DEV_API_URL, {
    headers: {
      "User-Agent": "ai-git-cli",
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`models.dev fetch failed (${response.status})`);
  }

  const raw = await response.json();
  const catalog = createCatalogFromRaw(raw, "network");

  for (const providerId of MODELS_DEV_PROVIDER_IDS) {
    if (Object.keys(catalog.providers[providerId].models).length === 0) {
      throw new Error(`models.dev payload missing provider '${providerId}' models`);
    }
  }

  return catalog;
}

export async function saveCatalogCache(catalog: ModelCatalog): Promise<void> {
  const cacheFile = getModelsDevCacheFilePath();
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(
    cacheFile,
    JSON.stringify({ ...catalog, cacheVersion: MODELS_DEV_CACHE_VERSION }, null, 2),
    "utf8",
  );
}

export async function loadCatalogCache(): Promise<ModelCatalog | null> {
  try {
    const content = await readFile(getModelsDevCacheFilePath(), "utf8");
    const parsed = JSON.parse(content) as ModelCatalog & { cacheVersion?: unknown };

    if (!parsed || !parsed.providers || parsed.cacheVersion !== MODELS_DEV_CACHE_VERSION) {
      return null;
    }

    const { cacheVersion: _cacheVersion, ...catalog } = parsed;
    return catalog;
  } catch {
    return null;
  }
}

export function isCatalogFresh(
  catalog: ModelCatalog,
  ttlMs: number = MODELS_DEV_CACHE_TTL_MS,
): boolean {
  const fetchedAtMs = new Date(catalog.fetchedAt).getTime();
  if (Number.isNaN(fetchedAtMs)) return false;
  return Date.now() - fetchedAtMs <= ttlMs;
}
