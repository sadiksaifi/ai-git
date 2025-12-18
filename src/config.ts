import * as path from "node:path";
import * as os from "node:os";
import type { Mode } from "./types.ts";
import { getProviderById } from "./providers/registry.ts";

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
  /** Connection mode (cli or api) */
  mode?: Mode;
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
}

/**
 * Resolved configuration with all values populated.
 */
export interface ResolvedConfig {
  mode: Mode;
  provider: string;
  model: string;
  defaults: {
    stageAll: boolean;
    commit: boolean;
    push: boolean;
  };
  prompt?: PromptCustomization;
}

/**
 * Path to the config directory.
 */
export const CONFIG_DIR = path.join(os.homedir(), ".config", "ai-git");

/**
 * Path to the config file.
 */
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

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
    return JSON.parse(content) as UserConfig;
  } catch {
    // Config file doesn't exist or is invalid JSON
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
 * Check if the configuration is complete and valid.
 * Used to determine if the setup wizard should run.
 *
 * A config is complete if it has:
 * - mode set to a valid value
 * - provider set to a valid provider ID
 * - model set to a valid model ID for that provider
 */
export function isConfigComplete(config: UserConfig | undefined): boolean {
  if (!config) return false;

  // Check required fields exist
  if (!config.mode || !config.provider || !config.model) {
    return false;
  }

  // Validate mode
  if (config.mode !== "cli" && config.mode !== "api") {
    return false;
  }

  // Validate provider exists
  const provider = getProviderById(config.provider);
  if (!provider) {
    return false;
  }

  // Validate model exists for this provider
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
 * Priority: CLI flags > User config file
 *
 * Note: This function assumes the setup wizard has already run,
 * so the config file contains valid mode, provider, and model values.
 */
export async function resolveConfigAsync(
  cliOptions: Partial<ResolvedConfig>
): Promise<ResolvedConfig> {
  const userConfig = await loadUserConfig();

  // Config file must exist and be valid (setup wizard ensures this)
  if (!userConfig || !userConfig.mode || !userConfig.provider || !userConfig.model) {
    throw new Error("Configuration is incomplete. Please run: ai-git --setup");
  }

  // Start with config file values (required)
  const resolved: ResolvedConfig = {
    mode: userConfig.mode,
    provider: userConfig.provider,
    model: userConfig.model,
    defaults: { ...DEFAULT_WORKFLOW_OPTIONS, ...userConfig.defaults },
    prompt: userConfig.prompt,
  };

  // Apply CLI options (highest priority - overrides config file)
  if (cliOptions.mode !== undefined) {
    resolved.mode = cliOptions.mode;
  }
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

/**
 * Infer mode from provider if not explicitly set.
 * Falls back to the provider's defined mode.
 */
export function inferModeFromProvider(providerId: string): Mode {
  const provider = getProviderById(providerId);
  return provider?.mode ?? "cli";
}

// Re-export registry functions for convenience
export {
  getProviderById,
  getProviderByBinary,
  getProvidersByMode,
  getProviderIds,
  getModelIds,
  getModelById,
} from "./providers/registry.ts";
