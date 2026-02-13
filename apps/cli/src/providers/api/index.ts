import type { APIProviderAdapter } from "../types.ts";
import { openRouterAdapter } from "./openrouter.ts";
import { openAIAdapter } from "./openai.ts";
import { anthropicAdapter } from "./anthropic.ts";
import { googleAiStudioAdapter } from "./google-ai-studio.ts";
import { cerebrasAdapter } from "./cerebras.ts";

// ==============================================================================
// API MODE ADAPTER REGISTRY
// ==============================================================================

/**
 * Registry of all API mode provider adapters.
 *
 * Supported providers:
 * - OpenRouter (openrouter.ai) - Access to multiple AI providers
 * - OpenAI API - GPT-4o, GPT-4, etc.
 * - Anthropic API - Claude models
 * - Google AI Studio - Gemini models
 * - Cerebras - Llama, Qwen, and other models on Wafer-Scale Engine
 *
 * All adapters use Vercel AI SDK for consistent interface.
 */
const apiAdapters: Map<string, APIProviderAdapter> = new Map([
  [openRouterAdapter.providerId, openRouterAdapter],
  [openAIAdapter.providerId, openAIAdapter],
  [anthropicAdapter.providerId, anthropicAdapter],
  [googleAiStudioAdapter.providerId, googleAiStudioAdapter],
  [cerebrasAdapter.providerId, cerebrasAdapter],
]);

/**
 * Get an API adapter by provider ID.
 * @param providerId - The provider ID (e.g., "openrouter", "openai")
 * @returns The API adapter or undefined if not found
 */
export function getAPIAdapter(providerId: string): APIProviderAdapter | undefined {
  return apiAdapters.get(providerId);
}

/**
 * Get all registered API provider IDs.
 */
export function getAPIProviderIds(): string[] {
  return Array.from(apiAdapters.keys());
}

/**
 * Check if API mode is available (has at least one registered adapter).
 */
export function isAPIModeAvailable(): boolean {
  return apiAdapters.size > 0;
}

/**
 * Get all registered API adapters.
 */
export function getAllAPIAdapters(): APIProviderAdapter[] {
  return Array.from(apiAdapters.values());
}

// Re-export adapters for direct access
export { openRouterAdapter } from "./openrouter.ts";
export { openAIAdapter } from "./openai.ts";
export { anthropicAdapter } from "./anthropic.ts";
export { googleAiStudioAdapter } from "./google-ai-studio.ts";
export { cerebrasAdapter } from "./cerebras.ts";
