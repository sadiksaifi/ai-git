/**
 * Production wiring for the CLI machine.
 *
 * The base `cliMachine` uses stub actors for testability. This module
 * replaces them with real implementations via `.provide()`, creating
 * the production-ready machine used by `index.ts`.
 */

import { fromPromise } from "xstate";
import pc from "picocolors";
import { log } from "@clack/prompts";
import { ERROR_TEMPLATES } from "@ai-git/meta";
import {
  cliMachine,
  type ConfigResolutionResult,
  type OnboardingActorResult,
} from "./cli.machine.ts";
import { stagingMachine } from "./staging.machine.ts";
import type { ProviderAdapter } from "../providers/types.ts";
import type { ResolvedConfig, PromptCustomization } from "../config.ts";
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
import { checkGitInstalled, checkInsideRepo, push, addRemoteAndPush, fetchRemote, getRemoteAheadCount, pullRebase } from "../lib/git.ts";
import { runGenerationLoop } from "../lib/generation.ts";
import { pushMachine } from "./push.machine.ts";
import { confirmActor, textActor } from "./actors/clack.actors.ts";
import { showWelcomeScreen, type WelcomeOptions } from "../lib/ui/welcome.ts";
import { startUpdateCheck, showUpdateNotification } from "../lib/update-check.ts";
import { assertConfiguredModelAllowed } from "../providers/api/models/index.ts";
import type { SupportedAPIProviderId } from "../providers/api/models/types.ts";

// ── Helper: resolve config into a ConfigResolutionResult ─────────────

async function resolveFullConfig(
  options: { provider?: string; model?: string },
  _version: string, // kept for future use (e.g. version-specific model validation)
): Promise<ConfigResolutionResult> {
  const resolvedConfig = await resolveConfigAsync({
    provider: options.provider,
    model: options.model,
  });

  // Validate provider (Bug #2 fix: use dynamic PROVIDERS list)
  const providerDef = getProviderById(resolvedConfig.provider);
  if (!providerDef) {
    const validProviders = PROVIDERS.map((p) => p.id).join(", ");
    console.error(pc.red(`Error: Unknown provider '${resolvedConfig.provider}'.`));
    console.error(pc.dim(`Supported providers: ${validProviders}`));
    throw new Error(`Unknown provider '${resolvedConfig.provider}'`);
  }

  // Get adapter
  const adapter = getAdapter(providerDef.id);
  if (!adapter) {
    console.error(pc.red(`Error: No adapter found for provider '${providerDef.id}'.`));
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
      await assertConfiguredModelAllowed(providerDef.id as SupportedAPIProviderId, model);
    } catch (error) {
      console.error(
        pc.red(
          `Error: ${error instanceof Error ? error.message : "Configured model is not allowed."}`,
        ),
      );
      console.error(pc.dim("Run `ai-git configure` to select a supported model."));
      throw error;
    }
  } else {
    const modelDef = getModelById(providerDef, modelId);
    if (!modelDef) {
      console.error(
        pc.red(`Error: Unknown model '${modelId}' for provider '${providerDef.name}'.`),
      );
      console.error(pc.dim(`Available models: ${providerDef.models.map((m) => m.id).join(", ")}`));
      throw new Error(`Unknown model '${modelId}' for provider '${providerDef.name}'`);
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
    // ── Config resolution ────────────────────────────────────────────
    loadAndResolveConfigActor: fromPromise(
      async ({ input }: { input: Record<string, unknown> }) => {
        const options = input as {
          options: { provider?: string; model?: string };
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

        // Neither config is complete. Two scenarios:
        // 1. Config has provider+model but they're invalid → hard error with guidance
        // 2. Config is truly missing or empty → return needsSetup to trigger onboarding
        if (!isGlobalComplete && !isProjectComplete) {
          const bestConfig = existingProjectConfig ?? existingConfig;
          if (bestConfig?.provider && bestConfig?.model) {
            // Scenario 1: User has a config file with values that don't match any
            // known provider/model. Fail loudly instead of silently re-running setup.
            const provider = getProviderById(bestConfig.provider);
            if (!provider) {
              const validProviders = PROVIDERS.map((p) => p.id).join(", ");
              console.error(pc.red(`Error: Unknown provider '${bestConfig.provider}'.`));
              console.error(pc.dim(`Supported providers: ${validProviders}`));
              console.error(pc.dim("Run `ai-git configure` to select a valid provider."));
              throw new Error(`Unknown provider '${bestConfig.provider}'`);
            }
            // Provider is valid but model is not
            console.error(
              pc.red(`Error: Unknown model '${bestConfig.model}' for provider '${provider.name}'.`),
            );
            console.error(
              pc.dim(`Available models: ${provider.models.map((m) => m.id).join(", ")}`),
            );
            console.error(pc.dim("Run `ai-git configure` to select a valid model."));
            throw new Error(`Unknown model '${bestConfig.model}' for provider '${provider.name}'`);
          }

          return {
            config: {
              provider: "",
              model: "",
              slowWarningThresholdMs: 5000,
            } as ResolvedConfig,
            providerDef: null,
            adapter: null,
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
        return result;
      },
    ),

    // ── Welcome screen ───────────────────────────────────────────────
    showWelcomeActor: fromPromise(async ({ input }: { input: Record<string, unknown> }) => {
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
    }),

    // ── Onboarding ───────────────────────────────────────────────────
    runOnboardingActor: fromPromise(
      async ({ input: _input }: { input: Record<string, unknown> }) => {
        // First-run auto-trigger: when no config exists, show a brief message
        // then launch the same configure flow as `ai-git configure`.
        // Dynamic import avoids circular dependency (configure.ts → init.machine).
        log.warn(ERROR_TEMPLATES.noConfig.message);
        const { runConfigureFlow } = await import("../lib/configure.ts");
        const result = await runConfigureFlow();
        return {
          completed: result.exitCode === 0,
          continueToRun: result.continueToRun,
        } satisfies OnboardingActorResult;
      },
    ),

    // ── Reload config (after onboarding) ─────────────────────────────
    reloadConfigActor: fromPromise(async ({ input }: { input: Record<string, unknown> }) => {
      const ctx = input as {
        options: { provider?: string; model?: string };
        version: string;
      };
      return resolveFullConfig(
        { provider: ctx.options.provider, model: ctx.options.model },
        ctx.version,
      );
    }),

    // ── Git checks ───────────────────────────────────────────────────
    checkGitActor: fromPromise(async () => {
      await checkGitInstalled();
      await checkInsideRepo();
    }),

    // ── Provider availability ────────────────────────────────────────
    checkAvailabilityActor: fromPromise(async ({ input }: { input: Record<string, unknown> }) => {
      const ctx = input as {
        configResult: ConfigResolutionResult;
        dryRun: boolean;
      };

      if (ctx.dryRun) return true;

      // adapter and providerDef are guaranteed non-null here:
      // checkAvailability only runs after successful config resolution
      const { adapter, providerDef } = ctx.configResult as ConfigResolutionResult & {
        adapter: NonNullable<ConfigResolutionResult["adapter"]>;
        providerDef: NonNullable<ConfigResolutionResult["providerDef"]>;
      };
      const isAvailable = await adapter.checkAvailable();
      if (!isAvailable) {
        if (adapter.mode === "cli" && providerDef.binary) {
          console.error(pc.red(`Error: '${providerDef.binary}' CLI is not installed.`));
          console.error("");
          console.error(`The ${providerDef.name} CLI must be installed to use AI Git.`);
          console.error("");
          console.error(pc.dim("To switch to a different provider, run:"));
          console.error(pc.dim("  ai-git configure"));
        } else {
          console.error(pc.red(`Error: Provider '${providerDef.id}' is not available.`));
          console.error(pc.dim("Check your API key configuration."));
        }
        throw new Error("Provider not available");
      }
      return true;
    }),

    // ── Staging ──────────────────────────────────────────────────────
    stagingMachine: stagingMachine,

    // ── Clean tree warning ────────────────────────────────────────
    warnCleanTreeActor: fromPromise(async () => {
      log.warn("Nothing to commit — working tree is clean.");
    }),

    // ── Generation ───────────────────────────────────────────────────
    generationMachine: fromPromise(async ({ input }: { input: Record<string, unknown> }) => {
      const ctx = input as {
        adapter: ProviderAdapter;
        model: string;
        modelName: string;
        options: {
          commit: boolean;
          dangerouslyAutoApprove: boolean;
          dryRun: boolean;
          hint?: string;
        };
        slowWarningThresholdMs: number;
        promptCustomization?: PromptCustomization;
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
    }),

    // ── Push ─────────────────────────────────────────────────────────
    pushMachine: pushMachine.provide({
      actors: {
        pushActor: fromPromise(async () => {
          const s = (await import("@clack/prompts")).spinner();
          s.start("Pushing changes...");
          try {
            await push();
            s.stop("Pushed successfully");
          } catch (error) {
            s.stop("Push failed");
            throw error;
          }
        }),
        addRemoteAndPushActor: fromPromise(async ({ input }: { input: { url: string } }) => {
          const s = (await import("@clack/prompts")).spinner();
          s.start("Adding remote and pushing...");
          try {
            await addRemoteAndPush(input.url);
            s.stop("Remote added and pushed successfully");
          } catch (error) {
            s.stop("Failed to push to new remote");
            throw error;
          }
        }),
        fetchRemoteActor: fromPromise(async () => {
          const s = (await import("@clack/prompts")).spinner();
          s.start("Looking for upstream changes...");
          try {
            await fetchRemote();
            s.stop("Checked remote");
          } catch (error) {
            s.stop("Could not reach remote");
            throw error;
          }
        }),
        checkRemoteAheadActor: fromPromise(async () => {
          return await getRemoteAheadCount();
        }),
        pullRebaseActor: fromPromise(async () => {
          const s = (await import("@clack/prompts")).spinner();
          s.start("Pulling and rebasing...");
          try {
            await pullRebase();
            s.stop("Rebased successfully");
          } catch (error) {
            s.stop("Rebase failed");
            throw error;
          }
        }),
        confirmActor,
        textActor,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
});
