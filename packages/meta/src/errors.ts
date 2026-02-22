import type { ErrorTemplate } from "./types.ts";
import { CLI_NAME } from "./meta.ts";

// ==============================================================================
// @ai-git/meta — Error Message Templates
// ==============================================================================

/**
 * Error message templates with actionable suggestions.
 * Plain strings only — consumers handle formatting.
 */
export const ERROR_TEMPLATES = {
  noConfig: {
    message: "No configuration found.",
    suggestion: `Run: ${CLI_NAME} configure`,
  } satisfies ErrorTemplate,

  missingProvider: {
    message: "No AI provider configured.",
    suggestion: `Run: ${CLI_NAME} configure to select a provider.`,
  } satisfies ErrorTemplate,

  invalidProvider: (id: string): ErrorTemplate => ({
    message: `Unknown provider '${id}'.`,
    suggestion: `Run: ${CLI_NAME} configure to choose a valid provider.`,
  }),

  missingModel: {
    message: "No model configured.",
    suggestion: `Run: ${CLI_NAME} configure to select a model.`,
  } satisfies ErrorTemplate,

  invalidModel: (modelId: string, providerName: string): ErrorTemplate => ({
    message: `Unknown model '${modelId}' for ${providerName}.`,
    suggestion: `Run: ${CLI_NAME} configure to choose a valid model.`,
  }),

  apiKeyMissing: (providerName: string): ErrorTemplate => ({
    message: `API key for ${providerName} not found in secure storage.`,
    suggestion: `Run: ${CLI_NAME} configure to set up your API key.`,
  }),

  deprecatedModel: (displayName: string, modelId: string, providerId: string): ErrorTemplate => ({
    message: `Configured model '${displayName}' (${modelId}) is deprecated for provider '${providerId}'.`,
    suggestion: `Run: ${CLI_NAME} configure to choose a supported model.`,
  }),

  modelNotFound: (model: string): ErrorTemplate => ({
    message: `The model '${model}' was not found.`,
    suggestion: `Run: ${CLI_NAME} configure to select a different model.`,
  }),

  providerNotAvailable: (providerId: string): ErrorTemplate => ({
    message: `Provider '${providerId}' is not available.`,
    suggestion: "Check your API key configuration.",
  }),

  cliNotInstalled: (binary: string, providerName: string): ErrorTemplate => ({
    message: `'${binary}' CLI is not installed.`,
    suggestion: `The ${providerName} CLI must be installed to use AI Git.`,
  }),
} as const;
