import type { CLIProviderAdapter } from "../types.ts";
import { claudeAdapter } from "./claude.ts";
import { geminiAdapter } from "./gemini.ts";

// ==============================================================================
// CLI MODE ADAPTER REGISTRY
// ==============================================================================

/**
 * Registry of all CLI mode provider adapters.
 * Add new CLI adapters here when adding support for new CLI tools.
 */
const cliAdapters: Map<string, CLIProviderAdapter> = new Map([
  [claudeAdapter.providerId, claudeAdapter],
  [geminiAdapter.providerId, geminiAdapter],
  // Future CLI adapters:
  // [codexAdapter.providerId, codexAdapter],
]);

/**
 * Get a CLI adapter by provider ID.
 * @param providerId - The provider ID (e.g., "gemini", "claude")
 * @returns The CLI adapter or undefined if not found
 */
export function getCLIAdapter(providerId: string): CLIProviderAdapter | undefined {
  return cliAdapters.get(providerId);
}

/**
 * Get a CLI adapter by binary name.
 * @param binary - The binary name (e.g., "gemini", "claude")
 * @returns The CLI adapter or undefined if not found
 */
export function getCLIAdapterByBinary(binary: string): CLIProviderAdapter | undefined {
  for (const adapter of cliAdapters.values()) {
    if (adapter.binary === binary) {
      return adapter;
    }
  }
  return undefined;
}

/**
 * Get all registered CLI provider IDs.
 */
export function getCLIProviderIds(): string[] {
  return Array.from(cliAdapters.keys());
}

// Re-export adapters for direct access if needed
export { claudeAdapter } from "./claude.ts";
export { geminiAdapter } from "./gemini.ts";
