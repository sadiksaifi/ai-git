import type { ProviderAdapter } from "./types.ts";
import { geminiAdapter } from "./gemini.ts";

// ==============================================================================
// PROVIDER ADAPTER REGISTRY
// ==============================================================================

/**
 * Registry of all available provider adapters.
 * Add new adapters here when adding support for new providers.
 */
const adapters: Map<string, ProviderAdapter> = new Map([
  [geminiAdapter.providerId, geminiAdapter],
  // Future adapters:
  // [claudeAdapter.providerId, claudeAdapter],
  // [codexAdapter.providerId, codexAdapter],
]);

/**
 * Get a provider adapter by provider ID.
 * @param providerId - The provider ID (e.g., "gemini", "claude")
 * @returns The provider adapter or undefined if not found
 */
export function getAdapter(providerId: string): ProviderAdapter | undefined {
  return adapters.get(providerId);
}

/**
 * Get a provider adapter by CLI binary name.
 * @param binary - The binary name (e.g., "gemini", "claude")
 * @returns The provider adapter or undefined if not found
 */
export function getAdapterByBinary(binary: string): ProviderAdapter | undefined {
  for (const adapter of adapters.values()) {
    if (adapter.binary === binary) {
      return adapter;
    }
  }
  return undefined;
}

/**
 * Get all registered provider IDs.
 */
export function getRegisteredProviderIds(): string[] {
  return Array.from(adapters.keys());
}

// Re-export types for convenience
export type { ProviderAdapter, InvokeOptions } from "./types.ts";
