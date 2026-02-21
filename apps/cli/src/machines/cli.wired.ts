/**
 * Production wiring for the CLI machine.
 *
 * The base `cliMachine` uses stub actors for testability. This module
 * replaces them with real implementations via `.provide()`, creating
 * the production-ready machine used by `index.ts`.
 */

import { fromPromise } from "xstate";
import pc from "picocolors";
import { cliMachine, type ConfigResolutionResult, type OnboardingActorResult } from "./cli.machine.ts";
import { initMachine } from "./init.machine.ts";
import type { ProviderDefinition } from "../types.ts";
import type { ProviderAdapter } from "../providers/types.ts";
import type { ResolvedConfig } from "../config.ts";
import {
  loadUserConfig,
  loadProjectConfig,
  isConfigComplete,
  resolveConfigAsync,
  getProviderById,
  getModelById,
  flushMigrationNotice,
} from "../config.ts";
import { PROVIDERS } from "../providers/registry.ts";
import { getAdapter } from "../providers/index.ts";
import { checkGitInstalled, checkInsideRepo } from "../lib/git.ts";
import { handleStaging } from "../lib/staging.ts";
import { runGenerationLoop } from "../lib/generation.ts";
import { handlePush } from "../lib/push.ts";
import { runOnboarding } from "../lib/onboarding/index.ts";
import { showWelcomeScreen, type WelcomeOptions } from "../lib/ui/welcome.ts";
import {
  startUpdateCheck,
  showUpdateNotification,
} from "../lib/update-check.ts";
import { assertConfiguredModelAllowed } from "../providers/api/models/index.ts";

// ── Helper: resolve config into a ConfigResolutionResult ─────────────

async function resolveFullConfig(
  options: { provider?: string; model?: string },
  version: string,
): Promise<ConfigResolutionResult> {
  const resolvedConfig = await resolveConfigAsync({
    provider: options.provider,
    model: options.model,
  });

  // Validate provider (Bug #2 fix: use dynamic PROVIDERS list)
  const providerDef = getProviderById(resolvedConfig.provider);
  if (!providerDef) {
    const validProviders = PROVIDERS.map((p) => p.id).join(", ");
    console.error(
      pc.red(`Error: Unknown provider '${resolvedConfig.provider}'.`),
    );
    console.error(pc.dim(`Supported providers: ${validProviders}`));
    throw new Error(`Unknown provider '${resolvedConfig.provider}'`);
  }

  // Get adapter
  const adapter = getAdapter(providerDef.id);
  if (!adapter) {
    console.error(
      pc.red(`Error: No adapter found for provider '${providerDef.id}'.`),
    );
    throw new Error(`No adapter found for provider '${providerDef.id}'`);
  }

  // Resolve model
  const modelId = options.model ?? resolvedConfig.model;
  let model: string;
  let modelName: string;

  if (providerDef.dynamicModels) {
    model = modelId;
    modelName = modelId;
    try {
      await assertConfiguredModelAllowed(
        providerDef.id as
          | "openrouter"
          | "openai"
          | "anthropic"
          | "google-ai-studio",
        model,
      );
    } catch (error) {
      console.error(
        pc.red(
          `Error: ${error instanceof Error ? error.message : "Configured model is not allowed."}`,
        ),
      );
      console.error(pc.dim("Run `ai-git --setup` to select a supported model."));
      throw error;
    }
  } else {
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
      throw new Error(
        `Unknown model '${modelId}' for provider '${providerDef.name}'`,
      );
    }
    model = modelDef.id;
    modelName = modelDef.name;
  }

  return {
    config: resolvedConfig,
    providerDef,
    adapter,
    model,
    modelName,
    needsSetup: false,
  };
}

// ── Wired machine ────────────────────────────────────────────────────

export const wiredCliMachine = cliMachine.provide({
  actors: {
    // ── Init ──────────────────────────────────────────────────────────
    initMachine: initMachine,

    // ── Config resolution ────────────────────────────────────────────
    loadAndResolveConfigActor: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const options = input as {
          options: { provider?: string; model?: string; setup: boolean };
          version: string;
        };

        // Start non-blocking update check
        const updateCheckPromise =
          process.env.AI_GIT_DISABLE_UPDATE_CHECK === "1"
            ? Promise.resolve({
                updateAvailable: false,
                latestVersion: null,
                currentVersion: options.version,
              })
            : startUpdateCheck(options.version);

        const existingConfig = await loadUserConfig();
        const existingProjectConfig = await loadProjectConfig();

        const isGlobalComplete = isConfigComplete(existingConfig);
        const isProjectComplete = isConfigComplete(existingProjectConfig);

        // Show update notification early
        const updateResult = await updateCheckPromise;
        showUpdateNotification(updateResult);

        // If neither config is complete, return needsSetup
        if (!isGlobalComplete && !isProjectComplete) {
          return {
            config: {
              provider: "",
              model: "",
              slowWarningThresholdMs: 5000,
            } as ResolvedConfig,
            providerDef: {} as ProviderDefinition,
            adapter: {} as ProviderAdapter,
            model: "",
            modelName: "",
            needsSetup: true,
          } satisfies ConfigResolutionResult;
        }

        const result = await resolveFullConfig(
          {
            provider: options.options.provider,
            model: options.options.model,
          },
          options.version,
        );
        result.needsSetup = options.options.setup;
        return result;
      },
    ),

    // ── Welcome screen ───────────────────────────────────────────────
    showWelcomeActor: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const ctx = input as {
          version: string;
          configResult: ConfigResolutionResult | null;
          needsSetup: boolean;
        };

        let welcomeOptions: WelcomeOptions = {};
        if (!ctx.needsSetup && ctx.configResult?.providerDef?.name) {
          welcomeOptions = {
            showConfig: true,
            providerName: ctx.configResult.providerDef.name,
            modelName: ctx.configResult.modelName,
          };
        }
        await showWelcomeScreen(ctx.version, welcomeOptions);
        flushMigrationNotice();
      },
    ),

    // ── Onboarding ───────────────────────────────────────────────────
    runOnboardingActor: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const ctx = input as {
          options: { provider?: string; model?: string };
        };

        const result = await runOnboarding({
          defaults: {
            provider: ctx.options.provider,
            model: ctx.options.model,
          },
          target: "global",
        });
        return {
          completed: result.completed,
          continueToRun: result.continueToRun,
        } satisfies OnboardingActorResult;
      },
    ),

    // ── Reload config (after onboarding) ─────────────────────────────
    reloadConfigActor: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const ctx = input as {
          options: { provider?: string; model?: string };
          version: string;
        };
        return resolveFullConfig(
          { provider: ctx.options.provider, model: ctx.options.model },
          ctx.version,
        );
      },
    ),

    // ── Git checks ───────────────────────────────────────────────────
    checkGitActor: fromPromise(async () => {
      await checkGitInstalled();
      await checkInsideRepo();
    }),

    // ── Provider availability ────────────────────────────────────────
    checkAvailabilityActor: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const ctx = input as {
          configResult: ConfigResolutionResult;
          dryRun: boolean;
        };

        if (ctx.dryRun) return true;

        const { adapter, providerDef } = ctx.configResult;
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
            console.error(pc.dim("  ai-git --setup"));
          } else {
            console.error(
              pc.red(`Error: Provider '${providerDef.id}' is not available.`),
            );
            console.error(pc.dim("Check your API key configuration."));
          }
          throw new Error("Provider not available");
        }
        return true;
      },
    ),

    // ── Staging ──────────────────────────────────────────────────────
    stagingMachine: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const ctx = input as {
          stageAll: boolean;
          dangerouslyAutoApprove: boolean;
          exclude: string[];
        };
        return handleStaging({
          stageAll: ctx.stageAll,
          dangerouslyAutoApprove: ctx.dangerouslyAutoApprove,
          exclude: ctx.exclude.length > 0 ? ctx.exclude : undefined,
        });
      },
    ),

    // ── Generation ───────────────────────────────────────────────────
    generationMachine: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const ctx = input as {
          adapter: any;
          model: string;
          modelName: string;
          options: {
            commit: boolean;
            dangerouslyAutoApprove: boolean;
            dryRun: boolean;
            hint?: string;
          };
          slowWarningThresholdMs: number;
          promptCustomization?: any;
          editor?: string;
        };
        return runGenerationLoop({
          adapter: ctx.adapter,
          model: ctx.model,
          modelName: ctx.modelName,
          options: ctx.options,
          promptCustomization: ctx.promptCustomization,
          editor: ctx.editor,
          slowWarningThresholdMs: ctx.slowWarningThresholdMs,
        });
      },
    ),

    // ── Push ─────────────────────────────────────────────────────────
    pushMachine: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const ctx = input as {
          push: boolean;
          dangerouslyAutoApprove: boolean;
          isInteractiveMode: boolean;
        };
        await handlePush(ctx);
        return { pushed: true, exitCode: 0 as const };
      },
    ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
});
