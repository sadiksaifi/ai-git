#!/usr/bin/env bun
import {
  intro,
  outro,
  confirm,
  select,
  isCancel,
  log,
  spinner,
} from "@clack/prompts";
import { setTimeout } from "node:timers/promises";
import cac from "cac";
import pc from "picocolors";
import packageJson from "../package.json";

import {
  loadUserConfig,
  loadProjectConfig,
  saveProjectConfig,
  isConfigComplete,
  resolveConfigAsync,
  getProviderById,
  getModelById,
} from "./config.ts";
import { getAdapter } from "./providers/index.ts";
import { checkGitInstalled, checkInsideRepo } from "./lib/git.ts";
import { handleStaging } from "./lib/staging.ts";
import { runGenerationLoop } from "./lib/generation.ts";
import { handlePush } from "./lib/push.ts";
import { runOnboarding } from "./lib/onboarding/index.ts";
import { showWelcomeScreen, type WelcomeOptions } from "./lib/ui/welcome.ts";
import { runSetupWizard } from "./lib/setup.ts";
import {
  startUpdateCheck,
  showUpdateNotification,
} from "./lib/update-check.ts";
import { FLAGS } from "./lib/flags.ts";

// ==============================================================================
// GLOBAL SETTINGS
// ==============================================================================

// Suppress AI SDK warning logs (we handle errors ourselves)
(globalThis as Record<string, unknown>).AI_SDK_LOG_WARNINGS = false;

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
  provider?: string;
  model?: string;

  // Workflow options
  stageAll: boolean;
  commit: boolean;
  push: boolean;
  dangerouslyAutoApprove: boolean;
  hint?: string;
  dryRun: boolean;

  // Meta
  setup: boolean;
  init: boolean;
  version: boolean;
  help: boolean;
}

// ==============================================================================
// MAIN LOGIC
// ==============================================================================

cli
  .command("")
  // AI configuration
  .option(
    `${FLAGS.provider.short}, ${FLAGS.provider.long} ${FLAGS.provider.arg}`,
    FLAGS.provider.description,
  )
  .option(
    `${FLAGS.model.short}, ${FLAGS.model.long} ${FLAGS.model.arg}`,
    FLAGS.model.description,
  )
  // Workflow options
  .option(
    `${FLAGS.stageAll.short}, ${FLAGS.stageAll.long}`,
    FLAGS.stageAll.description,
  )
  .option(
    `${FLAGS.commit.short}, ${FLAGS.commit.long}`,
    FLAGS.commit.description,
  )
  .option(
    `${FLAGS.push.short}, ${FLAGS.push.long}`,
    FLAGS.push.description,
  )
  .option(
    `${FLAGS.hint.short}, ${FLAGS.hint.long} ${FLAGS.hint.arg}`,
    FLAGS.hint.description,
  )
  .option(
    FLAGS.dangerouslyAutoApprove.long,
    FLAGS.dangerouslyAutoApprove.description,
  )
  .option(FLAGS.dryRun.long, FLAGS.dryRun.description)
  .option(FLAGS.setup.long, FLAGS.setup.description)
  .option(FLAGS.init.long, FLAGS.init.description)
  .option(
    `${FLAGS.version.short}, ${FLAGS.version.long}`,
    FLAGS.version.description,
  )
  .action(async (options: CLIOptions) => {
    // Start update check immediately (non-blocking)
    const updateCheckPromise = startUpdateCheck(VERSION);

    // Handle --init
    if (options.init) {
      console.clear();
      intro(pc.bgCyan(pc.black(` AI Git ${VERSION} - Project Init `)));

      const existingProjectConfig = await loadProjectConfig();
      if (existingProjectConfig) {
        const overwrite = await confirm({
          message: "Project configuration already exists. Overwrite?",
        });
        if (isCancel(overwrite) || !overwrite) {
          outro("Cancelled.");
          process.exit(0);
        }
      }

      const existingGlobalConfig = await loadUserConfig();

      if (existingGlobalConfig && isConfigComplete(existingGlobalConfig)) {
        const initAction = await select({
          message: "How would you like to initialize the project config?",
          options: [
            {
              value: "dump",
              label: "Copy from global config",
              hint: "Use your existing global settings",
            },
            {
              value: "wizard",
              label: "Run setup wizard",
              hint: "Configure specifically for this project",
            },
          ],
        });

        if (isCancel(initAction)) {
          outro("Cancelled.");
          process.exit(1);
        }

        if (initAction === "dump") {
          await saveProjectConfig(existingGlobalConfig);
          outro(
            pc.green("Project configuration created from global settings."),
          );
        } else {
          await runSetupWizard(undefined, "project");
        }
      } else {
        // No global config, force wizard
        const proceed = await confirm({
          message:
            "No global configuration found. Proceed to setup project configuration?",
        });

        if (isCancel(proceed) || !proceed) {
          outro("Cancelled.");
          process.exit(0);
        }

        await runSetupWizard(undefined, "project");
      }
      process.exit(0);
    }

    // Handle --dangerously-auto-approve
    if (options.dangerouslyAutoApprove) {
      options.stageAll = true;
      options.commit = true;
      options.push = true;
    }

    // Check if setup is needed (first-run or --setup flag)
    const existingConfig = await loadUserConfig();
    const existingProjectConfig = await loadProjectConfig();

    // We only force setup if NEITHER config exists/is complete
    const isGlobalComplete = isConfigComplete(existingConfig);
    const isProjectComplete = isConfigComplete(existingProjectConfig);

    // Prepare welcome options
    let welcomeOptions: WelcomeOptions = {};
    if (!options.setup && (isGlobalComplete || isProjectComplete)) {
      try {
        const resolved = await resolveConfigAsync({
          provider: options.provider,
          model: options.model,
        });

        const providerDef = getProviderById(resolved.provider);
        let modelName = resolved.model;

        // Try to get human readable model name
        if (providerDef && !providerDef.dynamicModels) {
          const m = getModelById(providerDef, resolved.model);
          if (m) {
            modelName = m.name;
          }
        }

        welcomeOptions = {
          showConfig: true,
          providerName: providerDef?.name || resolved.provider,
          modelName: modelName,
        };
      } catch {
        // Ignore errors, just show default welcome screen
      }
    }

    // Show welcome screen on every run
    await showWelcomeScreen(VERSION, welcomeOptions);

    if (options.setup || (!isGlobalComplete && !isProjectComplete)) {
      const onboardingResult = await runOnboarding({
        defaults: {
          provider: options.provider,
          model: options.model,
        },
        target: "global",
      });

      if (!onboardingResult.completed) {
        process.exit(1);
      }

      // If --setup was explicitly requested, or user doesn't want to continue, exit
      if (options.setup || !onboardingResult.continueToRun) {
        process.exit(0);
      }
    }

    // Resolve configuration (CLI flags > config file > built-in defaults)
    const resolvedConfig = await resolveConfigAsync({
      provider: options.provider,
      model: options.model,
    });

    // Get provider definition
    const providerDef = getProviderById(resolvedConfig.provider);
    if (!providerDef) {
      console.error(
        pc.red(`Error: Unknown provider '${resolvedConfig.provider}'.`),
      );
      console.error(pc.dim(`Supported providers: claude-code, gemini-cli, codex, openrouter, openai, anthropic, google-ai-studio`));
      process.exit(1);
    }

    // Get adapter for the provider
    const adapter = getAdapter(providerDef.id);
    if (!adapter) {
      console.error(
        pc.red(`Error: No adapter found for provider '${providerDef.id}'.`),
      );
      process.exit(1);
    }

    // Resolve model (CLI flag overrides config file)
    const modelId = options.model ?? resolvedConfig.model;

    let model: string;
    let modelName: string;

    // For API providers with dynamic models, skip model validation
    // (models are fetched at runtime, not stored in the registry)
    if (providerDef.dynamicModels) {
      model = modelId;
      modelName = modelId; // Use ID as name for display (or could fetch from cache)
    } else {
      // For CLI providers, validate model exists in registry
      const modelDef = getModelById(providerDef, modelId);
      if (!modelDef) {
        console.error(
          pc.red(
            `Error: Unknown model '${modelId}' for provider '${providerDef.name}'.`,
          ),
        );
        console.error(
          pc.dim(
            `Available models: ${providerDef.models.map((m) => m.id).join(", ")}`,
          ),
        );
        process.exit(1);
      }
      model = modelDef.id;
      modelName = modelDef.name;
    }

    if (options.dangerouslyAutoApprove) {
      log.error(pc.red("You are running in auto-approve mode."));

      const s = spinner();
      s.start(pc.yellow("Proceeding in 5s... (Enter to skip, Ctrl+C to cancel)"));

      // Set up keypress detection to allow skipping the countdown
      let skipped = false;
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;

      // Promise that resolves when Enter is pressed (for immediate response)
      let onSkip: () => void;
      const skipPromise = new Promise<void>((resolve) => {
        onSkip = resolve;
      });

      const onData = (data: Buffer) => {
        // Ctrl+C (raw mode doesn't trigger SIGINT)
        if (data[0] === 3) {
          cleanup();
          s.stop("Cancelled.");
          process.exit(130);
        }
        // Enter key (carriage return or newline)
        if (data[0] === 13 || data[0] === 10) {
          skipped = true;
          onSkip();
        }
      };

      const cleanup = () => {
        if (stdin.isTTY) {
          stdin.off("data", onData);
          stdin.setRawMode(wasRaw ?? false);
        }
      };

      if (stdin.isTTY) {
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on("data", onData);
      }

      for (let i = 5; i > 0 && !skipped; i--) {
        s.message(pc.yellow(`Proceeding in ${i}s... (Enter to skip, Ctrl+C to cancel)`));
        // Race between 1s delay and skip - allows immediate response to Enter
        await Promise.race([setTimeout(1000), skipPromise]);
      }

      cleanup();
      s.stop(skipped ? "Skipped. Proceeding now." : "Proceeding now.");
    }

    // Show update notification if available (check should be done by now)
    const updateResult = await updateCheckPromise;
    showUpdateNotification(updateResult);

    // Check dependencies
    await checkGitInstalled();

    const isAvailable = await adapter.checkAvailable();
    if (!isAvailable) {
      if (adapter.mode === "cli" && providerDef.binary) {
        console.error(
          pc.red(`Error: '${providerDef.binary}' CLI is not installed.`),
        );
        console.error("");
        console.error(
          `The ${providerDef.name} CLI must be installed to use AI Git.`,
        );
        console.error("");
        console.error(pc.dim("To switch to a different provider, run:"));
        console.error(pc.dim(`  ai-git --setup`));
      } else {
        console.error(
          pc.red(`Error: Provider '${providerDef.id}' is not available.`),
        );
        console.error(pc.dim(`Check your API key configuration.`));
      }
      process.exit(1);
    }

    await checkInsideRepo();

    // 1. STAGE MANAGEMENT
    const stagingResult = await handleStaging({
      stageAll: options.stageAll,
      dangerouslyAutoApprove: options.dangerouslyAutoApprove,
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
        dangerouslyAutoApprove: options.dangerouslyAutoApprove,
        hint: options.hint,
        dryRun: options.dryRun,
      },
      // Pass prompt customization from config file (if any)
      promptCustomization: resolvedConfig.prompt,
      editor: resolvedConfig.editor,
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
        log.success(pc.green(`Commit created: ${headerLine}`));
      } else {
        log.success(pc.green("Commit created successfully."));
      }
    }

    // 3. PUSH LOGIC
    await handlePush({
      push: options.push,
      dangerouslyAutoApprove: options.dangerouslyAutoApprove,
    });

    outro(pc.green("Done!"));
  });

cli.help((sections) => {
  const newSections = sections.filter(
    (section) =>
      section.title !== "Commands" &&
      section.body.trim() !== "ai-git" &&
      !section.title?.startsWith("For more info"),
  );

  const usageSection = newSections.find((section) => section.title === "Usage");
  if (usageSection) {
    usageSection.body = "  $ ai-git [options]";
  }

  // Insert description after Usage
  const usageIndex = newSections.findIndex((section) => section.title === "Usage");
  if (usageIndex !== -1) {
    newSections.splice(usageIndex + 1, 0, {
      body: "Generate a commit message using AI",
    });
  }

  return newSections;
});

// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================

try {
  const parsed = cli.parse(process.argv, { run: false });

  if (parsed.options.version) {
    console.log(VERSION);
    process.exit(0);
  } else if (parsed.options.help) {
    process.exit(0);
  } else {
    cli.runMatchedCommand();
  }
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Unknown option")) {
    console.error(pc.red(`Error: ${error.message}`));
    console.error(pc.dim("Use --help to see available options."));
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
}
