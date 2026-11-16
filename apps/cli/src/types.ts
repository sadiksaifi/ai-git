// ==============================================================================
// CORE TYPE DEFINITIONS
// ==============================================================================

/**
 * Connection mode - how we communicate with the AI provider.
 * - "cli": Uses installed CLI tools (claude-code, antigravity-cli, codex)
 * - "api": Uses API calls via Vercel AI SDK (OpenRouter, OpenAI, Anthropic, Gemini)
 */
export type Mode = "cli" | "api";

/**
 * Provider definition - represents an AI service.
 * Every provider lists its models live: CLI providers during `configure`,
 * API providers from their models endpoint.
 */
export interface ProviderDefinition {
  /** Unique provider identifier (e.g., "claude-code", "antigravity-cli") */
  id: string;
  /** Human-readable provider name (e.g., "Claude", "Google Gemini") */
  name: string;
  /** Connection mode for this provider */
  mode: Mode;
  /** CLI binary name (only for mode: "cli") */
  binary?: string;
  /** Whether this provider is recommended for new users */
  isRecommended?: boolean;
}
