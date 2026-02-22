import { log } from "@clack/prompts";
import pc from "picocolors";
import type { UserConfig } from "../config.ts";

// ─── MIGRATION REGISTRY ──────────────────────────────────────────────

/**
 * A single config migration step.
 *
 * Migrations MUST be idempotent — they check whether they apply and
 * return `null` when the config is already in the expected state.
 * The `migrate` function receives a shallow-cloned config object and
 * mutates it in place for simplicity.
 *
 * @example
 * ```ts
 * {
 *   id: "rename-editor-field",
 *   description: "Rename 'editor' to 'editorCommand'",
 *   migrate(config) {
 *     if ("editor" in config && !("editorCommand" in config)) {
 *       config.editorCommand = config.editor;
 *       delete config.editor;
 *       return "Renamed 'editor' → 'editorCommand'";
 *     }
 *     return null;
 *   },
 * }
 * ```
 */
export interface ConfigMigration {
  /** Unique identifier for this migration (for logging/debugging). */
  id: string;
  /** Human-readable summary shown in migration notices. */
  description: string;
  /**
   * Apply the migration to a config object (mutated in place).
   * @param config - Shallow clone of the raw parsed config
   * @returns A human-readable change description if applied, or `null` if skipped.
   */
  migrate(config: Record<string, unknown>): string | null;
}

/**
 * Ordered list of config migrations.
 * Migrations run sequentially — earlier ones may affect later ones.
 *
 * ## Adding a new migration
 *
 * 1. Append a new {@link ConfigMigration} object to this array
 * 2. Add tests in `migration.test.ts`
 * 3. That's it — `migrateConfig()` picks it up automatically
 *
 * Keep each migration self-contained: inline any lookup data
 * (maps, constants) so the migration object tells the full story.
 */
export const migrations: ConfigMigration[] = [
  {
    id: "strip-legacy-mode",
    description: "Remove legacy 'mode' property",
    migrate(config) {
      if ("mode" in config) {
        delete config.mode;
        return "Removed legacy 'mode' property";
      }
      return null;
    },
  },
  {
    id: "claude-effort-model-defaults",
    description: "Migrate plain claude-code model IDs to effort defaults",
    migrate(config) {
      const MODEL_MAP: Record<string, string> = {
        sonnet: "sonnet-low",
        opus: "opus-low",
      };
      if (
        config.provider === "claude-code" &&
        typeof config.model === "string" &&
        config.model in MODEL_MAP
      ) {
        const old = config.model;
        config.model = MODEL_MAP[config.model];
        return `Migrated model '${old}' → '${config.model}'`;
      }
      return null;
    },
  },
];

// ─── MIGRATION ENGINE ─────────────────────────────────────────────────

/** Data needed to display a deferred migration notice. */
export interface MigrationNotice {
  changes: string[];
  backupPath?: string;
}

export interface MigrationResult {
  config: UserConfig;
  changed: boolean;
  /** Human-readable descriptions of each migration applied. */
  changes: string[];
}

/**
 * Migrate a raw config object to the current format.
 * Runs each registered migration in order, collecting human-readable
 * change descriptions for any that applied.
 *
 * @param raw - The raw parsed config (will not be mutated; a clone is used)
 */
export function migrateConfig(raw: Record<string, unknown>): MigrationResult {
  const config = { ...raw };
  const changes: string[] = [];
  for (const m of migrations) {
    const change = m.migrate(config);
    if (change !== null) changes.push(change);
  }
  return { config: config as UserConfig, changed: changes.length > 0, changes };
}

// ─── UTILITIES ────────────────────────────────────────────────────────

/**
 * Create a timestamped backup of a config file before migration.
 * Copies the original to `<path>.<timestamp>.bak`.
 *
 * @param configPath - Absolute path to the config file to back up
 * @returns The backup file path
 */
export async function backupConfigFile(configPath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${configPath}.${timestamp}.bak`;
  await Bun.write(backupPath, Bun.file(configPath));
  return backupPath;
}

/**
 * Display a migration notice to the user.
 * Shows what changed and where the backup was saved (if available).
 * Reusable for any future migration that modifies user files.
 *
 * @param changes - Human-readable list of migrations applied
 * @param backupPath - Path to the backup file created (omitted if backup failed)
 */
export function showMigrationNotice(changes: string[], backupPath?: string): void {
  const bullets = changes.map((c) => `  ${pc.yellow("•")} ${c}`).join("\n");
  const backupLine = backupPath ? `\n  Backup saved to ${pc.dim(backupPath)}` : "";
  log.warn(`Config migrated:\n${bullets}${backupLine}`);
}
