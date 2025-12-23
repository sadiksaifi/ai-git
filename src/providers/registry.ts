import type { ProviderDefinition, ModelDefinition, Mode } from "../types.ts";

// ==============================================================================
// PROVIDER REGISTRY
// ==============================================================================

/**
 * Supported AI providers and their available models.
 * Add new providers here to extend support.
 */
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "claude",
    name: "Claude Code",
    mode: "cli",
    binary: "claude",
    isDefault: true,
    models: [
      { id: "haiku", name: "Claude Haiku", isDefault: true },
      { id: "sonnet", name: "Claude Sonnet" },
      { id: "opus", name: "Claude Opus" },
    ],
  },
  {
    id: "gemini",
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
  // API MODE PROVIDERS
  // ==============================================================================

  // OpenRouter - Access 200+ models via single API key
  {
    id: "openrouter",
    name: "OpenRouter",
    mode: "api",
    envVar: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsCustomBaseUrl: true,
    isDefault: true, // Default for API mode
    dynamicModels: true, // Models fetched from API at runtime
    modelsApiUrl: "https://openrouter.ai/api/v1/models",
    models: [], // Empty - populated dynamically
  },

  // Anthropic - Direct API access
  {
    id: "anthropic",
    name: "Anthropic",
    mode: "api",
    envVar: "ANTHROPIC_API_KEY",
    defaultBaseUrl: "https://api.anthropic.com",
    supportsCustomBaseUrl: true,
    models: [
      { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
      {
        id: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        isDefault: true,
      },
      { id: "claude-opus-4-1-20250805", name: "Claude Opus 4.1" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5 (Alias)" },
      {
        id: "claude-3-5-sonnet-latest",
        name: "Claude 3.5 Sonnet",
      },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
      { id: "claude-3-opus-latest", name: "Claude 3 Opus" },
    ],
  },

  // OpenAI - Direct API access
  {
    id: "openai",
    name: "OpenAI",
    mode: "api",
    envVar: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    supportsCustomBaseUrl: true,
    models: [
      { id: "gpt-5.2", name: "GPT-5.2", isDefault: true },
      { id: "gpt-5.2-pro", name: "GPT-5.2 Pro" },
      { id: "gpt-5-mini", name: "GPT-5 Mini" },
      { id: "gpt-5-nano", name: "GPT-5 Nano" },
      { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "o1", name: "o1" },
      { id: "o1-mini", name: "o1 Mini" },
    ],
  },

  // Google AI - Direct API access
  {
    id: "google",
    name: "Google AI",
    mode: "api",
    envVar: "GOOGLE_API_KEY",
    supportsCustomBaseUrl: false,
    models: [
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", isDefault: true },
      { id: "gemini-3-pro-image-preview", name: "Gemini 3 Pro Image" },
      {
        id: "gemini-2.0-flash-exp",
        name: "Gemini 2.0 Flash Exp",
      },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
    ],
  },
];

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Find a provider by its ID (e.g., "gemini", "claude").
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
