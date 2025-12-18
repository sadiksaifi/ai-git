#!/usr/bin/env bun
import { intro, outro } from "@clack/prompts";
import cac from "cac";
import pc from "picocolors";
import packageJson from "../package.json";

import { getDefaultProvider, getDefaultModel, getProviderById } from "./config.ts";
import { getAdapter, getAdapterByBinary } from "./providers/index.ts";
import { parseShellArgs } from "./lib/utils.ts";
import { checkGitInstalled, checkInsideRepo } from "./lib/git.ts";
import { handleStaging } from "./lib/staging.ts";
import { runGenerationLoop } from "./lib/generation.ts";
import { handlePush } from "./lib/push.ts";

// ==============================================================================
// METADATA & CONFIG
// ==============================================================================

const cli = cac("ai-git");
const VERSION = packageJson.version;

// Get defaults from config
const defaultProvider = getDefaultProvider();
const defaultModel = getDefaultModel(defaultProvider);

// ==============================================================================
// CLI OPTIONS INTERFACE
// ==============================================================================

export interface CLIOptions {
  stageAll: boolean;
  commit: boolean;
  push: boolean;
  yes: boolean;
  hint?: string;
  dryRun: boolean;
  aiModel: string;
  aiBinary: string;
  aiProvider?: string;
  version: boolean;
  help: boolean;
}

// ==============================================================================
// MAIN LOGIC
// ==============================================================================

cli
  .command("", "Generate a commit message using AI")
  .option("-a, --stage-all", "Automatically stage all changes")
  .option("-c, --commit", "Automatically commit (skip editor/confirmation)")
  .option("-p, --push", "Automatically push after commit")
  .option("-y, --yes", "Run fully automated (Stage All + Commit + Push)")
  .option("-H, --hint <text>", "Provide a hint/context to the AI")
  .option("--dry-run", "Print the prompt and diff without calling AI")
  .option("--ai-model <model>", "AI Model to use", {
    default: defaultModel.id,
  })
  .option("--ai-binary <cmd>", "AI Binary to use", {
    default: defaultProvider.binary,
  })
  .option("--ai-provider <provider>", "AI Provider (gemini, claude, codex)")
  .option("-v, --version", "Display version number")
  .action(async (options: CLIOptions) => {
    // Handle -y alias
    if (options.yes) {
      options.stageAll = true;
      options.commit = true;
      options.push = true;
    }

    // Resolve provider and adapter
    let adapter = options.aiProvider
      ? getAdapter(options.aiProvider)
      : getAdapterByBinary(options.aiBinary);

    if (!adapter) {
      // Try to find adapter by provider ID if binary lookup failed
      const provider = getProviderById(options.aiBinary);
      if (provider) {
        adapter = getAdapter(provider.id);
      }
    }

    if (!adapter) {
      console.error(
        pc.red(
          `Error: Unknown AI provider or binary '${options.aiProvider || options.aiBinary}'.`
        )
      );
      process.exit(1);
    }

    // Resolve model
    const model = options.aiModel;

    console.clear();
    intro(pc.bgCyan(pc.black(` AI Git ${VERSION} `)));

    // Check dependencies
    await checkGitInstalled();

    const isAvailable = await adapter.checkAvailable();
    if (!isAvailable) {
      console.error(pc.red(`Error: '${adapter.binary}' cli tool not found in PATH.`));
      process.exit(1);
    }

    await checkInsideRepo();

    // 1. STAGE MANAGEMENT
    const stagingResult = await handleStaging({
      stageAll: options.stageAll,
      yes: options.yes,
    });

    if (stagingResult.aborted) {
      outro("Aborted.");
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
      options: {
        commit: options.commit,
        yes: options.yes,
        hint: options.hint,
        dryRun: options.dryRun,
      },
    });

    // Handle dry run (already processed in generation loop)
    if (options.dryRun) {
      process.exit(0);
    }

    if (genResult.aborted) {
      if (genResult.message === "" && !genResult.committed) {
        // Edit was cleared or user aborted
        outro(pc.yellow("Message cleared. Aborting."));
      } else {
        outro("Aborted.");
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

    outro("All done!");
  });

cli.help();

// ==============================================================================
// CLI ENTRY POINT
// ==============================================================================

try {
  // Parse AI_GIT_OPTS environment variable
  const envOpts = process.env.AI_GIT_OPTS
    ? parseShellArgs(process.env.AI_GIT_OPTS)
    : [];

  const args = [
    ...process.argv.slice(0, 2),
    ...envOpts,
    ...process.argv.slice(2),
  ];

  const parsed = cli.parse(args, { run: false });

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
