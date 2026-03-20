// ==============================================================================
// @ai-git/content — Shared Types
// ==============================================================================

/**
 * Provider type: CLI binary or HTTP API.
 */
export type ProviderType = "cli" | "api";

/**
 * Documentation metadata for a provider.
 */
export interface ProviderDoc {
  id: string;
  name: string;
  type: ProviderType;
  requirementsUrl: string;
  requirementsLabel: string;
}

/**
 * Extended documentation for CLI providers.
 */
export interface CLIProviderDoc extends ProviderDoc {
  type: "cli";
  binary: string;
  installCommand: string;
  docsUrl: string;
}

/**
 * A core feature of AI Git.
 */
export interface Feature {
  id: string;
  label: string;
  description: string;
}

/**
 * An installation method.
 */
export interface InstallMethod {
  id: string;
  label: string;
  command: string;
  note?: string;
  platform?: string;
  recommended?: boolean;
}

/**
 * A CLI usage example.
 */
export interface UsageExample {
  command: string;
  description: string;
}

/**
 * A configuration example.
 */
export interface ConfigExample {
  title: string;
  description: string;
  json: Record<string, unknown>;
}
