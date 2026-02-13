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
import {
  setApiKey,
  getApiKey,
} from "../secrets/index.ts";
import {
  getCachedModels,
  cacheModels,
  type CachedModel,
} from "../model-cache.ts";
import { INSTALL_INFO, ERROR_MESSAGES } from "./constants.ts";
import {
  findRecommendedModel,
  getModelCatalog,
} from "../../providers/api/models/index.ts";

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
 * Shows all providers in a unified list with type hints (CLI/API).
 */
export async function runWizard(options: WizardOptions): Promise<WizardResult> {
  const { defaults, target } = options;
  const configFile =
    target === "global" ? CONFIG_FILE : await getProjectConfigPath();
  const configType = target === "global" ? "Global" : "Project";

  // Pre-check CLI provider availability
  const cliProviders = PROVIDERS.filter((p) => p.mode === "cli");
  const cliAvailability = await Promise.all(
    cliProviders.map(async (p) => {
      const adapter = getAdapter(p.id);
      const available = adapter ? await adapter.checkAvailable() : false;
      return { providerId: p.id, available };
    })
  );
  const cliAvailabilityMap = new Map(
    cliAvailability.map((a) => [a.providerId, a.available])
  );

  // Build unified provider options with type hints
  const providerOptions = PROVIDERS.map((p) => {
    const isCli = p.mode === "cli";
    const isApi = p.mode === "api";

    let hint: string | undefined;
    if (isCli) {
      const available = cliAvailabilityMap.get(p.id);
      if (!available) {
        hint = pc.yellow("not installed");
      } else if (p.isDefault) {
        hint = "recommended";
      }
    } else if (isApi) {
      if (p.isDefault) {
        hint = "recommended";
      }
    }

    const typeLabel = isCli ? "CLI" : "API";
    return {
      value: p.id,
      label: `${p.name} (${typeLabel})`,
      hint,
    };
  });

  // Find default provider (prefer CLI default, then API default)
  const defaultProvider =
    defaults?.provider ??
    PROVIDERS.find((p) => p.mode === "cli" && p.isDefault)?.id ??
    PROVIDERS.find((p) => p.isDefault)?.id;

  const providerResult = await select({
    message: "Select AI provider:",
    options: providerOptions,
    initialValue: defaultProvider,
  });

  if (isCancel(providerResult)) {
    return { config: null, completed: false };
  }

  const providerId = providerResult as string;
  const providerDef = getProviderById(providerId);

  if (!providerDef) {
    log.error(pc.red(`Error: Unknown provider '${providerId}'.`));
    return { config: null, completed: false };
  }

  // Route to appropriate flow based on provider's mode
  const ctx: FlowContext = { defaults, target, configFile, configType };

  if (providerDef.mode === "api") {
    return await setupAPIFlow(ctx, providerId);
  }

  // CLI provider
  const cliResult = await setupCLIFlow(ctx, providerId, cliAvailabilityMap);
  if (cliResult.restart) {
    return await runWizard(options);
  }
  return cliResult;
}

// ==============================================================================
// CLI MODE FLOW
// ==============================================================================

async function setupCLIFlow(
  ctx: FlowContext,
  providerId: string,
  availabilityMap: Map<string, boolean>
): Promise<InternalFlowResult> {
  const { defaults, target, configFile, configType } = ctx;

  const providerDef = getProviderById(providerId);
  if (!providerDef) {
    log.error(pc.red(`Error: Unknown provider '${providerId}'.`));
    return { config: null, completed: false };
  }

  // Check if selected CLI is available
  const isAvailable = availabilityMap.get(providerId);

  if (!isAvailable) {
    // Show helpful installation instructions
    const installKey = providerId as keyof typeof INSTALL_INFO;
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
        { value: "retry", label: "Choose a different provider" },
        { value: "exit", label: "Exit and install the CLI first" },
      ],
    });

    if (isCancel(retry) || retry === "exit") {
      return { config: null, completed: false };
    }

    // Return special result to restart from provider selection
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

  // Save configuration (without mode)
  const config: UserConfig = {
    provider: providerId,
    model,
  };

  if (target === "global") {
    await saveUserConfig(config);
  } else {
    await saveProjectConfig(config);
  }

  // Minimal success message
  const modelName = providerDef.models.find((m) => m.id === model)?.name ?? model;
  log.success(`${pc.cyan(providerDef.name)} → ${pc.cyan(modelName)}`);

  return { config, completed: true };
}

// ==============================================================================
// API MODE FLOW
// ==============================================================================

async function setupAPIFlow(
  ctx: FlowContext,
  providerId: string
): Promise<WizardResult> {
  const { defaults, target, configFile, configType } = ctx;

  const providerDef = getProviderById(providerId);
  if (!providerDef) {
    log.error(pc.red(`Error: Unknown provider '${providerId}'.`));
    return { config: null, completed: false };
  }

  const existingKey = await getApiKey(providerId);
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
    const adapter = getAPIAdapter(providerId);
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
    await cacheModels(providerId, models);

    // Save the API key (it's validated now)
    await setApiKey(providerId, apiKey);

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
    return await setupAPIFlow(ctx, providerId);
  }

  // Select model
  const model = await selectModel(models, providerId, defaults?.model);
  if (!model) {
    return { config: null, completed: false };
  }

  // Save configuration (without mode)
  const config: UserConfig = {
    provider: providerId,
    model,
  };

  if (target === "global") {
    await saveUserConfig(config);
  } else {
    await saveProjectConfig(config);
  }

  // Minimal success message
  const modelName = models.find((m) => m.id === model)?.name ?? model;
  log.success(`${pc.cyan(providerDef.name)} → ${pc.cyan(modelName)}`);

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
  let recommendedModel = defaultModel;

  if (!recommendedModel) {
    try {
      const catalog = await getModelCatalog();
      const supportedProviderId =
        providerId === "openrouter" ||
        providerId === "anthropic" ||
        providerId === "openai" ||
        providerId === "google-ai-studio"
          ? providerId
          : null;

      if (supportedProviderId) {
        recommendedModel = findRecommendedModel(
          supportedProviderId,
          models,
          catalog,
          "balanced"
        ) ?? undefined;
      }
    } catch {
      // Recommendation is non-critical; continue with the first model fallback.
    }
  }

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
