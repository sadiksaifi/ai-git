import * as fs from "node:fs";
import { log } from "@clack/prompts";
import pc from "picocolors";
import type { UserConfig } from "../config.ts";

/**
 * Claude Code models that support effort levels.
 * Plain IDs for these models are migrated to their default effort variant.
 */
const CLAUDE_EFFORT_MODEL_MIGRATION: Record<string, string> = {
  sonnet: "sonnet-low",
  opus: "opus-low",
};

/** Data needed to display a deferred migration notice. */
export interface MigrationNotice {
  changes: string[];
  backupPath: string;
}

export interface MigrationResult {
  config: UserConfig;
  changed: boolean;
  /** Human-readable descriptions of each migration applied. */
  changes: string[];
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
  const changes: string[] = [];
  const config = { ...raw };

  // Migration 1: Strip legacy 'mode' property
  if ("mode" in config) {
    delete config.mode;
    changes.push("Removed legacy 'mode' property");
  }

  // Migration 2: Migrate plain claude-code model IDs to effort defaults
  if (
    config.provider === "claude-code" &&
    typeof config.model === "string" &&
    config.model in CLAUDE_EFFORT_MODEL_MIGRATION
  ) {
    const oldModel = config.model;
    config.model = CLAUDE_EFFORT_MODEL_MIGRATION[config.model];
    changes.push(`Migrated model '${oldModel}' → '${config.model}'`);
  }

  return { config: config as UserConfig, changed: changes.length > 0, changes };
}

/**
 * Create a timestamped backup of a config file before migration.
 * Copies the original to `<path>.bak`. Overwrites any existing backup.
 *
 * @param configPath - Absolute path to the config file to back up
 * @returns The backup file path
 */
export async function backupConfigFile(configPath: string): Promise<string> {
  const backupPath = `${configPath}.bak`;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

/**
 * Display a migration notice to the user.
 * Shows what changed and where the backup was saved.
 * Reusable for any future migration that modifies user files.
 *
 * @param changes - Human-readable list of migrations applied
 * @param backupPath - Path to the backup file created
 */
export function showMigrationNotice(changes: string[], backupPath: string): void {
  const bullets = changes.map((c) => `  ${pc.yellow("•")} ${c}`).join("\n");
  log.warn(
    `Config migrated:\n${bullets}\n  Backup saved to ${pc.dim(backupPath)}`
  );
}
