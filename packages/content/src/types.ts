// ==============================================================================
// @ai-git/meta — Shared Types
// ==============================================================================

/**
 * Flag category identifier.
 */
export type FlagCategory = "model" | "workflow" | "info";

/**
 * Definition of a flag category for display.
 */
export interface FlagCategoryDef {
  key: FlagCategory;
  label: string;
  order: number;
}

/**
 * Definition of a CLI flag.
 */
export interface FlagDef {
  long: string;
  short?: string;
  arg?: string;
  description: string;
  category: FlagCategory;
}

/**
 * Definition of a CLI subcommand.
 */
export interface CommandDef {
  name: string;
  description: string;
}

/**
 * Provider type: CLI binary or HTTP API.
 */
export type ProviderType = "cli" | "api";

/**
 * Documentation metadata for a provider.
 * Consumer-agnostic — no runtime logic or rendering.
 */
export interface ProviderDoc {
  id: string;
  name: string;
  type: ProviderType;
  requirementsUrl: string;
  requirementsLabel: string;
}

/**
 * Extended documentation for CLI providers (includes install info).
 */
export interface CLIProviderDoc extends ProviderDoc {
  type: "cli";
  binary: string;
  installCommand: string;
  docsUrl: string;
}

/**
 * Error message template.
 */
export interface ErrorTemplate {
  message: string;
  suggestion: string;
}
