// @ts-nocheck — XState v5 invoke src/input type inference is overly strict
import { setup, assign, type ActorLogicFrom } from "xstate";
import {
  getStagedFilesActor as defaultGetStagedFilesActor,
  getUnstagedFilesActor as defaultGetUnstagedFilesActor,
  stageAllExceptActor as defaultStageAllExceptActor,
  stageFilesActor as defaultStageFilesActor,
} from "./actors/git.actors.ts";
import {
  selectActor as defaultSelectActor,
  multiselectActor as defaultMultiselectActor,
} from "./actors/clack.actors.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface StagingMachineInput {
  stageAll: boolean;
  dangerouslyAutoApprove: boolean;
  exclude: string[];
}

export interface StagingMachineContext {
  stageAll: boolean;
  dangerouslyAutoApprove: boolean;
  exclude: string[];
  stagedFiles: string[];
  unstagedFiles: string[];
  aborted: boolean;
}

export interface StagingMachineOutput {
  stagedFiles: string[];
  aborted: boolean;
}

// ── Machine ──────────────────────────────────────────────────────────

export const stagingMachine = setup({
  types: {
    context: {} as StagingMachineContext,
    input: {} as StagingMachineInput,
    output: {} as StagingMachineOutput,
  },
  actors: {
    getStagedFilesActor: defaultGetStagedFilesActor as ActorLogicFrom<
      typeof defaultGetStagedFilesActor
    >,
    getUnstagedFilesActor: defaultGetUnstagedFilesActor as ActorLogicFrom<
      typeof defaultGetUnstagedFilesActor
    >,
    stageAllExceptActor: defaultStageAllExceptActor as ActorLogicFrom<
      typeof defaultStageAllExceptActor
    >,
    stageFilesActor: defaultStageFilesActor as ActorLogicFrom<
      typeof defaultStageFilesActor
    >,
    selectActor: defaultSelectActor as ActorLogicFrom<
      typeof defaultSelectActor
    >,
    multiselectActor: defaultMultiselectActor as ActorLogicFrom<
      typeof defaultMultiselectActor
    >,
  },
  guards: {
    hasStaged: ({ context }) => context.stagedFiles.length > 0,
    hasUnstaged: ({ context }) => context.unstagedFiles.length > 0,
    shouldAutoStage: ({ context }) =>
      context.stageAll || context.dangerouslyAutoApprove,
  },
  actions: {
    assignStagedFiles: assign({
      stagedFiles: ({ event }) => {
        return (event as { output?: string[] }).output ?? [];
      },
    }),
    assignUnstagedFiles: assign({
      unstagedFiles: ({ event }) => {
        return (event as { output?: string[] }).output ?? [];
      },
    }),
    markAborted: assign({ aborted: true }),
  },
}).createMachine({
  id: "staging",
  initial: "checkStaged",
  context: ({ input }) => ({
    stageAll: input.stageAll,
    dangerouslyAutoApprove: input.dangerouslyAutoApprove,
    exclude: input.exclude,
    stagedFiles: [],
    unstagedFiles: [],
    aborted: false,
  }),
  output: ({ context }) => ({
    stagedFiles: context.stagedFiles,
    aborted: context.aborted,
  }),
  states: {
    // ── Entry: fetch staged files to determine path ──────────────────
    checkStaged: {
      invoke: {
        src: "getStagedFilesActor",
        onDone: {
          target: "checkUnstaged",
          actions: "assignStagedFiles",
        },
      },
    },

    // ── Fetch unstaged files before deciding path ────────────────────
    checkUnstaged: {
      invoke: {
        src: "getUnstagedFilesActor",
        onDone: {
          target: "routing",
          actions: "assignUnstagedFiles",
        },
      },
    },

    // ── Route to hasStaged or noneStaged path ────────────────────────
    routing: {
      always: [
        { guard: "hasStaged", target: "hasStaged" },
        { target: "noneStaged" },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // ── Path A: hasStaged ────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    hasStaged: {
      initial: "checkUnstagedInHasStaged",
      states: {
        // ── ST1: no unstaged → done immediately ────────────────────
        // ── ST5/ST6: auto-stage if stageAll or autoApprove ─────────
        // ── Otherwise: interactive prompt ───────────────────────────
        checkUnstagedInHasStaged: {
          always: [
            {
              guard: { type: "hasUnstaged", params: undefined },
              target: "checkAutoStageMore",
            },
            {
              // ST1: no unstaged files → proceed with what's staged
              target: "done",
            },
          ],
        },

        // Decide whether to auto-stage or prompt interactively
        checkAutoStageMore: {
          always: [
            {
              // ST5/ST6: BUG #1 FIX — auto-stage remaining files
              guard: { type: "shouldAutoStage", params: undefined },
              target: "autoStageMore",
            },
            {
              target: "promptMore",
            },
          ],
        },

        // ── ST5/ST6: invoke stageAllExcept then refresh ────────────
        autoStageMore: {
          invoke: {
            src: "stageAllExceptActor",
            input: ({ context }) => ({ exclude: context.exclude }),
            onDone: "refreshStagedAfterAutoMore",
          },
        },

        refreshStagedAfterAutoMore: {
          invoke: {
            src: "getStagedFilesActor",
            onDone: {
              target: "done",
              actions: "assignStagedFiles",
            },
          },
        },

        // ── ST2/ST3/ST4/ST12: interactive prompt ───────────────────
        promptMore: {
          invoke: {
            src: "selectActor",
            input: ({ context }) => ({
              message: `${context.stagedFiles.length} file(s) staged. ${context.unstagedFiles.length} unstaged file(s) remaining.`,
              options: [
                {
                  value: "proceed",
                  label: "Proceed with staged files",
                },
                {
                  value: "select_files",
                  label: "Select files to stage",
                },
                {
                  value: "stage_all",
                  label: "Stage all remaining files",
                },
                {
                  value: "cancel",
                  label: "Cancel",
                },
              ],
            }),
            onDone: [
              {
                guard: ({ event }) => event.output === "proceed",
                target: "done",
              },
              {
                guard: ({ event }) => event.output === "select_files",
                target: "multiSelectMore",
              },
              {
                guard: ({ event }) => event.output === "stage_all",
                target: "stageAllMore",
              },
              {
                // cancel
                target: "aborted",
              },
            ],
            onError: {
              // Ctrl+C
              target: "aborted",
            },
          },
        },

        // ── ST3: multi-select files to stage ───────────────────────
        multiSelectMore: {
          invoke: {
            src: "multiselectActor",
            input: ({ context }) => ({
              message: "Select files to stage:",
              options: context.unstagedFiles.map((f) => ({
                value: f,
                label: f,
              })),
            }),
            onDone: [
              {
                guard: ({ event }) =>
                  Array.isArray(event.output) && event.output.length === 0,
                // ST13: 0 chosen → proceed with existing staged
                target: "done",
              },
              {
                target: "stageSelectedMore",
              },
            ],
            onError: {
              target: "aborted",
            },
          },
        },

        // ── Stage the selected files ───────────────────────────────
        stageSelectedMore: {
          invoke: {
            src: "stageFilesActor",
            input: ({ event }) => ({
              files: (event as { output?: string[] }).output ?? [],
            }),
            onDone: "refreshStagedAfterSelectMore",
          },
        },

        refreshStagedAfterSelectMore: {
          invoke: {
            src: "getStagedFilesActor",
            onDone: {
              target: "done",
              actions: "assignStagedFiles",
            },
          },
        },

        // ── ST4: stage all remaining ───────────────────────────────
        stageAllMore: {
          invoke: {
            src: "stageAllExceptActor",
            input: ({ context }) => ({ exclude: context.exclude }),
            onDone: "refreshStagedAfterStageAllMore",
          },
        },

        refreshStagedAfterStageAllMore: {
          invoke: {
            src: "getStagedFilesActor",
            onDone: {
              target: "done",
              actions: "assignStagedFiles",
            },
          },
        },

        // ── Terminal states ────────────────────────────────────────
        aborted: {
          type: "final" as const,
          entry: "markAborted",
        },

        done: {
          type: "final" as const,
        },
      },
      onDone: "done",
    },

    // ══════════════════════════════════════════════════════════════════
    // ── Path B: noneStaged ───────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    noneStaged: {
      initial: "checkUnstagedInNoneStaged",
      states: {
        // ── ST7: nothing unstaged either → clean ───────────────────
        // ── ST8: stageAll → auto-stage all ─────────────────────────
        // ── Otherwise: interactive prompt ───────────────────────────
        checkUnstagedInNoneStaged: {
          always: [
            {
              guard: { type: "hasUnstaged", params: undefined },
              target: "checkAutoStageAll",
            },
            {
              // ST7: clean working directory
              target: "done",
            },
          ],
        },

        // Decide whether to auto-stage or prompt
        checkAutoStageAll: {
          always: [
            {
              // ST8: auto-stage all
              guard: { type: "shouldAutoStage", params: undefined },
              target: "autoStageAll",
            },
            {
              target: "promptAction",
            },
          ],
        },

        // ── ST8: invoke stageAllExcept then refresh ────────────────
        autoStageAll: {
          invoke: {
            src: "stageAllExceptActor",
            input: ({ context }) => ({ exclude: context.exclude }),
            onDone: "refreshStagedAfterAutoAll",
          },
        },

        refreshStagedAfterAutoAll: {
          invoke: {
            src: "getStagedFilesActor",
            onDone: {
              target: "done",
              actions: "assignStagedFiles",
            },
          },
        },

        // ── ST9/ST10/ST11/ST12: interactive prompt ─────────────────
        promptAction: {
          invoke: {
            src: "selectActor",
            input: ({ context }) => ({
              message: `${context.unstagedFiles.length} unstaged file(s). What would you like to do?`,
              options: [
                {
                  value: "stage_all",
                  label: "Stage all files",
                },
                {
                  value: "select_files",
                  label: "Select files to stage",
                },
                {
                  value: "cancel",
                  label: "Cancel",
                },
              ],
            }),
            onDone: [
              {
                guard: ({ event }) => event.output === "stage_all",
                target: "stageAll",
              },
              {
                guard: ({ event }) => event.output === "select_files",
                target: "selectFiles",
              },
              {
                // cancel
                target: "aborted",
              },
            ],
            onError: {
              // Ctrl+C
              target: "aborted",
            },
          },
        },

        // ── ST9: stage all ─────────────────────────────────────────
        stageAll: {
          invoke: {
            src: "stageAllExceptActor",
            input: ({ context }) => ({ exclude: context.exclude }),
            onDone: "refreshStagedAfterStageAll",
          },
        },

        refreshStagedAfterStageAll: {
          invoke: {
            src: "getStagedFilesActor",
            onDone: {
              target: "done",
              actions: "assignStagedFiles",
            },
          },
        },

        // ── ST10: select files ─────────────────────────────────────
        selectFiles: {
          invoke: {
            src: "multiselectActor",
            input: ({ context }) => ({
              message: "Select files to stage:",
              options: context.unstagedFiles.map((f) => ({
                value: f,
                label: f,
              })),
            }),
            onDone: [
              {
                guard: ({ event }) =>
                  Array.isArray(event.output) && event.output.length === 0,
                target: "done",
              },
              {
                target: "stageSelected",
              },
            ],
            onError: {
              target: "aborted",
            },
          },
        },

        // ── Stage the selected files ───────────────────────────────
        stageSelected: {
          invoke: {
            src: "stageFilesActor",
            input: ({ event }) => ({
              files: (event as { output?: string[] }).output ?? [],
            }),
            onDone: "refreshStagedAfterSelect",
          },
        },

        refreshStagedAfterSelect: {
          invoke: {
            src: "getStagedFilesActor",
            onDone: {
              target: "done",
              actions: "assignStagedFiles",
            },
          },
        },

        // ── Terminal states ────────────────────────────────────────
        aborted: {
          type: "final" as const,
          entry: "markAborted",
        },

        done: {
          type: "final" as const,
        },
      },
      onDone: "done",
    },

    // ── Terminal state ───────────────────────────────────────────────
    done: {
      type: "final",
    },
  },
});
