import type { CLIProviderAdapter } from "../types.ts";
import { claudeCodeAdapter } from "./claude-code.ts";
import { geminiCliAdapter } from "./gemini-cli.ts";

// ==============================================================================
// CLI MODE ADAPTER REGISTRY
// ==============================================================================

/**
 * Registry of all CLI mode provider adapters.
 * Add new CLI adapters here when adding support for new CLI tools.
 */
const cliAdapters: Map<string, CLIProviderAdapter> = new Map([
  [claudeCodeAdapter.providerId, claudeCodeAdapter],
  [geminiCliAdapter.providerId, geminiCliAdapter],
  // Future CLI adapters:
  // [codexAdapter.providerId, codexAdapter],
]);

/**
 * Get a CLI adapter by provider ID.
 * @param providerId - The provider ID (e.g., "gemini-cli", "claude-code")
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
export { claudeCodeAdapter } from "./claude-code.ts";
export { geminiCliAdapter } from "./gemini-cli.ts";
