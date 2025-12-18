// ==============================================================================
// PROVIDER ADAPTER INTERFACES
// ==============================================================================

/**
 * Options passed to the AI provider for invocation.
 */
export interface InvokeOptions {
  model: string;
  input: string;
}

/**
 * Provider adapter interface.
 * Each AI CLI tool (Gemini, Claude, Codex) implements this interface
 * to handle their specific invocation patterns.
 */
export interface ProviderAdapter {
  /** Unique provider identifier (e.g., "gemini", "claude") */
  providerId: string;

  /** CLI binary name (e.g., "gemini", "claude") */
  binary: string;

  /**
   * Invoke the AI with the given options.
   * @param options - Model and input text
   * @returns The AI's response text
   */
  invoke(options: InvokeOptions): Promise<string>;

  /**
   * Check if the provider's CLI binary is available in PATH.
   * @returns true if available, false otherwise
   */
  checkAvailable(): Promise<boolean>;
}
