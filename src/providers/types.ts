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
  /** The prompt/input text to send to the AI */
  prompt: string;
}

/**
 * Provider adapter interface.
 * Each AI provider (CLI or API based) implements this interface
 * to handle their specific invocation patterns.
 */
export interface ProviderAdapter {
  /** Unique provider identifier (e.g., "gemini", "claude") */
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
 * API-specific adapter interface (for future use).
 */
export interface APIProviderAdapter extends ProviderAdapter {
  mode: "api";
  /** Base URL for the API (optional, uses default if not specified) */
  baseUrl?: string;
}
