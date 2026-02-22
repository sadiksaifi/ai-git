import type { ProviderAdapter } from "./types.ts";
import { getCLIAdapter, getCLIAdapterByBinary } from "./cli/index.ts";
import { getAPIAdapter } from "./api/index.ts";

// ==============================================================================
// UNIFIED PROVIDER ADAPTER REGISTRY
// ==============================================================================

/**
 * Get a provider adapter by provider ID.
 * Automatically routes to the correct adapter based on provider ID.
 *
 * @param providerId - The provider ID (e.g., "gemini-cli", "claude-code", "openrouter")
 * @returns The provider adapter or undefined if not found
 */
export function getAdapter(providerId: string): ProviderAdapter | undefined {
  // Search CLI adapters first
  const cliAdapter = getCLIAdapter(providerId);
  if (cliAdapter) {
    return cliAdapter;
  }

  // Search API adapters
  const apiAdapter = getAPIAdapter(providerId);
  if (apiAdapter) {
    return apiAdapter;
  }

  return undefined;
}

/**
 * Get a CLI adapter by binary name.
 * Only searches CLI mode adapters.
 *
 * @param binary - The binary name (e.g., "gemini", "claude")
 * @returns The provider adapter or undefined if not found
 */
export function getAdapterByBinary(binary: string): ProviderAdapter | undefined {
  return getCLIAdapterByBinary(binary);
}

/**
 * Get all registered provider IDs across all modes.
 */
export function getRegisteredProviderIds(): string[] {
  const ids: string[] = [];

  // Add CLI provider IDs
  const { getCLIProviderIds } = require("./cli/index.ts");
  ids.push(...getCLIProviderIds());

  // Add API provider IDs
  const { getAPIProviderIds } = require("./api/index.ts");
  ids.push(...getAPIProviderIds());

  return ids;
}

// Re-export types for convenience
export type {
  ProviderAdapter,
  InvokeOptions,
  CLIProviderAdapter,
  APIProviderAdapter,
} from "./types.ts";
