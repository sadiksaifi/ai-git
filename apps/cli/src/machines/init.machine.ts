import { setup, assign, fromPromise, type ActorLogicFrom } from "xstate";
import {
  loadProjectConfig,
  loadUserConfig,
  saveProjectConfig,
  type UserConfig,
} from "../config.ts";
import {
  confirmActor as defaultConfirmActor,
  selectActor as defaultSelectActor,
} from "./actors/clack.actors.ts";
import { setupWizardMachine as defaultSetupWizardMachine } from "./setup-wizard.machine.ts";

// ── Types ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface InitInput {}

export interface InitOutput {
  continue: boolean; // true = continue to normal flow (IN9)
  exitCode: 0 | 1; // 0 = success/user chose to exit, 1 = error/cancel
}

interface InitContext {
  projectConfig: UserConfig | null;
  globalConfig: UserConfig | null;
  continue: boolean;
  exitCode: 0 | 1;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Simple completeness check: a config is complete if it has both
 * `provider` and `model` fields set.
 */
function hasProviderAndModel(config: UserConfig | null | undefined): boolean {
  if (!config) return false;
  return Boolean(config.provider && config.model);
}

// ── Machine ──────────────────────────────────────────────────────────

export const initMachine = setup({
  types: {
    context: {} as InitContext,
    input: {} as InitInput,
    output: {} as InitOutput,
  },
  actors: {
    loadProjectConfigActor: fromPromise(async () => {
      const config = await loadProjectConfig();
      return (config ?? null) as UserConfig | null;
    }),
    loadGlobalConfigActor: fromPromise(async () => {
      const config = await loadUserConfig();
      return (config ?? null) as UserConfig | null;
    }),
    saveProjectConfigActor: fromPromise(
      async ({ input }: { input: { config: UserConfig } }) => {
        await saveProjectConfig(input.config);
      }
    ),
    setupWizardMachine: defaultSetupWizardMachine as ActorLogicFrom<
      typeof defaultSetupWizardMachine
    >,
    confirmActor: defaultConfirmActor as ActorLogicFrom<
      typeof defaultConfirmActor
    >,
    selectActor: defaultSelectActor as ActorLogicFrom<
      typeof defaultSelectActor
    >,
  },
  guards: {
    hasProjectConfig: ({ context }) => context.projectConfig !== null,
    isGlobalConfigComplete: ({ context }) =>
      hasProviderAndModel(context.globalConfig),
    isWizardCompleted: ({ event }) => {
      const output = (event as { output?: { completed?: boolean } }).output;
      return output?.completed === true;
    },
    isConfirmed: ({ event }) => {
      return (event as { output?: boolean }).output === true;
    },
    isCopyChoice: ({ event }) => {
      return (event as { output?: string }).output === "copy";
    },
    isWizardChoice: ({ event }) => {
      return (event as { output?: string }).output === "wizard";
    },
  },
  actions: {
    assignProjectConfig: assign({
      projectConfig: ({ event }) =>
        ((event as { output?: UserConfig | null }).output ?? null) as UserConfig | null,
    }),
    assignGlobalConfig: assign({
      globalConfig: ({ event }) =>
        ((event as { output?: UserConfig | null }).output ?? null) as UserConfig | null,
    }),
    setContinueTrue: assign({ continue: true }),
    setExitError: assign({ exitCode: 1 as const }),
  },
}).createMachine({
  id: "init",
  initial: "checkProject",
  context: () => ({
    projectConfig: null,
    globalConfig: null,
    continue: false,
    exitCode: 0 as const,
  }),
  output: ({ context }) => ({
    continue: context.continue,
    exitCode: context.exitCode,
  }),
  states: {
    // ── IN1-IN4, IN5: Check if project config exists ─────────────────
    checkProject: {
      invoke: {
        src: "loadProjectConfigActor",
        onDone: {
          target: "routeAfterProjectCheck",
          actions: "assignProjectConfig",
        },
        onError: {
          target: "checkGlobal",
        },
      },
    },

    routeAfterProjectCheck: {
      always: [
        {
          guard: "hasProjectConfig",
          target: "confirmOverwrite",
        },
        {
          target: "checkGlobal",
        },
      ],
    },

    // ── IN5: Confirm overwriting existing project config ─────────────
    confirmOverwrite: {
      invoke: {
        src: "confirmActor",
        input: {
          message: "Project config (.ai-git.json) already exists. Overwrite?",
          initialValue: false,
        },
        onDone: [
          {
            guard: "isConfirmed",
            target: "checkGlobal",
          },
          {
            // IN6: User declined overwrite → exit ok
            target: "exitOk",
          },
        ],
        onError: {
          // IN7: Ctrl+C → exit ok
          target: "exitOk",
        },
      },
    },

    // ── IN1-IN4: Check global config ─────────────────────────────────
    checkGlobal: {
      invoke: {
        src: "loadGlobalConfigActor",
        onDone: {
          target: "routeAfterGlobalCheck",
          actions: "assignGlobalConfig",
        },
        onError: {
          // Treat load error as no global config
          target: "confirmSetup",
        },
      },
    },

    routeAfterGlobalCheck: {
      always: [
        {
          guard: "isGlobalConfigComplete",
          target: "initChoice",
        },
        {
          // IN3/IN4: No global config
          target: "confirmSetup",
        },
      ],
    },

    // ── IN3/IN4: No global config — ask if user wants to set up ──────
    confirmSetup: {
      invoke: {
        src: "confirmActor",
        input: {
          message: "No global config found. Run setup wizard?",
          initialValue: true,
        },
        onDone: [
          {
            guard: "isConfirmed",
            target: "runWizard", // IN3
          },
          {
            target: "exitOk", // IN4
          },
        ],
        onError: {
          target: "exitOk", // Ctrl+C
        },
      },
    },

    // ── IN1/IN2: Global config exists — choose action ────────────────
    initChoice: {
      invoke: {
        src: "selectActor",
        input: {
          message: "How would you like to initialize this project?",
          options: [
            { value: "copy", label: "Copy from global config" },
            { value: "wizard", label: "Run setup wizard" },
          ],
        },
        onDone: [
          {
            guard: "isCopyChoice",
            target: "copyGlobal", // IN1
          },
          {
            guard: "isWizardChoice",
            target: "runWizard", // IN2
          },
          {
            // Unknown choice — treat as cancel
            target: "exitErr",
          },
        ],
        onError: {
          // IN8: Ctrl+C / cancel
          target: "exitErr",
        },
      },
    },

    // ── IN1: Copy global config to project ───────────────────────────
    copyGlobal: {
      invoke: {
        src: "saveProjectConfigActor",
        input: ({ context }) => ({
          config: context.globalConfig!,
        }),
        onDone: {
          target: "askTryNow",
        },
        onError: {
          target: "exitErr",
        },
      },
    },

    // ── IN2/IN3: Run setup wizard ────────────────────────────────────
    runWizard: {
      invoke: {
        src: "setupWizardMachine",
        input: {
          target: "project" as const,
          defaults: undefined,
        },
        onDone: [
          {
            // Bug #4 fix: check completed flag — no process.exit!
            guard: "isWizardCompleted",
            target: "askTryNow",
          },
          {
            // Wizard did not complete → exit error
            target: "exitErr",
          },
        ],
        onError: {
          target: "exitErr",
        },
      },
    },

    // ── IN9/IN10: Ask if user wants to run ai-git now ────────────────
    askTryNow: {
      invoke: {
        src: "confirmActor",
        input: {
          message: "Run ai-git now?",
          initialValue: true,
        },
        onDone: [
          {
            guard: "isConfirmed",
            target: "exitContinue", // IN9
          },
          {
            target: "exitOk", // IN10
          },
        ],
        onError: {
          // Ctrl+C → exit ok
          target: "exitOk",
        },
      },
    },

    // ── Terminal states ──────────────────────────────────────────────
    exitContinue: {
      type: "final",
      entry: "setContinueTrue",
    },

    exitOk: {
      type: "final",
      // continue=false, exitCode=0 (defaults)
    },

    exitErr: {
      type: "final",
      entry: "setExitError",
    },
  },
});
