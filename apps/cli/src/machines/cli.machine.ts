import { setup, assign, fromPromise } from "xstate";
import type { ProviderDefinition } from "../types.ts";
import type { ProviderAdapter } from "../providers/types.ts";
import type { ResolvedConfig } from "../config.ts";

// ── Types ────────────────────────────────────────────────────────────

/**
 * CLI options parsed from command-line arguments.
 * Exported so index.ts can import and use this as a shared interface.
 */
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
  exclude?: string | string[];
  dryRun: boolean;

  // Meta
  setup: boolean;
  init: boolean;
  version: boolean;
  help: boolean;
}

/**
 * Input provided to the CLI machine on creation.
 */
export interface CLIInput {
  options: CLIOptions;
  version: string;
}

/**
 * Output produced when the CLI machine reaches its final state.
 */
export interface CLIOutput {
  exitCode: 0 | 1 | 130;
}

/**
 * Result from the loadAndResolveConfigActor.
 * Bundles everything needed after config resolution.
 */
export interface ConfigResolutionResult {
  config: ResolvedConfig;
  providerDef: ProviderDefinition | null;
  adapter: ProviderAdapter | null;
  model: string;
  modelName: string;
  /** Whether the setup wizard / onboarding needs to run */
  needsSetup: boolean;
}

/**
 * Result from the onboarding actor.
 */
export interface OnboardingActorResult {
  completed: boolean;
  continueToRun: boolean;
}

/**
 * Internal context for the CLI machine.
 */
interface CLIContext {
  // From input
  options: CLIOptions;
  version: string;

  // Resolved state
  configResult: ConfigResolutionResult | null;
  exitCode: 0 | 1 | 130;
}

// ── Machine ──────────────────────────────────────────────────────────

export const cliMachine = setup({
  types: {
    context: {} as CLIContext,
    input: {} as CLIInput,
    output: {} as CLIOutput,
  },
  actors: {
    // ── Init flow ────────────────────────────────────────────────────
    initMachine: fromPromise(
      async (): Promise<{ continue: boolean; exitCode: 0 | 1 }> => {
        // Default implementation — replaced by actual initMachine in production
        return { continue: false, exitCode: 0 };
      },
    ),

    // ── Config resolution ────────────────────────────────────────────
    loadAndResolveConfigActor: fromPromise(
      async (): Promise<ConfigResolutionResult> => {
        // Default implementation — replaced in production with real config logic
        // including Bug #2 fix: dynamic provider list via PROVIDERS.map(p => p.id)
        throw new Error("loadAndResolveConfigActor not provided");
      },
    ),

    // ── Welcome screen ───────────────────────────────────────────────
    showWelcomeActor: fromPromise(async (): Promise<void> => {
      // Default implementation — replaced in production
    }),

    // ── Onboarding / setup wizard ────────────────────────────────────
    runOnboardingActor: fromPromise(
      async (): Promise<OnboardingActorResult> => {
        return { completed: false, continueToRun: false };
      },
    ),

    // ── Reload config after onboarding ───────────────────────────────
    reloadConfigActor: fromPromise(
      async (): Promise<ConfigResolutionResult> => {
        throw new Error("reloadConfigActor not provided");
      },
    ),

    // ── Git checks ───────────────────────────────────────────────────
    checkGitActor: fromPromise(async (): Promise<void> => {
      // Default: checkGitInstalled() + checkInsideRepo()
    }),

    // ── Provider availability ────────────────────────────────────────
    checkAvailabilityActor: fromPromise(async (): Promise<boolean> => {
      return true;
    }),

    // ── Child machines (wrapped as fromPromise for easy testing) ─────
    stagingMachine: fromPromise(
      async (): Promise<{ stagedFiles: string[]; aborted: boolean }> => {
        return { stagedFiles: [], aborted: false };
      },
    ),

    generationMachine: fromPromise(
      async (): Promise<{
        message: string;
        committed: boolean;
        aborted: boolean;
      }> => {
        return { message: "", committed: false, aborted: false };
      },
    ),

    pushMachine: fromPromise(
      async (): Promise<{ pushed: boolean; exitCode: 0 }> => {
        return { pushed: false, exitCode: 0 };
      },
    ),
  },
  guards: {
    isInitFlag: ({ context }) => context.options.init,
    initContinues: ({ event }) => {
      const output = (event as { output?: { continue: boolean } }).output;
      return output?.continue === true;
    },
    needsSetup: ({ context }) =>
      context.options.setup ||
      (context.configResult?.needsSetup ?? false),
    onboardingCompleted: ({ event }) => {
      const output = (
        event as { output?: OnboardingActorResult }
      ).output;
      return output?.completed === true;
    },
    onboardingContinues: ({ event }) => {
      const output = (
        event as { output?: OnboardingActorResult }
      ).output;
      return output?.completed === true && output?.continueToRun === true;
    },
    stagingAborted: ({ event }) => {
      const output = (
        event as { output?: { aborted: boolean } }
      ).output;
      return output?.aborted === true;
    },
    hasNoStagedFiles: ({ event }) => {
      const output = (
        event as { output?: { stagedFiles: string[] } }
      ).output;
      return (output?.stagedFiles?.length ?? 0) === 0;
    },
    generationAborted: ({ event }) => {
      const output = (
        event as { output?: { aborted: boolean } }
      ).output;
      return output?.aborted === true;
    },
  },
  actions: {
    expandAutoApproveFlags: assign({
      options: ({ context }) => {
        if (context.options.dangerouslyAutoApprove) {
          return {
            ...context.options,
            stageAll: true,
            commit: true,
            push: true,
          };
        }
        return context.options;
      },
    }),
    assignConfigResult: assign({
      configResult: ({ event }) =>
        (event as { output?: ConfigResolutionResult }).output ?? null,
    }),
    setExitOk: assign({ exitCode: 0 as const }),
    setExitError: assign({ exitCode: 1 as const }),
    setExitInterrupt: assign({ exitCode: 130 as const }),
  },
}).createMachine({
  id: "cli",
  initial: "processFlags",
  context: ({ input }) => ({
    options: input.options,
    version: input.version,
    configResult: null,
    exitCode: 0 as const,
  }),
  output: ({ context }) => ({
    exitCode: context.exitCode,
  }),
  states: {
    // ══════════════════════════════════════════════════════════════════
    // ── PROCESS FLAGS ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    processFlags: {
      entry: "expandAutoApproveFlags",
      always: [
        {
          guard: "isInitFlag",
          target: "init",
        },
        {
          target: "loadConfig",
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // ── INIT (--init flag) ────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    init: {
      invoke: {
        src: "initMachine",
        onDone: [
          {
            guard: "initContinues",
            target: "loadConfig",
          },
          {
            // Init completed without wanting to continue — use init's exitCode
            target: "exit",
            actions: assign({
              exitCode: ({ event }) => {
                const output = (
                  event as { output?: { exitCode: 0 | 1 } }
                ).output;
                return output?.exitCode ?? 0;
              },
            }),
          },
        ],
        onError: {
          target: "exit",
          actions: "setExitError",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── LOAD CONFIG ───────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    loadConfig: {
      invoke: {
        src: "loadAndResolveConfigActor",
        input: ({ context }) => ({
          options: context.options,
          version: context.version,
        }),
        onDone: {
          target: "showWelcome",
          actions: "assignConfigResult",
        },
        onError: {
          // Config loading failed (includes Bug #2: unknown provider error)
          target: "exit",
          actions: "setExitError",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── SHOW WELCOME ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    showWelcome: {
      invoke: {
        src: "showWelcomeActor",
        input: ({ context }) => ({
          version: context.version,
          configResult: context.configResult,
          needsSetup:
            context.options.setup ||
            (context.configResult?.needsSetup ?? false),
        }),
        onDone: [
          {
            guard: "needsSetup",
            target: "runOnboarding",
          },
          {
            target: "checkGit",
          },
        ],
        onError: {
          // Welcome screen error is non-fatal, continue
          target: "checkGit",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── RUN ONBOARDING (--setup or missing config) ────────────────────
    // ══════════════════════════════════════════════════════════════════
    runOnboarding: {
      invoke: {
        src: "runOnboardingActor",
        input: ({ context }) => ({
          options: context.options,
        }),
        onDone: [
          {
            // Onboarding completed and user wants to continue
            guard: "onboardingContinues",
            target: "reloadConfig",
          },
          {
            // Onboarding completed but user chose to exit
            guard: "onboardingCompleted",
            target: "exit",
            actions: "setExitOk",
          },
          {
            // Onboarding not completed (cancelled)
            target: "exit",
            actions: "setExitError",
          },
        ],
        onError: {
          target: "exit",
          actions: "setExitError",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── RELOAD CONFIG (after onboarding) ──────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    reloadConfig: {
      invoke: {
        src: "reloadConfigActor",
        input: ({ context }) => ({
          options: context.options,
          version: context.version,
        }),
        onDone: {
          target: "checkGit",
          actions: "assignConfigResult",
        },
        onError: {
          // If reload fails after onboarding, treat as error
          target: "exit",
          actions: "setExitError",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── CHECK GIT ─────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    checkGit: {
      invoke: {
        src: "checkGitActor",
        onDone: {
          target: "checkAvailability",
        },
        onError: {
          target: "exit",
          actions: "setExitError",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── CHECK AVAILABILITY ────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    checkAvailability: {
      invoke: {
        src: "checkAvailabilityActor",
        input: ({ context }) => ({
          configResult: context.configResult!,
          dryRun: context.options.dryRun,
        }),
        onDone: {
          target: "staging",
        },
        onError: {
          target: "exit",
          actions: "setExitError",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── STAGING ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    staging: {
      invoke: {
        src: "stagingMachine",
        input: ({ context }) => ({
          stageAll: context.options.stageAll,
          dangerouslyAutoApprove: context.options.dangerouslyAutoApprove,
          exclude: context.options.exclude
            ? Array.isArray(context.options.exclude)
              ? context.options.exclude
              : [context.options.exclude]
            : [],
        }),
        onDone: [
          {
            guard: "stagingAborted",
            target: "exit",
            actions: "setExitError",
          },
          {
            guard: "hasNoStagedFiles",
            // Clean working directory — exit ok
            target: "exit",
            actions: "setExitOk",
          },
          {
            target: "generation",
          },
        ],
        onError: {
          target: "exit",
          actions: "setExitError",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── GENERATION ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    generation: {
      invoke: {
        src: "generationMachine",
        input: ({ context }) => {
          // configResult is guaranteed non-null: loadConfig succeeds before reaching here
          const cr = context.configResult!;
          return {
            model: cr.model,
            modelName: cr.modelName,
            options: {
              commit: context.options.commit,
              dangerouslyAutoApprove: context.options.dangerouslyAutoApprove,
              dryRun: context.options.dryRun,
              hint: context.options.hint,
            },
            slowWarningThresholdMs: cr.config?.slowWarningThresholdMs ?? 5000,
            adapter: cr.adapter,
            promptCustomization: cr.config?.prompt,
            editor: cr.config?.editor,
          };
        },
        onDone: [
          {
            guard: "generationAborted",
            target: "exit",
            actions: "setExitError",
          },
          {
            target: "push",
          },
        ],
        onError: {
          target: "exit",
          actions: "setExitError",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── PUSH ──────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    push: {
      invoke: {
        src: "pushMachine",
        input: ({ context }) => {
          const isInteractiveMode =
            !context.options.commit &&
            !context.options.stageAll &&
            !context.options.push &&
            !context.options.dangerouslyAutoApprove;
          return {
            push: context.options.push,
            dangerouslyAutoApprove: context.options.dangerouslyAutoApprove,
            isInteractiveMode,
          };
        },
        onDone: {
          target: "exit",
          actions: "setExitOk",
        },
        onError: {
          // Push errors are non-fatal (push machine handles its own error states)
          target: "exit",
          actions: "setExitOk",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── EXIT (final) ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    exit: {
      type: "final",
    },
  },
});
