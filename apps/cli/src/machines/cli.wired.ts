/**
 * Production wiring for the CLI machine.
 *
 * The base `cliMachine` uses stub actors for testability. This module
 * replaces them with real implementations via `.provide()`, creating
 * the production-ready machine used by `index.ts`.
 */

import { fromPromise } from "xstate";
import pc from "picocolors";
import { log, spinner } from "@clack/prompts";
import { ERROR_TEMPLATES } from "@ai-git/meta";
import {
  cliMachine,
  type ConfigResolutionResult,
  type OnboardingActorResult,
} from "./cli.machine.ts";
import { stagingMachine } from "./staging.machine.ts";
import type { ResolvedConfig, UserConfig } from "../config.ts";
import {
  CONFIG_FILE,
  loadUserConfig,
  loadProjectConfig,
  isConfigComplete,
  queueMigrationNotice,
  resolveConfigAsync,
  saveProjectConfig,
  saveUserConfig,
  getProjectConfigPath,
  getProviderById,
  getModelById,
  flushMigrationNotice,
} from "../config.ts";
import { backupConfigFile, migrateLegacyGeminiCliConfig } from "../lib/migration.ts";
import { PROVIDERS } from "../providers/registry.ts";
import { getAdapter } from "../providers/index.ts";
import { antigravityAdapter } from "../providers/cli/antigravity.ts";
import { extractErrorMessage } from "../lib/errors.ts";
import {
  checkGitInstalled,
  checkInsideRepo,
  push,
  addRemoteAndPush,
  fetchRemote,
  getRemoteAheadCount,
  pullRebase,
} from "../lib/git.ts";
import { generationMachine } from "./generation.machine.ts";
import { pushMachine } from "./push.machine.ts";
import {
  getBranchNameActor,
  setBranchNameActor,
  gatherContextActor,
  commitActor,
} from "./actors/git.actors.ts";
import { invokeAIActor } from "./actors/ai.actors.ts";
import { confirmActor, selectActor, textActor } from "./actors/clack.actors.ts";
import {
  displayCommitResultActor,
  displayValidationWarningsActor,
  displayCommitMessageActor,
  displayDryRunActor,
  displayAIErrorActor,
} from "./actors/display.actors.ts";
import { editorActor } from "./actors/editor.actors.ts";
import { showWelcomeScreen, type WelcomeOptions } from "../lib/ui/welcome.ts";
import { startUpdateCheck, showUpdateNotification } from "../lib/update-check.ts";
import { assertConfiguredModelAllowed } from "../providers/api/models/index.ts";
import type { SupportedAPIProviderId } from "../providers/api/models/types.ts";

// ── Helper: resolve config into a ConfigResolutionResult ─────────────

async function resolveFullConfig(
  options: { provider?: string; model?: string },
  _version: string, // kept for future use (e.g. version-specific model validation)
  loaded?: { userConfig?: UserConfig; projectConfig?: UserConfig },
): Promise<ConfigResolutionResult> {
  const resolvedConfig = await resolveConfigAsync(
    {
      provider: options.provider,
      model: options.model,
    },
    loaded,
  );

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

    // API providers validate configured models against models.dev deprecation metadata.
    // Dynamic CLI providers list models only during configure; generation intentionally
    // does not re-fetch or revalidate live CLI model lists.
    if (providerDef.mode === "api") {
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
    }
  } else {
    const modelDef = getModelById(providerDef, modelId);
    if (!modelDef) {
      console.error(
        pc.red(`Error: Unknown model '${modelId}' for provider '${providerDef.name}'.`),
      );
      console.error(pc.dim(`Available models: ${providerDef.models.map((m) => m.id).join(", ")}`));
      console.error(pc.dim("Run `ai-git configure` to select a supported model."));
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

async function migrateLoadedLegacyConfigs(
  userConfig: UserConfig | undefined,
  projectConfig: UserConfig | undefined,
  overrides: { provider?: string; model?: string },
): Promise<{ userConfig?: UserConfig; projectConfig?: UserConfig }> {
  const hasCompleteOverride = Boolean(overrides.provider && overrides.model);
  const effectiveProvider = projectConfig?.provider ?? userConfig?.provider;
  const effectiveModel = projectConfig?.model ?? userConfig?.model;
  const projectDefinesProviderOrModel = Boolean(
    projectConfig?.provider !== undefined || projectConfig?.model !== undefined,
  );
  const hasEffectiveLegacyConfig =
    !hasCompleteOverride &&
    effectiveProvider === "gemini-cli" &&
    typeof effectiveModel === "string";
  const migrateProject = hasEffectiveLegacyConfig && projectDefinesProviderOrModel;
  const migrateUser = hasEffectiveLegacyConfig && !migrateProject;
  const hasLegacyConfig = migrateUser || migrateProject;
  if (!hasLegacyConfig) return { userConfig, projectConfig };

  if (!(await antigravityAdapter.checkAvailable())) {
    throw new Error(
      "Antigravity CLI is required to migrate the existing configuration. Install it with: curl -fsSL https://antigravity.google/cli/install.sh | bash",
    );
  }

  const models = await antigravityAdapter.fetchModels!();
  const migrate = (config: UserConfig | undefined) =>
    config
      ? migrateLegacyGeminiCliConfig(
          { ...config, provider: effectiveProvider, model: effectiveModel },
          async () => models,
        )
      : Promise.resolve({ config: undefined, changed: false, changes: [] });
  const [userResult, projectResult] = await Promise.all([
    migrateUser
      ? migrate(userConfig)
      : Promise.resolve({ config: userConfig, changed: false, changes: [] }),
    migrateProject
      ? migrate(projectConfig)
      : Promise.resolve({ config: projectConfig, changed: false, changes: [] }),
  ]);

  let backupPath: string | undefined;
  if (userResult.changed && userResult.config) {
    try {
      backupPath = await backupConfigFile(CONFIG_FILE);
    } catch {
      // Best effort. Migration remains atomic because provider and model save together below.
    }
    await saveUserConfig(userResult.config);
  }
  if (projectResult.changed && projectResult.config) {
    const projectConfigPath = await getProjectConfigPath();
    try {
      backupPath = await backupConfigFile(projectConfigPath);
    } catch {
      // Best effort. Migration remains atomic because provider and model save together below.
    }
    await saveProjectConfig(projectResult.config);
  }

  const changes = [...userResult.changes, ...projectResult.changes];
  if (changes.length > 0) {
    queueMigrationNotice({ changes, backupPath });
  }

  return {
    userConfig: userResult.config,
    projectConfig: projectResult.config,
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

        let loaded: { userConfig?: UserConfig; projectConfig?: UserConfig };
        try {
          loaded = await migrateLoadedLegacyConfigs(
            await loadUserConfig(),
            await loadProjectConfig(),
            options.options,
          );
        } catch (error) {
          console.error(pc.red(`Error: ${extractErrorMessage(error)}`));
          throw error;
        }
        const existingConfig = loaded.userConfig;
        const existingProjectConfig = loaded.projectConfig;

        const isGlobalComplete = isConfigComplete(existingConfig);
        const isProjectComplete = isConfigComplete(existingProjectConfig);
        const hasCompleteOverride = Boolean(options.options.provider && options.options.model);

        // Show update notification early
        const updateResult = await updateCheckPromise;
        showUpdateNotification(updateResult);

        // Neither config is complete. Two scenarios:
        // 1. Config has provider+model but they're invalid → hard error with guidance
        // 2. Config is truly missing or empty → return needsSetup to trigger onboarding
        if (!isGlobalComplete && !isProjectComplete && !hasCompleteOverride) {
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
          loaded,
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
    generationMachine: generationMachine.provide({
      actors: {
        getBranchNameActor,
        setBranchNameActor,
        gatherContextActor,
        invokeAIActor,
        commitActor,
        selectActor,
        textActor,
        displayCommitResultActor,
        displayValidationWarningsActor,
        displayCommitMessageActor,
        displayDryRunActor,
        displayAIErrorActor,
        editorActor,
      } as any,
    }),

    // ── Push ─────────────────────────────────────────────────────────
    pushMachine: pushMachine.provide({
      actors: {
        pushActor: fromPromise(async () => {
          const s = spinner();
          s.start("Pushing changes...");
          try {
            await push();
            s.stop("Pushed successfully");
          } catch (error) {
            s.stop("Push failed", 1);
            throw error;
          }
        }),
        addRemoteAndPushActor: fromPromise(async ({ input }: { input: { url: string } }) => {
          const s = spinner();
          s.start("Adding remote and pushing...");
          try {
            await addRemoteAndPush(input.url);
            s.stop("Remote added and pushed successfully");
          } catch (error) {
            s.stop("Failed to push to new remote", 1);
            throw error;
          }
        }),
        fetchRemoteActor: fromPromise(async () => {
          const s = spinner();
          s.start("Looking for upstream changes...");
          try {
            await fetchRemote();
            s.stop("Checked remote");
          } catch (error) {
            s.stop("Could not reach remote", 1);
            throw error;
          }
        }),
        checkRemoteAheadActor: fromPromise(async () => {
          return await getRemoteAheadCount();
        }),
        pullRebaseActor: fromPromise(async () => {
          const s = spinner();
          s.start("Pulling and rebasing...");
          try {
            await pullRebase();
            s.stop("Rebased successfully");
          } catch (error) {
            s.stop("Rebase failed", 1);
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
