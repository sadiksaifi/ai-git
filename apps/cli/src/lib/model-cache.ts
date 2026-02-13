import { CACHE_DIR, getModelCacheFile } from "./paths.ts";

// ==============================================================================
// TYPES
// ==============================================================================

/**
 * A cached model entry.
 */
export interface CachedModel {
  /** Full model ID (e.g., "anthropic/claude-haiku-4-5") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** For OpenRouter: the original provider (anthropic, openai, google) */
  provider?: string;
  /** Sort rank (lower = higher priority, used for featured models) */
  rank?: number;
}

/**
 * Schema for the model cache file.
 */
interface ModelCache {
  /** ISO timestamp when the cache was created */
  fetchedAt: string;
  /** Provider this cache belongs to */
  provider: string;
  /** Cached model list */
  models: CachedModel[];
}

// ==============================================================================
// CONSTANTS
// ==============================================================================

/** Default cache TTL: 48 hours in milliseconds */
const DEFAULT_CACHE_TTL_MS = 48 * 60 * 60 * 1000;

// ==============================================================================
// CACHE FILE OPERATIONS
// ==============================================================================

/**
 * Load the cached models for a provider.
 * @param provider - The provider ID (e.g., "openrouter", "anthropic")
 * @returns The cache data, or null if not found/invalid
 */
async function loadCache(provider: string): Promise<ModelCache | null> {
  try {
    const file = Bun.file(getModelCacheFile(provider));
    const exists = await file.exists();
    if (!exists) return null;
    const content = await file.text();
    return JSON.parse(content) as ModelCache;
  } catch {
    return null;
  }
}

/**
 * Save models to the cache.
 * @param provider - The provider ID
 * @param models - The models to cache
 */
async function saveCache(provider: string, models: CachedModel[]): Promise<void> {
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(CACHE_DIR, { recursive: true });

    const cache: ModelCache = {
      fetchedAt: new Date().toISOString(),
      provider,
      models,
    };

    await Bun.write(getModelCacheFile(provider), JSON.stringify(cache, null, 2));
  } catch {
    // Silently fail - cache is not critical
  }
}

/**
 * Check if a cache is still valid based on TTL.
 * @param cache - The cache to check
 * @param ttlMs - TTL in milliseconds (default: 48 hours)
 */
function isCacheValid(cache: ModelCache, ttlMs: number = DEFAULT_CACHE_TTL_MS): boolean {
  const fetchedAt = new Date(cache.fetchedAt).getTime();
  const now = Date.now();
  return now - fetchedAt < ttlMs;
}

// ==============================================================================
// PUBLIC API
// ==============================================================================

/**
 * Get cached models for a provider if they exist and are valid.
 * @param provider - The provider ID
 * @param ttlHours - Cache TTL in hours (default: 48)
 * @returns The cached models, or null if cache miss/expired
 */
export async function getCachedModels(
  provider: string,
  ttlHours: number = 48
): Promise<CachedModel[] | null> {
  const cache = await loadCache(provider);
  if (!cache) return null;

  const ttlMs = ttlHours * 60 * 60 * 1000;
  if (!isCacheValid(cache, ttlMs)) return null;

  return cache.models;
}

/**
 * Store models in the cache.
 * @param provider - The provider ID
 * @param models - The models to cache
 */
export async function cacheModels(
  provider: string,
  models: CachedModel[]
): Promise<void> {
  await saveCache(provider, models);
}

/**
 * Invalidate (delete) the cache for a provider.
 * @param provider - The provider ID
 */
export async function invalidateCache(provider: string): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(getModelCacheFile(provider));
  } catch {
    // Ignore errors (file might not exist)
  }
}

/**
 * Get the age of the cache in hours.
 * @param provider - The provider ID
 * @returns Cache age in hours, or null if no cache exists
 */
export async function getCacheAge(provider: string): Promise<number | null> {
  const cache = await loadCache(provider);
  if (!cache) return null;

  const fetchedAt = new Date(cache.fetchedAt).getTime();
  const now = Date.now();
  return (now - fetchedAt) / (60 * 60 * 1000);
}
