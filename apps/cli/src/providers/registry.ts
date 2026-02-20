import type { ProviderDefinition, ModelDefinition, Mode } from "../types.ts";

// ==============================================================================
// PROVIDER REGISTRY
// ==============================================================================

/**
 * Supported AI providers and their available models.
 * Add new providers here to extend support.
 */
export const PROVIDERS: ProviderDefinition[] = [
  // ==============================================================================
  // CLI PROVIDERS
  // ==============================================================================
  {
    id: "codex",
    name: "Codex",
    mode: "cli",
    binary: "codex",
    isDefault: true,
    models: [
      // gpt-5.3-codex (xhigh, high, medium, low)
      { id: "gpt-5.3-codex-xhigh", name: "GPT-5.3 Codex (xhigh)" },
      { id: "gpt-5.3-codex-high", name: "GPT-5.3 Codex (high)" },
      { id: "gpt-5.3-codex-medium", name: "GPT-5.3 Codex (medium)" },
      { id: "gpt-5.3-codex-low", name: "GPT-5.3 Codex (low)", isDefault: true },
      // gpt-5.2-codex (xhigh, high, medium, low)
      { id: "gpt-5.2-codex-xhigh", name: "GPT-5.2 Codex (xhigh)" },
      { id: "gpt-5.2-codex-high", name: "GPT-5.2 Codex (high)" },
      { id: "gpt-5.2-codex-medium", name: "GPT-5.2 Codex (medium)" },
      { id: "gpt-5.2-codex-low", name: "GPT-5.2 Codex (low)" },
      // gpt-5.2 (xhigh, high, medium, low)
      { id: "gpt-5.2-xhigh", name: "GPT-5.2 (xhigh)" },
      { id: "gpt-5.2-high", name: "GPT-5.2 (high)" },
      { id: "gpt-5.2-medium", name: "GPT-5.2 (medium)" },
      { id: "gpt-5.2-low", name: "GPT-5.2 (low)" },
      // gpt-5.1-codex (high, medium, low)
      { id: "gpt-5.1-codex-high", name: "GPT-5.1 Codex (high)" },
      { id: "gpt-5.1-codex-medium", name: "GPT-5.1 Codex (medium)" },
      { id: "gpt-5.1-codex-low", name: "GPT-5.1 Codex (low)" },
      // gpt-5.1-codex-max (high, medium, low)
      { id: "gpt-5.1-codex-max-high", name: "GPT-5.1 Codex Max (high)" },
      { id: "gpt-5.1-codex-max-medium", name: "GPT-5.1 Codex Max (medium)" },
      { id: "gpt-5.1-codex-max-low", name: "GPT-5.1 Codex Max (low)" },
      // gpt-5.1-codex-mini (high, medium, low)
      { id: "gpt-5.1-codex-mini-high", name: "GPT-5.1 Codex Mini (high)" },
      { id: "gpt-5.1-codex-mini-medium", name: "GPT-5.1 Codex Mini (medium)" },
      { id: "gpt-5.1-codex-mini-low", name: "GPT-5.1 Codex Mini (low)" },
    ],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    mode: "cli",
    binary: "claude",
    models: [
      // sonnet (low, medium, high)
      { id: "sonnet-low", name: "Claude Sonnet (low)", isDefault: true },
      { id: "sonnet-medium", name: "Claude Sonnet (medium)" },
      { id: "sonnet-high", name: "Claude Sonnet (high)" },
      // opus (low, medium, high)
      { id: "opus-low", name: "Claude Opus (low)" },
      { id: "opus-medium", name: "Claude Opus (medium)" },
      { id: "opus-high", name: "Claude Opus (high)" },
      // doesn't have an effort level
      { id: "haiku", name: "Claude Haiku" },
    ],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    mode: "cli",
    binary: "gemini",
    models: [
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview",
        isDefault: true,
      },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    ],
  },

  // ==============================================================================
  // API PROVIDERS
  // ==============================================================================
  {
    id: "openrouter",
    name: "OpenRouter",
    mode: "api",
    isDefault: true, // Recommended API provider
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
export function getProviderByBinary(
  binary: string,
): ProviderDefinition | undefined {
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
