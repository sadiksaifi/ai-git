import { PROVIDERS as PROVIDER_DOCS, isCLIProviderDoc } from "@ai-git/meta";
import type { ProviderDefinition, Mode } from "../types.ts";

// ==============================================================================
// PROVIDER REGISTRY
// ==============================================================================

/**
 * Providers marked as recommended in setup. Everything else about a provider
 * (ID, name, mode, binary) comes from @ai-git/meta.
 */
const RECOMMENDED_PROVIDER_IDS = new Set(["codex", "openrouter"]);

/**
 * Supported AI providers, derived from @ai-git/meta provider docs.
 *
 * No provider has a hardcoded model list. CLI providers list models from the
 * installed CLI (or, for Claude Code, from models.dev) during `configure`;
 * API providers fetch models from their API.
 */
export const PROVIDERS: ProviderDefinition[] = Object.values(PROVIDER_DOCS).map((doc) => ({
  id: doc.id,
  name: doc.name,
  mode: doc.type,
  ...(isCLIProviderDoc(doc) ? { binary: doc.binary } : {}),
  ...(RECOMMENDED_PROVIDER_IDS.has(doc.id) ? { isRecommended: true } : {}),
}));

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Find a provider by its ID (e.g., "antigravity-cli", "claude-code").
 */
export function getProviderById(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Find a provider by its binary name (e.g., "agy", "claude").
 * Only applicable for CLI mode providers.
 */
export function getProviderByBinary(binary: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.mode === "cli" && p.binary === binary);
}

/**
 * Get all providers for a specific mode.
 */
export function getProvidersByMode(mode: Mode): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.mode === mode);
}

/**
 * Get all available provider IDs.
 */
export function getProviderIds(): string[] {
  return PROVIDERS.map((p) => p.id);
}

/**
 * Stable sort that moves items with `isRecommended: true` to the front.
 * Preserves original order among recommended and non-recommended items.
 * Relies on ES2019+ stable Array.prototype.sort (guaranteed in Bun/V8).
 */
export function sortRecommendedFirst<T extends { isRecommended?: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.isRecommended && !b.isRecommended) return -1;
    if (!a.isRecommended && b.isRecommended) return 1;
    return 0;
  });
}
