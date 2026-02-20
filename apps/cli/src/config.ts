import * as path from "node:path";
import { getProviderById } from "./providers/registry.ts";
import { getRepoRoot } from "./lib/git.ts";
import { CONFIG_DIR, CONFIG_FILE } from "./lib/paths.ts";
import { migrateConfig, backupConfigFile, showMigrationNotice, type MigrationNotice } from "./lib/migration.ts";

// ==============================================================================
// CONFIG FILE MANAGEMENT
// ==============================================================================

/**
 * Customization options for the AI prompt.
 * These supplement (not replace) the base system prompt.
 */
export interface PromptCustomization {
  /**
   * Project-specific context to help the AI understand your codebase.
   * Examples:
   * - "This is a React Native app using Expo SDK 54"
   * - "We use Jira tickets in format PROJ-123"
   * - "Valid scopes: web, mobile, shared, api"
   */
  context?: string;

  /**
   * Style preferences for commit messages.
   * Examples:
   * - "Always include scope when possible"
   * - "Keep body under 5 bullet points"
   * - "Reference ticket IDs from branch name in footer"
   */
  style?: string;

  /**
   * Custom commit message examples.
   * If provided, these replace the default examples.
   * Each string should be a complete commit message (header + body + optional footer).
   */
  examples?: string[];
}

/**
 * User configuration schema for ~/.config/ai-git/config.json
 */
export interface UserConfig {
  /** Default provider ID */
  provider?: string;
  /** Default model ID */
  model?: string;
  /** Default CLI behavior options */
  defaults?: {
    stageAll?: boolean;
    commit?: boolean;
    push?: boolean;
  };
  /** Prompt customization options */
  prompt?: PromptCustomization;
  /** Preferred editor command */
  editor?: string;
  /** Milliseconds before showing slow-generation warning. Default 5 000. Set to 0 to disable. */
  slowWarningThresholdMs?: number;
}

/**
 * Resolved configuration with all values populated.
 */
export interface ResolvedConfig {
  provider: string;
  model: string;
  defaults: {
    stageAll: boolean;
    commit: boolean;
    push: boolean;
  };
  prompt?: PromptCustomization;
  editor?: string;
  /** Resolved slow-warning threshold in ms (defaults to 5 000). */
  slowWarningThresholdMs: number;
}

export { CONFIG_DIR, CONFIG_FILE };

/**
 * Get the path to the project config file (.ai-git.json).
 * Looks for it in the git repo root, or current directory if not in a repo.
 */
export async function getProjectConfigPath(): Promise<string> {
  const repoRoot = await getRepoRoot();
  return path.join(repoRoot || process.cwd(), ".ai-git.json");
}

/** Pending migration notice to display after the welcome screen. */
let pendingMigrationNotice: MigrationNotice | null = null;

/**
 * Show any pending migration notice and clear it.
 * Call this after the welcome screen renders so `console.clear()` doesn't wipe it.
 */
export function flushMigrationNotice(): void {
  if (pendingMigrationNotice) {
    showMigrationNotice(pendingMigrationNotice.changes, pendingMigrationNotice.backupPath);
    pendingMigrationNotice = null;
  }
}

/**
 * Load user configuration from the config file.
 * Returns undefined if the file doesn't exist or is invalid.
 *
 * If migration is needed, a backup is created and the config is saved.
 * The migration notice is deferred — call `flushMigrationNotice()` after
 * the welcome screen to display it.
 */
export async function loadUserConfig(): Promise<UserConfig | undefined> {
  try {
    const file = Bun.file(CONFIG_FILE);
    const exists = await file.exists();
    if (!exists) {
      return undefined;
    }
    const content = await file.text();
    const raw = JSON.parse(content);

    const { config, changed, changes } = migrateConfig(raw);
    if (changed) {
      let backupPath = "";
      try {
        backupPath = await backupConfigFile(CONFIG_FILE);
      } catch {
        // best-effort: backup failure shouldn't block config load
      }
      saveUserConfig(config).catch(() => {});
      pendingMigrationNotice = { changes, backupPath: backupPath || undefined };
    }

    return config;
  } catch {
    return undefined;
  }
}

/**
 * Load project configuration from the project config file.
 * Returns undefined if the file doesn't exist or is invalid.
 */
export async function loadProjectConfig(): Promise<UserConfig | undefined> {
  try {
    const configPath = await getProjectConfigPath();
    const file = Bun.file(configPath);
    const exists = await file.exists();
    if (!exists) {
      return undefined;
    }
    const content = await file.text();
    const raw = JSON.parse(content);

    // Migrate in-memory only — don't auto-save project configs since
    // .ai-git.json is typically committed and auto-rewriting would
    // produce unexpected diffs for team members.
    const { config } = migrateConfig(raw);

    return config;
  } catch {
    return undefined;
  }
}

/**
 * JSON Schema URL for editor autocomplete and validation.
 */
const CONFIG_SCHEMA_URL =
  "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json";

/**
 * Save user configuration to the config file.
 * Includes $schema for editor autocomplete/validation support.
 */
export async function saveUserConfig(config: UserConfig): Promise<void> {
  // Ensure config directory exists
  const { mkdir } = await import("node:fs/promises");
  await mkdir(CONFIG_DIR, { recursive: true });

  // Add $schema at the top for editor support
  const configWithSchema = {
    ...config,
    $schema: CONFIG_SCHEMA_URL,
  };

  await Bun.write(CONFIG_FILE, JSON.stringify(configWithSchema, null, 2));
}

/**
 * Save project configuration to the project config file.
 * Includes $schema for editor autocomplete/validation support.
 */
export async function saveProjectConfig(config: UserConfig): Promise<void> {
  // Add $schema at the top for editor support
  const configWithSchema = {
    ...config,
    $schema: CONFIG_SCHEMA_URL,
  };

  const configPath = await getProjectConfigPath();
  await Bun.write(configPath, JSON.stringify(configWithSchema, null, 2));
}

/**
 * Check if the configuration is complete and valid.
 * Used to determine if the setup wizard should run.
 *
 * A config is complete if it has:
 * - provider set to a valid provider ID
 * - model set to a valid model ID for that provider
 */
export function isConfigComplete(config: UserConfig | undefined): boolean {
  if (!config) {
    return false;
  }

  // Check required fields exist
  if (!config.provider || !config.model) {
    return false;
  }

  // Validate provider exists
  const provider = getProviderById(config.provider);
  if (!provider) {
    return false;
  }

  // For API providers with dynamic models, skip model validation
  // (models are fetched at runtime, not stored in the registry)
  if (provider.dynamicModels) {
    return true;
  }

  // Validate model exists for this provider (CLI providers only)
  const modelExists = provider.models.some((m) => m.id === config.model);
  if (!modelExists) {
    return false;
  }

  return true;
}

/**
 * Default workflow options.
 */
const DEFAULT_WORKFLOW_OPTIONS = {
  stageAll: false,
  commit: false,
  push: false,
};

/**
 * Default slow-warning threshold in milliseconds.
 * Shows a spinner warning when AI generation exceeds this duration.
 * Set to 0 to disable.
 */
export const DEFAULT_SLOW_WARNING_THRESHOLD_MS = 5_000;

/**
 * Resolve configuration by merging CLI options with user config.
 * Priority: CLI flags > Project config file > User config file
 *
 * Note: This function assumes the setup wizard has already run,
 * so the config file contains valid provider and model values.
 */
export async function resolveConfigAsync(
  cliOptions: Partial<ResolvedConfig>
): Promise<ResolvedConfig> {
  const userConfig = await loadUserConfig();
  const projectConfig = await loadProjectConfig();

  // Config file must exist and be valid (setup wizard ensures this)
  // We check userConfig primarily, but if projectConfig exists and is complete, that's fine too.
  // However, usually we expect at least a user config to exist after setup.
  if ((!userConfig || !isConfigComplete(userConfig)) && (!projectConfig || !isConfigComplete(projectConfig))) {
    throw new Error("Configuration is incomplete. Please run: ai-git --setup");
  }

  // Base config is user config, or empty if not present (but one of them must be present per above check)
  const baseConfig = userConfig || {} as UserConfig;

  // Merge project config on top of user config
  const mergedConfig = {
    ...baseConfig,
    ...projectConfig,
    defaults: { ...baseConfig.defaults, ...projectConfig?.defaults },
    prompt: { ...baseConfig.prompt, ...projectConfig?.prompt },
  };

  // Fallbacks are just for safety, the check above ensures we should have them.
  const resolved: ResolvedConfig = {
    provider: mergedConfig.provider ?? baseConfig.provider!,
    model: mergedConfig.model ?? baseConfig.model!,
    defaults: { ...DEFAULT_WORKFLOW_OPTIONS, ...mergedConfig.defaults },
    prompt: mergedConfig.prompt,
    editor: mergedConfig.editor,
    slowWarningThresholdMs: mergedConfig.slowWarningThresholdMs ?? DEFAULT_SLOW_WARNING_THRESHOLD_MS,
  };

  // Apply CLI options (highest priority - overrides config file)
  if (cliOptions.provider !== undefined) {
    resolved.provider = cliOptions.provider;
  }
  if (cliOptions.model !== undefined) {
    resolved.model = cliOptions.model;
  }
  if (cliOptions.defaults !== undefined) {
    resolved.defaults = { ...resolved.defaults, ...cliOptions.defaults };
  }

  return resolved;
}

// Re-export registry functions for convenience
export {
  getProviderById,
  getProviderByBinary,
  getProviderIds,
  getModelIds,
  getModelById,
} from "./providers/registry.ts";
