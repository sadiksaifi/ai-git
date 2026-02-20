import type { UserConfig } from "../config.ts";

/**
 * Claude Code models that support effort levels.
 * Plain IDs for these models are migrated to their default effort variant.
 */
const CLAUDE_EFFORT_MODEL_MIGRATION: Record<string, string> = {
  sonnet: "sonnet-low",
  opus: "opus-low",
};

export interface MigrationResult {
  config: UserConfig;
  changed: boolean;
}

/**
 * Migrate a raw config object to the current format.
 * Runs at config load time to ensure existing configs stay valid.
 *
 * Migrations:
 * 1. Strip legacy 'mode' property
 * 2. Migrate plain claude-code model IDs to effort defaults (sonnet → sonnet-low)
 */
export function migrateConfig(raw: Record<string, unknown>): MigrationResult {
  let changed = false;
  const config = { ...raw };

  // Migration 1: Strip legacy 'mode' property
  if ("mode" in config) {
    delete config.mode;
    changed = true;
  }

  // Migration 2: Migrate plain claude-code model IDs to effort defaults
  if (
    config.provider === "claude-code" &&
    typeof config.model === "string" &&
    config.model in CLAUDE_EFFORT_MODEL_MIGRATION
  ) {
    config.model = CLAUDE_EFFORT_MODEL_MIGRATION[config.model];
    changed = true;
  }

  return { config: config as UserConfig, changed };
}
