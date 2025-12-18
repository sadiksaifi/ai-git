import type { Mode } from "../types.ts";
import type { ProviderAdapter } from "./types.ts";
import { getCLIAdapter, getCLIAdapterByBinary } from "./cli/index.ts";
// Future: import { getAPIAdapter } from "./api/index.ts";

// ==============================================================================
// UNIFIED PROVIDER ADAPTER REGISTRY
// ==============================================================================

/**
 * Get a provider adapter by provider ID.
 * Automatically routes to the correct mode-specific registry.
 *
 * @param providerId - The provider ID (e.g., "gemini", "claude")
 * @param mode - Optional mode hint (if not provided, searches all modes)
 * @returns The provider adapter or undefined if not found
 */
export function getAdapter(
  providerId: string,
  mode?: Mode
): ProviderAdapter | undefined {
  // If mode is specified, only search that mode
  if (mode === "cli") {
    return getCLIAdapter(providerId);
  }
  if (mode === "api") {
    // Future: return getAPIAdapter(providerId);
    return undefined;
  }

  // No mode specified - search CLI first (current default)
  const cliAdapter = getCLIAdapter(providerId);
  if (cliAdapter) {
    return cliAdapter;
  }

  // Future: search API adapters
  // const apiAdapter = getAPIAdapter(providerId);
  // if (apiAdapter) {
  //   return apiAdapter;
  // }

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

  // Future: Add API provider IDs
  // const { getAPIProviderIds } = require("./api/index.ts");
  // ids.push(...getAPIProviderIds());

  return ids;
}

// Re-export types for convenience
export type { ProviderAdapter, InvokeOptions, CLIProviderAdapter, APIProviderAdapter } from "./types.ts";
