import type { Mode } from "../types.ts";

// ==============================================================================
// PROVIDER ADAPTER INTERFACES
// ==============================================================================

/**
 * Options passed to the AI provider for invocation.
 */
export interface InvokeOptions {
  /** Model identifier to use */
  model: string;
  /** System instructions (rules, role, examples) */
  system: string;
  /** User content (context, diff, refinement instructions) */
  prompt: string;
}

/**
 * Provider adapter interface.
 * Each AI provider (CLI or API based) implements this interface
 * to handle their specific invocation patterns.
 */
export interface ProviderAdapter {
  /** Unique provider identifier (e.g., "gemini-cli", "claude-code") */
  providerId: string;

  /** Connection mode (cli or api) */
  mode: Mode;

  /**
   * Invoke the AI with the given options.
   * @param options - Model and prompt text
   * @returns The AI's response text
   */
  invoke(options: InvokeOptions): Promise<string>;

  /**
   * Check if the provider is available.
   * For CLI mode: checks if binary is in PATH
   * For API mode: checks if API key is configured
   * @returns true if available, false otherwise
   */
  checkAvailable(): Promise<boolean>;
}

/**
 * CLI-specific adapter interface with binary information.
 */
export interface CLIProviderAdapter extends ProviderAdapter {
  mode: "cli";
  /** CLI binary name (e.g., "gemini", "claude") */
  binary: string;
}

/**
 * Model definition returned from API providers.
 */
export interface APIModelDefinition {
  /** Full model ID */
  id: string;
  /** Human-readable display name */
  name: string;
  /** For OpenRouter: the original provider (anthropic, openai, google) */
  provider?: string;
}

/**
 * API-specific adapter interface.
 */
export interface APIProviderAdapter extends ProviderAdapter {
  mode: "api";
  /** Base URL for the API (optional, uses default if not specified) */
  baseUrl?: string;

  /**
   * Fetch available models from the API.
   * @param apiKey - Optional API key to use (for validation during setup)
   * @returns List of available models
   */
  fetchModels(apiKey?: string): Promise<APIModelDefinition[]>;
}
