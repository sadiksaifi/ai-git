import * as path from "node:path";
import { getProviderById } from "./providers/registry.ts";
import { getRepoRoot } from "./lib/git.ts";
import { CONFIG_DIR, CONFIG_FILE } from "./lib/paths.ts";
import { migrateConfig } from "./lib/migration.ts";

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

/**
 * Load user configuration from the config file.
 * Returns undefined if the file doesn't exist or is invalid.
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

    const { config, changed } = migrateConfig(raw);
    if (changed) {
      await saveUserConfig(config);
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

    const { config, changed } = migrateConfig(raw);
    if (changed) {
      await saveProjectConfig(config);
    }

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
    $schema: CONFIG_SCHEMA_URL,
    ...config,
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
    $schema: CONFIG_SCHEMA_URL,
    ...config,
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
