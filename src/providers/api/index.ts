import type { APIProviderAdapter } from "../types.ts";
import { openRouterAdapter } from "./openrouter.ts";
import { anthropicAdapter } from "./anthropic.ts";
import { openAIAdapter } from "./openai.ts";
import { googleAdapter } from "./google.ts";

// ==============================================================================
// API MODE ADAPTER REGISTRY
// ==============================================================================

/**
 * Registry of all API mode provider adapters.
 *
 * Supported providers:
 * - OpenRouter (openrouter.ai) - Access 100+ models via single API key
 * - Anthropic - Direct access to Claude models
 * - OpenAI - Direct access to GPT models
 * - Google AI - Direct access to Gemini models
 *
 * All adapters use the Vercel AI SDK for consistent interface.
 */
const apiAdapters: Map<string, APIProviderAdapter> = new Map([
  [openRouterAdapter.providerId, openRouterAdapter],
  [anthropicAdapter.providerId, anthropicAdapter],
  [openAIAdapter.providerId, openAIAdapter],
  [googleAdapter.providerId, googleAdapter],
]);

/**
 * Get an API adapter by provider ID.
 * @param providerId - The provider ID (e.g., "openrouter", "openai")
 * @returns The API adapter or undefined if not found
 */
export function getAPIAdapter(
  providerId: string
): APIProviderAdapter | undefined {
  return apiAdapters.get(providerId);
}

/**
 * Get all registered API provider IDs.
 */
export function getAPIProviderIds(): string[] {
  return Array.from(apiAdapters.keys());
}

/**
 * Check if API mode is available (has at least one configured provider).
 */
export function isAPIModeAvailable(): boolean {
  return apiAdapters.size > 0;
}
