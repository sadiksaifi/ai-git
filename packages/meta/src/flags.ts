import type { FlagDef, FlagCategory, FlagCategoryDef } from "./types.ts";

// ==============================================================================
// @ai-git/meta — Flag Definitions
// ==============================================================================

/**
 * Ordered flag category definitions.
 */
export const FLAG_CATEGORIES: FlagCategoryDef[] = [
  { key: "model", label: "Model", order: 1 },
  { key: "workflow", label: "Workflow", order: 2 },
  { key: "info", label: "Info", order: 3 },
];

/**
 * All CLI flag definitions.
 *
 * Custom shorthands are uppercase. Framework shorthands (-v, -h) are lowercase
 * per universal CLI convention.
 */
export const FLAGS = {
  provider: {
    long: "--provider",
    arg: "<id>",
    description: "Use a specific AI provider for this run",
    category: "model" as FlagCategory,
  },
  model: {
    long: "--model",
    arg: "<id>",
    description: "Use a specific model for this run",
    category: "model" as FlagCategory,
  },
  stageAll: {
    short: "-A",
    long: "--stage-all",
    description: "Stage all changes before generating",
    category: "workflow" as FlagCategory,
  },
  commit: {
    short: "-C",
    long: "--commit",
    description: "Commit without confirmation",
    category: "workflow" as FlagCategory,
  },
  push: {
    short: "-P",
    long: "--push",
    description: "Push to remote after committing",
    category: "workflow" as FlagCategory,
  },
  hint: {
    short: "-H",
    long: "--hint",
    arg: "<text>",
    description: "Guide the AI with additional context",
    category: "workflow" as FlagCategory,
  },
  exclude: {
    short: "-X",
    long: "--exclude",
    arg: "<pattern>",
    description: "Skip files when staging (glob, regex, or path)",
    category: "workflow" as FlagCategory,
  },
  dangerouslyAutoApprove: {
    long: "--dangerously-auto-approve",
    description: "Stage, commit, and push without prompts",
    category: "workflow" as FlagCategory,
  },
  dryRun: {
    long: "--dry-run",
    description: "Preview the prompt without calling the AI",
    category: "workflow" as FlagCategory,
  },
  version: {
    short: "-v",
    long: "--version",
    description: "Show version",
    category: "info" as FlagCategory,
  },
  help: {
    short: "-h",
    long: "--help",
    description: "Show help",
    category: "info" as FlagCategory,
  },
} as const satisfies Record<string, FlagDef>;
