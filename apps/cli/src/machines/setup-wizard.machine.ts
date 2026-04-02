import { setup, fromPromise, assign } from "xstate";
import { runWizard, type WizardResult } from "../lib/onboarding/wizard.ts";
import type { UserConfig } from "../config.ts";
import { UserCancelledError } from "../lib/errors.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface SetupWizardInput {
  target: "global" | "project";
  defaults?: Partial<UserConfig>;
}

export interface SetupWizardOutput {
  completed: boolean;
  continueToRun: boolean;
  exitCode: 0 | 1;
  config: UserConfig | null;
}

interface SetupWizardContext {
  target: "global" | "project";
  defaults?: Partial<UserConfig>;
  completed: boolean;
  exitCode: 0 | 1;
  config: UserConfig | null;
}

// ── Machine ──────────────────────────────────────────────────────────

export const setupWizardMachine = setup({
  types: {
    context: {} as SetupWizardContext,
    input: {} as SetupWizardInput,
    output: {} as SetupWizardOutput,
  },
  actors: {
    runWizardActor: fromPromise(
      async ({
        input,
      }: {
        input: { target: "global" | "project"; defaults?: Partial<UserConfig> };
      }): Promise<WizardResult> => {
        return runWizard({ target: input.target, defaults: input.defaults });
      },
    ),
  },
}).createMachine({
  id: "setupWizard",
  initial: "running",
  context: ({ input }) => ({
    target: input.target,
    defaults: input.defaults,
    completed: false,
    exitCode: 1 as const,
    config: null,
  }),
  states: {
    running: {
      invoke: {
        src: "runWizardActor",
        input: ({ context }) => ({
          target: context.target,
          defaults: context.defaults,
        }),
        onDone: {
          target: "done",
          actions: assign({
            completed: ({ event }) => event.output.completed,
            exitCode: ({ event }) => (event.output.completed ? (0 as const) : (1 as const)),
            config: ({ event }) => event.output.config,
          }),
        },
        onError: {
          target: "done",
          actions: ({ event }) => {
            if (!(event.error instanceof UserCancelledError)) {
              console.error("[setupWizard] Unexpected error:", event.error);
            }
          },
        },
      },
    },
    done: {
      type: "final",
    },
  },
  output: ({ context }) => ({
    completed: context.completed,
    continueToRun: false,
    exitCode: context.exitCode,
    config: context.config,
  }),
});
