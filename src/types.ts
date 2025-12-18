// ==============================================================================
// CORE TYPE DEFINITIONS
// ==============================================================================

/**
 * Connection mode - how we communicate with the AI provider.
 * - "cli": Uses installed CLI tools (claude, gemini, codex)
 * - "api": Uses API calls via SDK (OpenAI, OpenRouter, Vertex) - future
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
  /** Available models for this provider */
  models: ModelDefinition[];
  /** Whether this is the default provider */
  isDefault?: boolean;
}
