// ==============================================================================
// SETUP WIZARD
// Enhanced setup flow with better error handling.
// ==============================================================================

import {
  select,
  note,
  isCancel,
  log,
  password,
  spinner,
} from "@clack/prompts";
import pc from "picocolors";
import prompts from "prompts";
import { PROVIDERS, getProviderById } from "../../providers/registry.ts";
import { getAdapter } from "../../providers/index.ts";
import { getAPIAdapter } from "../../providers/api/index.ts";
import {
  saveUserConfig,
  saveProjectConfig,
  CONFIG_FILE,
  getProjectConfigPath,
  type UserConfig,
} from "../../config.ts";
import type { Mode } from "../../types.ts";
import {
  isSecretsAvailable,
  setApiKey,
  getApiKey,
} from "../secrets/index.ts";
import {
  getCachedModels,
  cacheModels,
  type CachedModel,
} from "../model-cache.ts";
import { findDefaultModel } from "../model-ranking.ts";
import { INSTALL_INFO, ERROR_MESSAGES } from "./constants.ts";

// ==============================================================================
// TYPES
// ==============================================================================

export interface WizardOptions {
  defaults?: Partial<UserConfig>;
  target: "global" | "project";
}

export interface WizardResult {
  config: UserConfig | null;
  completed: boolean;
}

interface InternalFlowResult extends WizardResult {
  restart?: boolean;
}

interface FlowContext {
  defaults?: Partial<UserConfig>;
  target: "global" | "project";
  configFile: string;
  configType: string;
}

// ==============================================================================
// MAIN WIZARD
// ==============================================================================

/**
 * Run the setup wizard with progress indicators.
 */
export async function runWizard(options: WizardOptions): Promise<WizardResult> {
  const { defaults, target } = options;
  const configFile =
    target === "global" ? CONFIG_FILE : await getProjectConfigPath();
  const configType = target === "global" ? "Global" : "Project";

  // Determine if API mode is available upfront
  const apiModeAvailable = isSecretsAvailable();

  type ModeOption = {
    value: Mode;
    label: string;
    hint: string;
  };

  const modeOptions: ModeOption[] = [
    {
      value: "cli",
      label: "CLI Mode",
      hint: "Use installed AI CLI tools (claude-code, gemini-cli)",
    },
    {
      value: "api",
      label: "API Mode",
      hint: apiModeAvailable
        ? "Use API keys (OpenRouter, OpenAI, Anthropic, Gemini)"
        : pc.yellow("macOS only - not available on this platform"),
    },
  ];

  const modeResult = await select({
    message: "Select connection mode:",
    options: modeOptions,
    initialValue: defaults?.mode ?? "cli",
  });

  if (isCancel(modeResult)) {
    return { config: null, completed: false };
  }

  const mode = modeResult as Mode;

  // Handle API mode selection on unsupported platform
  if (mode === "api" && !apiModeAvailable) {
    note(
      [
        ERROR_MESSAGES.platformNotSupported.message,
        "",
        pc.dim(ERROR_MESSAGES.platformNotSupported.hint),
      ].join("\n"),
      pc.yellow(ERROR_MESSAGES.platformNotSupported.title)
    );

    // Offer to switch to CLI mode
    const switchToCli = await select({
      message: "What would you like to do?",
      options: [
        { value: "cli", label: "Use CLI mode instead" },
        { value: "exit", label: "Exit setup" },
      ],
    });

    if (isCancel(switchToCli) || switchToCli === "exit") {
      return { config: null, completed: false };
    }

    // Continue with CLI mode
    const cliResult = await setupCLIFlow({
      defaults,
      target,
      configFile,
      configType,
    });
    if (cliResult.restart) {
      return await runWizard(options);
    }
    return cliResult;
  }

  // Route to appropriate flow
  if (mode === "api") {
    return await setupAPIFlow({ defaults, target, configFile, configType });
  }

  const cliResult = await setupCLIFlow({ defaults, target, configFile, configType });
  if (cliResult.restart) {
    return await runWizard(options);
  }
  return cliResult;
}

// ==============================================================================
// CLI MODE FLOW
// ==============================================================================

async function setupCLIFlow(ctx: FlowContext): Promise<InternalFlowResult> {
  const { defaults, target, configFile, configType } = ctx;

  const cliProviders = PROVIDERS.filter((p) => p.mode === "cli");

  // Pre-check which providers are available
  const providerAvailability = await Promise.all(
    cliProviders.map(async (p) => {
      const adapter = getAdapter(p.id, "cli");
      const available = adapter ? await adapter.checkAvailable() : false;
      return { provider: p, available };
    })
  );

  const providerOptions = providerAvailability.map(({ provider, available }) => ({
    value: provider.id,
    label: provider.name,
    hint: !available
      ? pc.yellow(`not installed`)
      : provider.isDefault
        ? "recommended"
        : undefined,
  }));

  const providerResult = await select({
    message: "Select CLI provider:",
    options: providerOptions,
    initialValue:
      defaults?.provider ?? cliProviders.find((p) => p.isDefault)?.id,
  });

  if (isCancel(providerResult)) {
    return { config: null, completed: false };
  }

  const provider = providerResult as string;
  const providerDef = getProviderById(provider);

  if (!providerDef) {
    log.error(pc.red(`Error: Unknown provider '${provider}'.`));
    return { config: null, completed: false };
  }

  // Check if selected CLI is available
  const selectedAvailability = providerAvailability.find(
    (pa) => pa.provider.id === provider
  );

  if (!selectedAvailability?.available) {
    // Show helpful installation instructions
    const installKey = provider as keyof typeof INSTALL_INFO;
    const errorInfo = ERROR_MESSAGES.cliNotInstalled(
      providerDef.binary!,
      installKey
    );

    note(
      [
        errorInfo.message,
        "",
        pc.bold("To install:"),
        ...errorInfo.solutions.map((s) => `  ${pc.cyan(">")} ${s}`),
      ].join("\n"),
      pc.red(errorInfo.title)
    );

    // Ask if they want to try a different option
    const retry = await select({
      message: "What would you like to do?",
      options: [
        { value: "retry", label: "Choose a different option" },
        { value: "exit", label: "Exit and install the CLI first" },
      ],
    });

    if (isCancel(retry) || retry === "exit") {
      return { config: null, completed: false };
    }

    // Return special result to restart from mode selection
    return { config: null, completed: false, restart: true };
  }

  const modelResult = await select({
    message: "Select model:",
    options: providerDef.models.map((m) => ({
      value: m.id,
      label: m.name,
      hint: m.isDefault ? "recommended" : undefined,
    })),
    initialValue:
      defaults?.model ?? providerDef.models.find((m) => m.isDefault)?.id,
  });

  if (isCancel(modelResult)) {
    return { config: null, completed: false };
  }

  const model = modelResult as string;

  // Save configuration
  const config: UserConfig = {
    mode: "cli",
    provider,
    model,
  };

  if (target === "global") {
    await saveUserConfig(config);
  } else {
    await saveProjectConfig(config);
  }

  // Success summary
  note(
    [
      `Mode: ${pc.cyan("CLI")}`,
      `Provider: ${pc.cyan(providerDef.name)}`,
      `Model: ${pc.cyan(
        providerDef.models.find((m) => m.id === model)?.name ?? model
      )}`,
      "",
      pc.dim(`Saved to: ${configFile}`),
    ].join("\n"),
    pc.green(`${configType} Configuration Saved`)
  );

  return { config, completed: true };
}

// ==============================================================================
// API MODE FLOW
// ==============================================================================

async function setupAPIFlow(ctx: FlowContext): Promise<WizardResult> {
  const { defaults, target, configFile, configType } = ctx;

  const apiProviders = PROVIDERS.filter((p) => p.mode === "api");
  const defaultApiProvider =
    apiProviders.find((p) => p.isDefault)?.id ?? "openrouter";

  const providerResult = await select({
    message: "Select API provider:",
    options: apiProviders.map((p) => ({
      value: p.id,
      label: p.name,
      hint: p.id === "openrouter" ? "recommended" : undefined,
    })),
    initialValue: defaults?.provider ?? defaultApiProvider,
  });

  if (isCancel(providerResult)) {
    return { config: null, completed: false };
  }

  const provider = providerResult as string;
  const providerDef = getProviderById(provider);

  if (!providerDef) {
    log.error(pc.red(`Error: Unknown provider '${provider}'.`));
    return { config: null, completed: false };
  }

  const existingKey = await getApiKey(provider);
  let apiKey: string;

  if (existingKey) {
    const useExisting = await select({
      message: "An API key is already saved. What would you like to do?",
      options: [
        { value: "use", label: "Use existing key" },
        { value: "replace", label: "Enter a new key" },
      ],
    });

    if (isCancel(useExisting)) {
      return { config: null, completed: false };
    }

    if (useExisting === "use") {
      apiKey = existingKey;
    } else {
      apiKey = await promptForApiKey(providerDef.name);
      if (!apiKey) return { config: null, completed: false };
    }
  } else {
    apiKey = await promptForApiKey(providerDef.name);
    if (!apiKey) return { config: null, completed: false };
  }

  const s = spinner();
  s.start("Validating API key and fetching models...");

  let models: CachedModel[];

  try {
    const adapter = getAPIAdapter(provider);
    if (!adapter) {
      s.stop(pc.red("Error: Provider adapter not found"));
      return { config: null, completed: false };
    }

    // Fetch models (validates the API key)
    const fetchedModels = await adapter.fetchModels(apiKey);

    if (fetchedModels.length === 0) {
      s.stop(pc.red("Error: No models available"));
      log.error(
        pc.red("The API returned no models. Please check your API key.")
      );
      return { config: null, completed: false };
    }

    // Map to CachedModel format
    models = fetchedModels.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
    }));

    // Cache the models
    await cacheModels(provider, models);

    // Save the API key (it's validated now)
    await setApiKey(provider, apiKey);

    s.stop(pc.green(`Found ${models.length} models`));
  } catch (error) {
    s.stop(pc.red("Error validating API key"));
    log.error("");
    log.error(
      pc.red(
        `API Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    log.error("");
    log.error(pc.dim("Please check your API key and try again."));

    // Offer to retry
    const retry = await select({
      message: "What would you like to do?",
      options: [
        { value: "retry", label: "Enter a different API key" },
        { value: "exit", label: "Exit setup" },
      ],
    });

    if (isCancel(retry) || retry === "exit") {
      return { config: null, completed: false };
    }

    // Recursively restart from API key step
    return await setupAPIFlow(ctx);
  }

  // Select model
  const model = await selectModel(models, provider, defaults?.model);
  if (!model) {
    return { config: null, completed: false };
  }

  // Save configuration
  const config: UserConfig = {
    mode: "api",
    provider,
    model,
  };

  if (target === "global") {
    await saveUserConfig(config);
  } else {
    await saveProjectConfig(config);
  }

  // Find model name for display
  const modelName = models.find((m) => m.id === model)?.name ?? model;

  note(
    [
      `Mode: ${pc.cyan("API")}`,
      `Provider: ${pc.cyan(providerDef.name)}`,
      `Model: ${pc.cyan(modelName)}`,
      "",
      pc.dim(`Saved to: ${configFile}`),
    ].join("\n"),
    pc.green(`${configType} Configuration Saved`)
  );

  return { config, completed: true };
}

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Prompt user for API key with validation.
 */
async function promptForApiKey(providerName: string): Promise<string> {
  const apiKeyResult = await password({
    message: `Enter your ${providerName} API key:`,
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "API key is required";
      }
      if (value.trim().length < 10) {
        return "API key seems too short. Please check and try again.";
      }
      return undefined;
    },
  });

  if (isCancel(apiKeyResult)) {
    return "";
  }

  return apiKeyResult as string;
}

/**
 * Select a model with fuzzy search support for large lists.
 */
async function selectModel(
  models: CachedModel[],
  providerId: string,
  defaultModel?: string
): Promise<string | null> {
  // Find the recommended default model
  const recommendedModel = defaultModel ?? findDefaultModel(models, providerId);

  // For small lists (< 20 models), use @clack/prompts select
  if (models.length <= 20) {
    const modelResult = await select({
      message: "Select model:",
      options: models.map((m) => ({
        value: m.id,
        label: m.name,
        hint: m.id === recommendedModel ? "recommended" : undefined,
      })),
      initialValue: recommendedModel ?? models[0]?.id,
    });

    if (isCancel(modelResult)) {
      return null;
    }

    return modelResult as string;
  }

  // For large lists, use prompts with autocomplete for fuzzy search
  log.message("");
  log.info(pc.dim("Type to search models. Use arrow keys to navigate."));

  // Find index of recommended model for initial selection
  const initialIndex = recommendedModel
    ? models.findIndex((m) => m.id === recommendedModel)
    : 0;

  const result = await prompts({
    type: "autocomplete",
    name: "model",
    message: "Select model (type to search):",
    choices: models.map((m, i) => ({
      title: i === initialIndex ? `${m.name} (recommended)` : m.name,
      value: m.id,
      description: m.id,
    })),
    initial: Math.max(0, initialIndex),
    suggest: async (input, choices) => {
      const term = input.toLowerCase();
      if (!term) return choices;

      return choices.filter(
        (c) =>
          c.title.toLowerCase().includes(term) ||
          (c.value as string).toLowerCase().includes(term)
      );
    },
  });

  if (!result.model) {
    return null;
  }

  return result.model;
}
