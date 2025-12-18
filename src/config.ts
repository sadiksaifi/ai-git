// ==============================================================================
// PROVIDER & MODEL CONFIGURATION
// ==============================================================================

export interface ModelConfig {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  binary: string;
  models: ModelConfig[];
  isDefault?: boolean;
}

/**
 * Supported AI providers and their available models.
 * Add new providers here to extend support.
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    id: "claude",
    name: "Claude Code",
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
    name: "Google Gemini",
    binary: "gemini",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", isDefault: true },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    ],
  },
  // Future providers:
  // {
  //   id: "codex",
  //   name: "OpenAI Codex",
  //   binary: "codex",
  //   models: [
  //     { id: "codex-mini", name: "Codex Mini", isDefault: true },
  //   ],
  // },
];

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Get the default provider configuration.
 */
export function getDefaultProvider(): ProviderConfig {
  const defaultProvider = PROVIDERS.find((p) => p.isDefault);
  if (!defaultProvider) {
    throw new Error("No default provider configured");
  }
  return defaultProvider;
}

/**
 * Get the default model for a given provider.
 */
export function getDefaultModel(provider: ProviderConfig): ModelConfig {
  const defaultModel = provider.models.find((m) => m.isDefault);
  if (!defaultModel) {
    throw new Error(`No default model configured for provider: ${provider.id}`);
  }
  return defaultModel;
}

/**
 * Find a provider by its ID (e.g., "gemini", "claude").
 */
export function getProviderById(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Find a provider by its binary name (e.g., "gemini", "claude").
 */
export function getProviderByBinary(binary: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.binary === binary);
}

/**
 * Get all available provider IDs for CLI help text.
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
