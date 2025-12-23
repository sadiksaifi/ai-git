import {
  intro,
  outro,
  select,
  note,
  isCancel,
  log,
  password,
  text,
  spinner,
} from "@clack/prompts";
import prompts from "prompts";
import { Fzf } from "fzf";
import pc from "picocolors";
import { PROVIDERS, getProviderById } from "../providers/registry.ts";
import { getAdapter } from "../providers/index.ts";
import { saveUserConfig, CONFIG_FILE, type UserConfig } from "../config.ts";
import type { Mode, ProviderDefinition } from "../types.ts";
import {
  getApiKey,
  setApiKey,
  getApiKeySource,
  isKeychainAvailable,
  getEnvVarName,
} from "../providers/api/credentials.ts";
import {
  getDisplayModels,
  formatContextLength,
  type OpenRouterModel,
} from "../providers/api/openrouter-models.ts";

// ==============================================================================
// FIRST-RUN SETUP WIZARD
// ==============================================================================

/**
 * Run the first-time setup wizard.
 * Walks the user through selecting their mode, provider, and model.
 * Will not save config if the selected provider's CLI is not installed.
 *
 * @param defaults - Optional default values (e.g., from CLI flags)
 * @returns The saved configuration
 */
export async function runSetupWizard(
  defaults?: Partial<UserConfig>
): Promise<UserConfig> {
  console.clear();
  // intro(pc.bgCyan(pc.black(" AI Git Setup ")));

  note(
    "Let's configure your AI Git.\n" +
      "This setup will only run once. Your settings will be saved to:\n" +
      pc.dim(CONFIG_FILE),
    pc.bgCyan(pc.black(" Welcome to AI Git! "))
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
        hint: "Use API keys (OpenRouter, OpenAI, Anthropic, Google)",
      },
    ],
    initialValue: defaults?.mode ?? "cli",
  });

  if (isCancel(modeResult)) {
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  const mode = modeResult as Mode;

  // Step 2: Select Provider based on mode
  const modeProviders = PROVIDERS.filter((p) => p.mode === mode);
  const providerResult = await select({
    message: "Select AI provider:",
    options: modeProviders.map((p) => ({
      value: p.id,
      label: p.name,
      hint: p.isDefault ? "recommended" : undefined,
    })),
    initialValue:
      defaults?.provider ?? modeProviders.find((p) => p.isDefault)?.id,
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

  // Handle CLI mode - check if binary is available
  if (mode === "cli") {
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
  }

  // Handle API mode - check/configure API key
  if (mode === "api") {
    await configureApiKey(provider, providerDef.name);
  }

  // Step 3: Select Model
  let model: string;

  if (providerDef.dynamicModels) {
    // Dynamic provider (e.g., OpenRouter) - fetch models from API
    model = await selectDynamicModel(provider, providerDef, defaults?.model);
  } else {
    // Static provider - use hardcoded models
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

    model = modelResult as string;
  }

  // Save the configuration
  const config: UserConfig = {
    mode,
    provider,
    model,
  };

  await saveUserConfig(config);

  // Get model display name
  const modelDisplayName = providerDef.dynamicModels
    ? model // For dynamic providers, just show the model ID
    : providerDef.models.find((m) => m.id === model)?.name ?? model;

  note(
    `Mode: ${pc.cyan(mode)}\n` +
      `Provider: ${pc.cyan(providerDef.name)}\n` +
      `Model: ${pc.cyan(modelDisplayName)}`,
    "Configuration Saved"
  );

  outro(pc.green("Setup complete! Run ai-git to generate your first commit."));

  return config;
}

// ==============================================================================
// API KEY CONFIGURATION HELPER
// ==============================================================================

/**
 * Configure API key for a provider.
 * Checks for existing key, prompts for new one if needed,
 * and stores it securely in the OS keychain.
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @param providerName - Human-readable provider name for display
 */
async function configureApiKey(
  providerId: string,
  providerName: string
): Promise<void> {
  // Check for existing API key
  const existingKey = await getApiKey(providerId);
  const keySource = await getApiKeySource(providerId);
  const envVar = getEnvVarName(providerId);

  if (existingKey) {
    // Key already exists
    const maskedKey = maskApiKey(existingKey);
    const sourceText =
      keySource === "env" ? `environment (${envVar})` : "keychain";
    log.info(`API key found in ${sourceText}: ${pc.dim(maskedKey)}`);
    return;
  }

  // No key found - prompt user to enter one
  const keychainAvailable = await isKeychainAvailable();

  note(
    `${providerName} requires an API key.\n\n` +
      (keychainAvailable
        ? `Your key will be stored securely in the OS keychain.`
        : `Tip: Set ${pc.cyan(
            envVar || "API_KEY"
          )} environment variable for persistent storage.`),
    "API Key Required"
  );

  const apiKeyResult = await password({
    message: `Enter your ${providerName} API key:`,
    validate: (value) => {
      if (!value || value.length < 10) {
        return "Please enter a valid API key (at least 10 characters)";
      }
    },
  });

  if (isCancel(apiKeyResult)) {
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  const apiKey = apiKeyResult as string;

  // Try to store in keychain
  if (keychainAvailable) {
    const stored = await setApiKey(providerId, apiKey);
    if (stored) {
      log.success("API key stored securely in OS keychain.");
    } else {
      log.warn("Could not store API key in keychain.");
      log.info(
        `Set ${pc.cyan(
          envVar || "API_KEY"
        )} environment variable for persistent storage.`
      );
    }
  } else {
    log.warn("OS keychain not available on this system.");
    log.info(
      `Set ${pc.cyan(
        envVar || "API_KEY"
      )} environment variable for persistent storage.`
    );
  }

  // Verify the adapter can now access the key
  const adapter = getAdapter(providerId, "api");
  if (adapter) {
    // Temporarily set the env var for verification (will be read from keychain next time)
    if (envVar) {
      process.env[envVar] = apiKey;
    }

    const isAvailable = await adapter.checkAvailable();
    if (!isAvailable) {
      console.error(pc.red("Error: Could not verify API key."));
      process.exit(1);
    }
  }
}

/**
 * Mask an API key for safe display.
 * Shows first 4 and last 4 characters.
 *
 * @param key - The API key to mask
 * @returns Masked key (e.g., "sk-a...xyz1")
 */
function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return "****";
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// ==============================================================================
// DYNAMIC MODEL SELECTION
// ==============================================================================

/**
 * Select a model from a dynamic provider (e.g., OpenRouter).
 * Fetches models from the provider's API and presents them for selection.
 *
 * @param providerId - Provider ID
 * @param providerDef - Provider definition
 * @param defaultModel - Optional default model ID
 * @returns Selected model ID
 */
async function selectDynamicModel(
  providerId: string,
  providerDef: ProviderDefinition,
  defaultModel?: string
): Promise<string> {
  const apiKey = await getApiKey(providerId);

  // Fetch models
  const s = spinner();
  s.start("Fetching available models...");

  let models: OpenRouterModel[];
  try {
    models = await getDisplayModels(apiKey);
    s.stop(`Found ${models.length} models`);
  } catch (error) {
    s.stop("Failed to fetch models");
    return promptManualEntry();
  }

  if (models.length === 0) {
    log.warn("No models found.");
    return promptManualEntry();
  }

  // Initialize Fzf
  const fzf = new Fzf(models, {
    selector: (m) =>
      `${m.id} ${m.name} ${m.architecture?.input_modalities?.join(" ") || ""}`,
    tiebreakers: [(a, b) => b.item.id.length - a.item.id.length], // prefer shorter IDs
  });

  log.info(`Select a model (type to search):`);

  const initialChoices = models.slice(0, 50).map((m) => ({
    title: `${m.id} ${pc.dim(`(${formatContextLength(m.context_length)})`)}`,
    value: m.id,
  }));

  const response = await prompts({
    type: "autocomplete",
    name: "model",
    message: "Model",
    choices: initialChoices,
    suggest: async (input) => {
      // If empty input, return initial choices
      if (!input) {
        return initialChoices;
      }

      // Fuzzy search through ALL models
      const results = fzf.find(input);
      return results.slice(0, 50).map((entry) => ({
        title: `${entry.item.id} ${pc.dim(
          `(${formatContextLength(entry.item.context_length)})`
        )}`,
        value: entry.item.id,
      }));
    },
  });

  if (!response.model) {
    outro(pc.yellow("Cancelled."));
    process.exit(1);
  }

  return response.model;
}

/**
 * Helper for manual model entry.
 */
async function promptManualEntry(): Promise<string> {
  log.info(`Find all models at: ${pc.cyan("https://openrouter.ai/models")}`);

  const manualResult = await text({
    message: "Enter model ID:",
    placeholder: "provider/model-name",
    validate: (value) => {
      if (!value || value.length < 3) {
        return "Please enter a valid model ID";
      }
      if (!value.includes("/")) {
        return "Model ID should be in format: provider/model";
      }
    },
  });

  if (isCancel(manualResult)) {
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  return manualResult as string;
}
