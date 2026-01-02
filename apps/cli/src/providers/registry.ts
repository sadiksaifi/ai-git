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
    id: "claude-code",
    name: "Claude Code",
    mode: "cli",
    binary: "claude",
    models: [
      { id: "haiku", name: "Claude Haiku", isDefault: true },
      { id: "sonnet", name: "Claude Sonnet" },
      { id: "opus", name: "Claude Opus" },
    ],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    mode: "cli",
    binary: "gemini",
    isDefault: true,
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
  {
    id: "codex",
    name: "Codex",
    mode: "cli",
    binary: "codex",
    models: [
      { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", isDefault: true },
      { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
      { id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini" },
      { id: "gpt-5.2", name: "GPT-5.2" },
      { id: "gpt-5.1", name: "GPT-5.1" },
      { id: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
      { id: "gpt-5-codex", name: "GPT-5 Codex" },
      { id: "gpt-5-codex-mini", name: "GPT-5 Codex Mini" },
      { id: "gpt-5", name: "GPT-5" },
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
