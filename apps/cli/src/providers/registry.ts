import type { ProviderDefinition, ModelDefinition, Mode } from "../types.ts";

// ==============================================================================
// PROVIDER REGISTRY
// ==============================================================================

/**
 * Supported AI providers and their available models.
 * Add new providers here to extend support.
 *
 * MODEL ORDERING (CLI providers):
 *   1. Newest generation first (e.g. 5.4 before 5.3)
 *   2. Smallest/cheapest variant first within a generation (mini → base → max)
 *   3. Lowest effort first within a variant (low → medium → high → xhigh → max)
 *   4. New models go at the TOP of the list
 */
export const PROVIDERS: ProviderDefinition[] = [
  // ==============================================================================
  // CLI PROVIDERS
  // ==============================================================================
  {
    id: "opencode",
    name: "OpenCode",
    mode: "cli",
    binary: "opencode",
    dynamicModels: true,
    models: [],
  },
  {
    id: "pi",
    name: "Pi",
    mode: "cli",
    binary: "pi",
    dynamicModels: true,
    models: [],
  },
  {
    id: "codex",
    name: "Codex",
    mode: "cli",
    binary: "codex",
    isRecommended: true,
    models: [
      // GPT-5.6 Luna (low, medium, high, xhigh, max)
      { id: "gpt-5.6-luna-low", name: "GPT-5.6 Luna (low)", isRecommended: true },
      { id: "gpt-5.6-luna-medium", name: "GPT-5.6 Luna (medium)" },
      { id: "gpt-5.6-luna-high", name: "GPT-5.6 Luna (high)" },
      { id: "gpt-5.6-luna-xhigh", name: "GPT-5.6 Luna (xhigh)" },
      { id: "gpt-5.6-luna-max", name: "GPT-5.6 Luna (max)" },
      // GPT-5.6 Terra (low, medium, high, xhigh, max)
      { id: "gpt-5.6-terra-low", name: "GPT-5.6 Terra (low)" },
      { id: "gpt-5.6-terra-medium", name: "GPT-5.6 Terra (medium)" },
      { id: "gpt-5.6-terra-high", name: "GPT-5.6 Terra (high)" },
      { id: "gpt-5.6-terra-xhigh", name: "GPT-5.6 Terra (xhigh)" },
      { id: "gpt-5.6-terra-max", name: "GPT-5.6 Terra (max)" },
      // GPT-5.6 Sol (low, medium, high, xhigh, max)
      { id: "gpt-5.6-sol-low", name: "GPT-5.6 Sol (low)" },
      { id: "gpt-5.6-sol-medium", name: "GPT-5.6 Sol (medium)" },
      { id: "gpt-5.6-sol-high", name: "GPT-5.6 Sol (high)" },
      { id: "gpt-5.6-sol-xhigh", name: "GPT-5.6 Sol (xhigh)" },
      { id: "gpt-5.6-sol-max", name: "GPT-5.6 Sol (max)" },
      // GPT-5.5 (low, medium, high, xhigh)
      { id: "gpt-5.5-low", name: "GPT-5.5 (low)" },
      { id: "gpt-5.5-medium", name: "GPT-5.5 (medium)" },
      { id: "gpt-5.5-high", name: "GPT-5.5 (high)" },
      { id: "gpt-5.5-xhigh", name: "GPT-5.5 (xhigh)" },
      // GPT-5.3 Codex Spark (low, medium, high, xhigh)
      { id: "gpt-5.3-codex-spark-low", name: "GPT-5.3 Codex Spark (low)" },
      { id: "gpt-5.3-codex-spark-medium", name: "GPT-5.3 Codex Spark (medium)" },
      { id: "gpt-5.3-codex-spark-high", name: "GPT-5.3 Codex Spark (high)" },
      { id: "gpt-5.3-codex-spark-xhigh", name: "GPT-5.3 Codex Spark (xhigh)" },
    ],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    mode: "cli",
    binary: "claude",
    models: [
      // Haiku does not support effort levels.
      { id: "haiku", name: "Claude Haiku", isRecommended: true },
      // Fable (low, medium, high, xhigh, max)
      { id: "fable-low", name: "Claude Fable (low)" },
      { id: "fable-medium", name: "Claude Fable (medium)" },
      { id: "fable-high", name: "Claude Fable (high)" },
      { id: "fable-xhigh", name: "Claude Fable (xhigh)" },
      { id: "fable-max", name: "Claude Fable (max)" },
      // Sonnet (low, medium, high, xhigh, max)
      { id: "sonnet-low", name: "Claude Sonnet (low)" },
      { id: "sonnet-medium", name: "Claude Sonnet (medium)" },
      { id: "sonnet-high", name: "Claude Sonnet (high)" },
      { id: "sonnet-xhigh", name: "Claude Sonnet (xhigh)" },
      { id: "sonnet-max", name: "Claude Sonnet (max)" },
      // Opus (low, medium, high, xhigh, max)
      { id: "opus-low", name: "Claude Opus (low)" },
      { id: "opus-medium", name: "Claude Opus (medium)" },
      { id: "opus-high", name: "Claude Opus (high)" },
      { id: "opus-xhigh", name: "Claude Opus (xhigh)" },
      { id: "opus-max", name: "Claude Opus (max)" },
    ],
  },
  {
    id: "antigravity-cli",
    name: "Antigravity CLI",
    mode: "cli",
    binary: "agy",
    dynamicModels: true,
    models: [],
  },

  // ==============================================================================
  // API PROVIDERS
  // ==============================================================================
  {
    id: "openrouter",
    name: "OpenRouter",
    mode: "api",
    isRecommended: true,
    dynamicModels: true,
    models: [], // Populated dynamically via fetchModels()
  },
  {
    id: "openai",
    name: "OpenAI",
    mode: "api",
    dynamicModels: true,
    models: [], // Populated dynamically via fetchModels()
  },
  {
    id: "google-ai-studio",
    name: "Google AI Studio",
    mode: "api",
    dynamicModels: true,
    models: [], // Populated dynamically via fetchModels()
  },
  {
    id: "anthropic",
    name: "Anthropic",
    mode: "api",
    dynamicModels: true,
    models: [], // Populated dynamically via fetchModels()
  },
  {
    id: "cerebras",
    name: "Cerebras",
    mode: "api",
    dynamicModels: true,
    models: [], // Populated dynamically via fetchModels()
  },
];

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Find a provider by its ID (e.g., "gemini-cli", "claude-code").
 */
export function getProviderById(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Find a provider by its binary name (e.g., "gemini", "claude").
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
 * Get all model IDs for a specific provider.
 */
export function getModelIds(providerId: string): string[] {
  const provider = getProviderById(providerId);
  return provider ? provider.models.map((m) => m.id) : [];
}

/**
 * Find a model by ID within a provider.
 */
export function getModelById(
  provider: ProviderDefinition,
  modelId: string,
): ModelDefinition | undefined {
  return provider.models.find((m) => m.id === modelId);
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
