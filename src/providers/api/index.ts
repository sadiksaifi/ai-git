import type { APIProviderAdapter } from "../types.ts";

// ==============================================================================
// API MODE ADAPTER REGISTRY (FUTURE)
// ==============================================================================

/**
 * Registry of all API mode provider adapters.
 * This is a placeholder for future API-based providers.
 *
 * Future providers will include:
 * - OpenRouter (openrouter.ai)
 * - OpenAI API
 * - Google Vertex AI
 * - Anthropic API
 *
 * Implementation will use Vercel AI SDK for consistent interface.
 */
const apiAdapters: Map<string, APIProviderAdapter> = new Map([
  // Future API adapters:
  // [openRouterAdapter.providerId, openRouterAdapter],
  // [openAIAdapter.providerId, openAIAdapter],
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
 * Check if API mode is available (has at least one configured provider).
 */
export function isAPIModeAvailable(): boolean {
  return apiAdapters.size > 0;
}

// Future example adapter structure:
//
// import { generateText } from "ai";
// import { createOpenRouter } from "@openrouter/ai-sdk-provider";
//
// export const openRouterAdapter: APIProviderAdapter = {
//   providerId: "openrouter",
//   mode: "api",
//
//   async invoke({ model, prompt }): Promise<string> {
//     const openrouter = createOpenRouter({
//       apiKey: process.env.OPENROUTER_API_KEY,
//     });
//
//     const { text } = await generateText({
//       model: openrouter(model),
//       prompt,
//     });
//
//     return text;
//   },
//
//   async checkAvailable(): Promise<boolean> {
//     return !!process.env.OPENROUTER_API_KEY;
//   },
// };
