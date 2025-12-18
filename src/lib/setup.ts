import { intro, outro, select, note, isCancel, log } from "@clack/prompts";
import pc from "picocolors";
import { PROVIDERS, getProviderById } from "../providers/registry.ts";
import { getAdapter } from "../providers/index.ts";
import { saveUserConfig, CONFIG_FILE, type UserConfig } from "../config.ts";
import type { Mode } from "../types.ts";

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
    pc.bgCyan(pc.black(" Welcome to AI Git! ")),
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
        hint: "Use API keys (coming soon)",
      },
    ],
    initialValue: defaults?.mode ?? "cli",
  });

  if (isCancel(modeResult)) {
    outro(pc.yellow("Cancelled. Run ai-git again to restart setup."));
    process.exit(1);
  }

  const mode = modeResult as Mode;

  // Handle API mode selection
  if (mode === "api") {
    note(
      "API mode is coming soon! We're working on support for:\n" +
        "• OpenRouter\n" +
        "• OpenAI API\n" +
        "• Google Vertex AI\n" +
        "• Anthropic API\n\n" +
        "For now, please use CLI mode with an installed AI CLI tool.",
      "Coming Soon"
    );
  }

  // Step 2: Select Provider
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
    mode: "cli", // Always CLI for now
    provider,
    model,
  };

  await saveUserConfig(config);

  note(
    `Mode: ${pc.cyan("cli")}\n` +
      `Provider: ${pc.cyan(providerDef.name)}\n` +
      `Model: ${pc.cyan(
        providerDef.models.find((m) => m.id === model)?.name ?? model
      )}`,
    "Configuration Saved"
  );

  outro(pc.green("Setup complete! Run ai-git to generate your first commit."));

  return config;
}
