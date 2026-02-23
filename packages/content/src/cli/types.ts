// ==============================================================================
// @ai-git/content — CLI Types
// ==============================================================================

export type { ProviderType, ProviderDoc, CLIProviderDoc } from "../shared/types.ts";

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
 * Error message template.
 */
export interface ErrorTemplate {
  message: string;
  suggestion: string;
}
