// ==============================================================================
// CONFIG DIAGNOSTICS
// Detailed configuration validation with actionable error messages.
// ==============================================================================

import pc from "picocolors";
import type { UserConfig } from "../../config.ts";
import { getProviderById } from "../../providers/registry.ts";
import { getAdapter } from "../../providers/index.ts";
import { isSecretsAvailable, hasApiKey } from "../secrets/index.ts";
import { ERROR_MESSAGES, INSTALL_INFO } from "./constants.ts";

// ==============================================================================
// TYPES
// ==============================================================================

export interface ConfigDiagnostic {
  valid: boolean;
  errors: ConfigError[];
  warnings: ConfigWarning[];
}

export interface ConfigError {
  code: string;
  message: string;
  suggestion: string;
}

export interface ConfigWarning {
  code: string;
  message: string;
}

// ==============================================================================
// DIAGNOSTIC FUNCTIONS
// ==============================================================================

/**
 * Validate configuration and return detailed diagnostics.
 * Unlike isConfigComplete(), this provides actionable error messages.
 */
export async function diagnoseConfig(
  config: UserConfig | undefined
): Promise<ConfigDiagnostic> {
  const errors: ConfigError[] = [];
  const warnings: ConfigWarning[] = [];

  if (!config) {
    errors.push({
      code: "NO_CONFIG",
      message: ERROR_MESSAGES.noConfig.message,
      suggestion: ERROR_MESSAGES.noConfig.suggestion,
    });
    return { valid: false, errors, warnings };
  }

  // Check mode
  if (!config.mode) {
    errors.push({
      code: "MISSING_MODE",
      message: ERROR_MESSAGES.missingMode.message,
      suggestion: ERROR_MESSAGES.missingMode.suggestion,
    });
  } else if (config.mode !== "cli" && config.mode !== "api") {
    const err = ERROR_MESSAGES.invalidMode(config.mode);
    errors.push({
      code: "INVALID_MODE",
      message: err.message,
      suggestion: err.suggestion,
    });
  }

  // Check provider
  if (!config.provider) {
    errors.push({
      code: "MISSING_PROVIDER",
      message: ERROR_MESSAGES.missingProvider.message,
      suggestion: ERROR_MESSAGES.missingProvider.suggestion,
    });
  } else {
    const provider = getProviderById(config.provider);
    if (!provider) {
      const err = ERROR_MESSAGES.invalidProvider(config.provider);
      errors.push({
        code: "INVALID_PROVIDER",
        message: err.message,
        suggestion: err.suggestion,
      });
    } else {
      // Provider exists, check availability based on mode
      if (config.mode === "cli") {
        const adapter = getAdapter(config.provider, "cli");
        if (adapter) {
          const available = await adapter.checkAvailable();
          if (!available && provider.binary) {
            const installKey = config.provider as keyof typeof INSTALL_INFO;
            const installInfo = INSTALL_INFO[installKey];
            errors.push({
              code: "CLI_NOT_INSTALLED",
              message: `${provider.name} CLI (${provider.binary}) is not installed.`,
              suggestion: installInfo
                ? `Install: ${installInfo.installCommand}`
                : `Install the ${provider.binary} CLI and try again.`,
            });
          }
        }
      } else if (config.mode === "api") {
        // Check platform support
        if (!isSecretsAvailable()) {
          errors.push({
            code: "PLATFORM_NOT_SUPPORTED",
            message: ERROR_MESSAGES.platformNotSupported.message,
            suggestion: ERROR_MESSAGES.platformNotSupported.hint,
          });
        } else {
          // Check API key
          const keyExists = await hasApiKey(config.provider);
          if (!keyExists) {
            const err = ERROR_MESSAGES.apiKeyMissing(provider.name);
            errors.push({
              code: "API_KEY_MISSING",
              message: err.message,
              suggestion: err.suggestion,
            });
          }
        }
      }
    }
  }

  // Check model
  if (!config.model) {
    errors.push({
      code: "MISSING_MODEL",
      message: ERROR_MESSAGES.missingModel.message,
      suggestion: ERROR_MESSAGES.missingModel.suggestion,
    });
  } else if (config.provider) {
    const provider = getProviderById(config.provider);
    if (provider && !provider.dynamicModels) {
      const modelExists = provider.models.some((m) => m.id === config.model);
      if (!modelExists) {
        const err = ERROR_MESSAGES.invalidModel(config.model, provider.name);
        errors.push({
          code: "INVALID_MODEL",
          message: err.message,
          suggestion: `Available models: ${provider.models.map((m) => m.id).join(", ")}`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format diagnostic results for display.
 */
export function formatDiagnostics(diagnostic: ConfigDiagnostic): string {
  if (diagnostic.valid) {
    return pc.green("Configuration is valid.");
  }

  const lines: string[] = [pc.red(pc.bold("Configuration Error")), ""];

  for (const error of diagnostic.errors) {
    lines.push(pc.red(`  ${error.message}`));
    lines.push(pc.dim(`  ${error.suggestion}`));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Quick check if config is valid (without detailed diagnostics).
 * Use diagnoseConfig() when you need detailed error messages.
 */
export function isConfigValid(config: UserConfig | undefined): boolean {
  if (!config) return false;
  if (!config.mode || (config.mode !== "cli" && config.mode !== "api"))
    return false;
  if (!config.provider) return false;
  if (!config.model) return false;

  const provider = getProviderById(config.provider);
  if (!provider) return false;

  // For non-dynamic providers, validate model exists
  if (!provider.dynamicModels) {
    const modelExists = provider.models.some((m) => m.id === config.model);
    if (!modelExists) return false;
  }

  return true;
}
