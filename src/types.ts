// ==============================================================================
// CORE TYPE DEFINITIONS
// ==============================================================================

/**
 * Connection mode - how we communicate with the AI provider.
 * - "cli": Uses installed CLI tools (claude, gemini, codex)
 * - "api": Uses API calls via SDK (OpenAI, OpenRouter) - future
 */
export type Mode = "cli" | "api";

/**
 * Model definition within a provider.
 */
export interface ModelDefinition {
  /** Unique model identifier (e.g., "haiku", "gemini-3-flash-preview") */
  id: string;
  /** Human-readable model name (e.g., "Claude Haiku") */
  name: string;
  /** Whether this is the default model for the provider */
  isDefault?: boolean;
}

/**
 * Provider definition - represents an AI service.
 */
export interface ProviderDefinition {
  /** Unique provider identifier (e.g., "claude", "gemini") */
  id: string;
  /** Human-readable provider name (e.g., "Claude", "Google Gemini") */
  name: string;
  /** Connection mode for this provider */
  mode: Mode;
  /** CLI binary name (only for mode: "cli") */
  binary?: string;
  /** Environment variable name for API key (only for mode: "api") */
  envVar?: string;
  /** Default base URL for the API (only for mode: "api") */
  defaultBaseUrl?: string;
  /** Whether this provider supports custom base URLs (only for mode: "api") */
  supportsCustomBaseUrl?: boolean;
  /** Whether models are fetched dynamically from an API (e.g., OpenRouter) */
  dynamicModels?: boolean;
  /** URL to fetch models from (only if dynamicModels is true) */
  modelsApiUrl?: string;
  /** Available models for this provider (empty if dynamicModels is true) */
  models: ModelDefinition[];
  /** Whether this is the default provider */
  isDefault?: boolean;
}
