#!/usr/bin/env bun
import { intro, outro } from "@clack/prompts";
import cac from "cac";
import pc from "picocolors";
import packageJson from "../package.json";

import type { Mode } from "./types.ts";
import {
  loadUserConfig,
  isConfigComplete,
  resolveConfigAsync,
  getProviderById,
  getModelById,
  inferModeFromProvider,
} from "./config.ts";
import { getAdapter } from "./providers/index.ts";
import { checkGitInstalled, checkInsideRepo } from "./lib/git.ts";
import { handleStaging } from "./lib/staging.ts";
import { runGenerationLoop } from "./lib/generation.ts";
import { handlePush } from "./lib/push.ts";
import { runSetupWizard } from "./lib/setup.ts";

// ==============================================================================
// METADATA & CONFIG
// ==============================================================================

const cli = cac("ai-git");
const VERSION = packageJson.version;

// ==============================================================================
// CLI OPTIONS INTERFACE
// ==============================================================================

export interface CLIOptions {
  // AI configuration
  mode?: Mode;
  provider?: string;
  model?: string;

  // Workflow options
  stageAll: boolean;
  commit: boolean;
  push: boolean;
  yes: boolean;
  hint?: string;
  dryRun: boolean;

  // Meta
  setup: boolean;
  version: boolean;
  help: boolean;
}

// ==============================================================================
// MAIN LOGIC
// ==============================================================================

cli
  .command("", "Generate a commit message using AI")
  // AI configuration
  .option("--mode <mode>", "Connection mode: cli or api (auto-detected from provider)")
  .option("-P, --provider <id>", "AI provider (claude, gemini)")
  .option("-M, --model <id>", "Model to use (haiku, sonnet, gemini-3-flash-preview)")
  // Workflow options
  .option("-a, --stage-all", "Automatically stage all changes")
  .option("-c, --commit", "Automatically commit (skip editor/confirmation)")
  .option("-p, --push", "Automatically push after commit")
  .option("-y, --yes", "Run fully automated (Stage All + Commit + Push)")
  .option("-H, --hint <text>", "Provide a hint/context to the AI")
  .option("--dry-run", "Print the prompt and diff without calling AI")
  .option("--setup", "Re-run the setup wizard to reconfigure AI provider")
  .option("-v, --version", "Display version number")
  .action(async (options: CLIOptions) => {
    // Handle -y alias
    if (options.yes) {
      options.stageAll = true;
      options.commit = true;
      options.push = true;
    }

    // Check if setup is needed (first-run or --setup flag)
    const existingConfig = await loadUserConfig();
    if (options.setup || !isConfigComplete(existingConfig)) {
      // Run setup wizard with CLI flags as defaults
      await runSetupWizard({
        mode: options.mode,
        provider: options.provider,
        model: options.model,
      });
      
      // If --setup was explicitly requested, exit after setup
      if (options.setup) {
        process.exit(0);
      }
    }

    // Resolve configuration (CLI flags > config file > built-in defaults)
    const resolvedConfig = await resolveConfigAsync({
      mode: options.mode,
      provider: options.provider,
      model: options.model,
    });

    // Infer mode from provider if not explicitly set
    const mode = options.mode ?? inferModeFromProvider(resolvedConfig.provider);

    // Get provider definition
    const providerDef = getProviderById(resolvedConfig.provider);
    if (!providerDef) {
      console.error(
        pc.red(`Error: Unknown provider '${resolvedConfig.provider}'.`)
      );
      console.error(
        pc.dim(`Available providers: claude, gemini`)
      );
      process.exit(1);
    }

    // Get adapter for the provider
    const adapter = getAdapter(providerDef.id, mode);
    if (!adapter) {
      console.error(
        pc.red(`Error: No adapter found for provider '${providerDef.id}' in mode '${mode}'.`)
      );
      process.exit(1);
    }

    // Resolve model (CLI flag overrides config file)
    const modelId = options.model ?? resolvedConfig.model;
    const modelDef = getModelById(providerDef, modelId);
    if (!modelDef) {
      console.error(pc.red(`Error: Unknown model '${modelId}' for provider '${providerDef.name}'.`));
      console.error(pc.dim(`Available models: ${providerDef.models.map(m => m.id).join(", ")}`));
      process.exit(1);
    }
    const model = modelDef.id;
    const modelName = modelDef.name;

    console.clear();
    intro(pc.bgCyan(pc.black(` AI Git ${VERSION} `)));

    // Check dependencies
    await checkGitInstalled();

    const isAvailable = await adapter.checkAvailable();
    if (!isAvailable) {
      if (adapter.mode === "cli" && providerDef.binary) {
        console.error(pc.red(`Error: '${providerDef.binary}' CLI is not installed.`));
        console.error("");
        console.error(`The ${providerDef.name} CLI must be installed to use AI Git.`);
        console.error("");
        console.error(pc.dim("To switch to a different provider, run:"));
        console.error(pc.dim(`  ai-git --setup`));
      } else {
        console.error(pc.red(`Error: Provider '${providerDef.id}' is not available.`));
        console.error(pc.dim(`Check your API key configuration.`));
      }
      process.exit(1);
    }

    await checkInsideRepo();

    // 1. STAGE MANAGEMENT
    const stagingResult = await handleStaging({
      stageAll: options.stageAll,
      yes: options.yes,
    });

    if (stagingResult.aborted) {
      outro("Cancelled.");
      process.exit(1);
    }

    // Check for clean working directory
    if (stagingResult.stagedFiles.length === 0 && !options.dryRun) {
      outro(pc.yellow("Working directory is clean. Nothing to do."));
      process.exit(0);
    }

    // 2. GENERATION ENGINE
    const genResult = await runGenerationLoop({
      adapter,
      model,
      modelName,
      options: {
        commit: options.commit,
        yes: options.yes,
        hint: options.hint,
        dryRun: options.dryRun,
      },
      // Pass prompt customization from config file (if any)
      promptCustomization: resolvedConfig.prompt,
    });

    // Handle dry run (already processed in generation loop)
    if (options.dryRun) {
      process.exit(0);
    }

    if (genResult.aborted) {
      if (genResult.message === "" && !genResult.committed) {
        // Edit was cleared or user cancelled
        outro(pc.yellow("No message provided. Cancelled."));
      } else {
        outro("Cancelled.");
      }
      process.exit(1);
    }

    // Show success message for commit
    if (genResult.committed) {
      const headerLine = genResult.message.split("\n")[0] || "";
      if (options.commit) {
        outro(pc.green(`Commit created: ${headerLine}`));
      } else {
        outro(pc.green("Commit created successfully."));
      }
    }

    // 3. PUSH LOGIC
    await handlePush({
      push: options.push,
      yes: options.yes,
    });

    outro("Done!");
  });

cli.help();

// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================

try {
  const parsed = cli.parse(process.argv, { run: false });

  if (parsed.options.version) {
    console.log(VERSION);
    process.exit(0);
  } else if (parsed.options.help) {
    cli.outputHelp();
    process.exit(0);
  } else {
    cli.runMatchedCommand();
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
