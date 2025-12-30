import {
  intro,
  outro,
  select,
  note,
  isCancel,
  log,
  password,
  spinner,
} from "@clack/prompts";
import pc from "picocolors";
import prompts from "prompts";
import { PROVIDERS, getProviderById } from "../providers/registry.ts";
import { getAdapter } from "../providers/index.ts";
import { getAPIAdapter } from "../providers/api/index.ts";
import {
  saveUserConfig,
  saveProjectConfig,
  CONFIG_FILE,
  getProjectConfigPath,
  type UserConfig,
} from "../config.ts";
import type { Mode } from "../types.ts";
import {
  isSecretsAvailable,
  setApiKey,
  getApiKey,
} from "./secrets/index.ts";
import { getCachedModels, cacheModels, type CachedModel } from "./model-cache.ts";
import { findDefaultModel } from "./model-ranking.ts";

// ==============================================================================
// FIRST-RUN SETUP WIZARD
// ==============================================================================

/**
 * Run the first-time setup wizard.
 * Walks the user through selecting their mode, provider, and model.
 * Will not save config if the selected provider's CLI is not installed.
 *
 * @param defaults - Optional default values (e.g., from CLI flags)
 * @param target - Where to save the configuration ("global" or "project")
 * @returns The saved configuration
 */
export async function runSetupWizard(
  defaults?: Partial<UserConfig>,
  target: "global" | "project" = "global"
): Promise<UserConfig> {
  console.clear();

  const configFile =
    target === "global" ? CONFIG_FILE : await getProjectConfigPath();
  const configType = target === "global" ? "Global" : "Project";

  note(
    `Let's configure your ${configType} AI Git settings.\n` +
      "This setup will only run once. Your settings will be saved to:\n" +
      pc.dim(configFile),
    pc.bgCyan(pc.black(` Welcome to AI Git (${configType} Setup) `))
  );

  // Step 1: Select Mode
  const modeResult = await select({
    message: "Select connection mode:",
    options: [
      {
        value: "cli",
        label: "CLI",
        hint: "Use installed AI CLI tools (claude, gemini)",
      },
      {
        value: "api",
        label: "API",
        hint: "Use API keys (OpenRouter, OpenAI, Anthropic, Gemini)",
      },
    ],
    initialValue: defaults?.mode ?? "cli",
  });

  if (isCancel(modeResult)) {
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  const mode = modeResult as Mode;

  // Handle API mode
  if (mode === "api") {
    return await setupAPIMode(defaults, target, configFile, configType);
  }

  // Handle CLI mode
  return await setupCLIMode(defaults, target, configFile, configType);
}

// ==============================================================================
// CLI MODE SETUP
// ==============================================================================

async function setupCLIMode(
  defaults: Partial<UserConfig> | undefined,
  target: "global" | "project",
  configFile: string,
  configType: string
): Promise<UserConfig> {
  // Step 2: Select Provider (CLI mode)
  const cliProviders = PROVIDERS.filter((p) => p.mode === "cli");
  const providerResult = await select({
    message: "Select AI provider:",
    options: cliProviders.map((p) => ({
      value: p.id,
      label: p.name,
      hint: p.isDefault ? "recommended" : undefined,
    })),
    initialValue:
      defaults?.provider ?? cliProviders.find((p) => p.isDefault)?.id,
  });

  if (isCancel(providerResult)) {
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  const provider = providerResult as string;
  const providerDef = getProviderById(provider);

  if (!providerDef) {
    console.error(pc.red(`Error: Unknown provider '${provider}'.`));
    process.exit(1);
  }

  // Check if the CLI binary is available - MUST be installed to proceed
  const adapter = getAdapter(provider, "cli");
  if (adapter) {
    const isAvailable = await adapter.checkAvailable();
    if (!isAvailable) {
      console.error("");
      console.error(
        pc.red(`Error: '${providerDef.binary}' CLI is not installed.`)
      );
      console.error("");
      console.error(
        `The ${providerDef.name} CLI must be installed before you can use AI Git.`
      );
      console.error("");
      console.error(
        pc.dim("Please install it and run ai-git again to complete setup.")
      );
      console.error("");
      process.exit(1);
    }
  }

  // Step 3: Select Model
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
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  const model = modelResult as string;

  // Save the configuration
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

  note(
    `Mode: ${pc.cyan("cli")}\n` +
      `Provider: ${pc.cyan(providerDef.name)}\n` +
      `Model: ${pc.cyan(
        providerDef.models.find((m) => m.id === model)?.name ?? model
      )}`,
    `${configType} Configuration Saved`
  );

  outro(pc.green("Setup complete! Run ai-git to generate your first commit."));

  return config;
}

// ==============================================================================
// API MODE SETUP
// ==============================================================================

async function setupAPIMode(
  defaults: Partial<UserConfig> | undefined,
  target: "global" | "project",
  configFile: string,
  configType: string
): Promise<UserConfig> {
  // Check platform support (macOS only for now)
  if (!isSecretsAvailable()) {
    note(
      "API mode is currently only available on macOS.\n" +
        "Support for Linux and Windows is coming soon.\n\n" +
        "For now, please use CLI mode with an installed AI CLI tool.",
      "Platform Not Supported"
    );
    // Fall back to CLI mode
    return await setupCLIMode(defaults, target, configFile, configType);
  }

  // Step 2: Select API Provider
  const apiProviders = PROVIDERS.filter((p) => p.mode === "api");
  const defaultApiProvider = apiProviders.find((p) => p.isDefault)?.id ?? "openrouter";

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
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  const provider = providerResult as string;
  const providerDef = getProviderById(provider);

  if (!providerDef) {
    console.error(pc.red(`Error: Unknown provider '${provider}'.`));
    process.exit(1);
  }

  // Step 3: Enter API Key
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
      outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
      process.exit(1);
    }

    if (useExisting === "use") {
      apiKey = existingKey;
    } else {
      apiKey = await promptForApiKey(providerDef.name);
    }
  } else {
    apiKey = await promptForApiKey(providerDef.name);
  }

  // Step 4: Validate API Key and Fetch Models
  const s = spinner();
  s.start("Validating API key and fetching models...");

  let models: CachedModel[];

  try {
    const adapter = getAPIAdapter(provider);
    if (!adapter) {
      s.stop(pc.red("Error: Provider adapter not found"));
      process.exit(1);
    }

    // Fetch models (validates the API key)
    const fetchedModels = await adapter.fetchModels(apiKey);

    if (fetchedModels.length === 0) {
      s.stop(pc.red("Error: No models available"));
      console.error(pc.red("The API returned no models. Please check your API key."));
      process.exit(1);
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
    console.error("");
    console.error(
      pc.red(
        `API Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
    console.error("");
    console.error(pc.dim("Please check your API key and try again."));
    process.exit(1);
  }

  // Step 5: Select Model (with fuzzy search for large lists)
  const model = await selectModel(models, provider, defaults?.model);

  // Save the configuration
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
    `Mode: ${pc.cyan("api")}\n` +
      `Provider: ${pc.cyan(providerDef.name)}\n` +
      `Model: ${pc.cyan(modelName)}`,
    `${configType} Configuration Saved`
  );

  outro(pc.green("Setup complete! Run ai-git to generate your first commit."));

  return config;
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
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
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
): Promise<string> {
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
      outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
      process.exit(1);
    }

    return modelResult as string;
  }

  // For large lists, use prompts with autocomplete for fuzzy search
  console.log(""); // Add spacing
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
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  return result.model;
}
