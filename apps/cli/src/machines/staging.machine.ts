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
import {
  displayStagedResultActor as defaultDisplayStagedResultActor,
  displayFileSummaryActor as defaultDisplayFileSummaryActor,
} from "./actors/display.actors.ts";

// ── Types (UNCHANGED — same interface) ────────────────────────────────

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

// ── Machine ───────────────────────────────────────────────────────────

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
    stageFilesActor: defaultStageFilesActor as ActorLogicFrom<typeof defaultStageFilesActor>,
    selectActor: defaultSelectActor as ActorLogicFrom<typeof defaultSelectActor>,
    multiselectActor: defaultMultiselectActor as ActorLogicFrom<typeof defaultMultiselectActor>,
    displayStagedResultActor: defaultDisplayStagedResultActor as ActorLogicFrom<
      typeof defaultDisplayStagedResultActor
    >,
    displayFileSummaryActor: defaultDisplayFileSummaryActor as ActorLogicFrom<
      typeof defaultDisplayFileSummaryActor
    >,
  },
  guards: {
    shouldAutoStage: ({ context }) => context.stageAll || context.dangerouslyAutoApprove,
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
  initial: "fetchStaged",
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
    // ── Fetch staged files ──────────────────────────────────────────
    fetchStaged: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "getStagedFilesActor",
        onDone: {
          target: "fetchUnstaged",
          actions: "assignStagedFiles",
        },
        onError: {
          target: "aborted",
        },
      },
    },

    // ── Fetch unstaged files ────────────────────────────────────────
    fetchUnstaged: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "getUnstagedFilesActor",
        onDone: {
          target: "evaluate",
          actions: "assignUnstagedFiles",
        },
        onError: {
          target: "aborted",
        },
      },
    },

    // ── Evaluate what to do based on staged/unstaged/flags ──────────
    evaluate: {
      always: [
        {
          // ST7: clean working tree — nothing staged, nothing unstaged
          guard: ({ context }) =>
            context.stagedFiles.length === 0 && context.unstagedFiles.length === 0,
          target: "done",
        },
        {
          // ST1: has staged, no unstaged → proceed with what's staged
          guard: ({ context }) =>
            context.stagedFiles.length > 0 && context.unstagedFiles.length === 0,
          target: "showResult",
        },
        {
          // ST5/ST6/ST8/ST-AUTO1: auto-stage path
          guard: "shouldAutoStage",
          target: "stageAll",
        },
        {
          // Interactive path — show file summary first
          target: "showFileSummary",
        },
      ],
    },

    // ── Display staged + unstaged file lists before prompt ───────────
    showFileSummary: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "displayFileSummaryActor",
        onDone: "prompt",
        onError: "prompt", // non-fatal
      },
    },

    // ── Interactive prompt ───────────────────────────────────────────
    prompt: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "selectActor",
        input: ({ context }) => ({
          message:
            context.stagedFiles.length > 0
              ? `${context.stagedFiles.length} file(s) staged. ${context.unstagedFiles.length} unstaged file(s) remaining.`
              : `${context.unstagedFiles.length} unstaged file(s). What would you like to do?`,
          options: [
            ...(context.stagedFiles.length > 0
              ? [{ value: "proceed", label: "Proceed with staged files" }]
              : []),
            {
              value: "stage_all",
              label:
                context.stagedFiles.length > 0 ? "Stage all remaining files" : "Stage all files",
            },
            { value: "select_files", label: "Select files to stage" },
            { value: "cancel", label: "Cancel" },
          ],
        }),
        onDone: [
          {
            guard: ({ event }) => event.output === "proceed",
            target: "showResult",
          },
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

    // ── Stage all files (except excluded patterns) ───────────────────
    stageAll: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "stageAllExceptActor",
        input: ({ context }) => ({ exclude: context.exclude }),
        onDone: "refreshStaged",
        onError: {
          target: "aborted",
        },
      },
    },

    // ── Multi-select files to stage ──────────────────────────────────
    selectFiles: {
      // @ts-expect-error — XState v5 invoke type inference
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
              // @ts-expect-error — XState v5 invoke type inference
              Array.isArray(event.output) && event.output.length === 0,
            // ST13: 0 selected files is intentional when pre-staged files exist —
            // the user chose "select files" but decided not to add more, so we
            // proceed with whatever is already staged rather than aborting.
            // Note: if stagedFiles is empty, the consumer (cli.machine) handles
            // this via its hasNoStagedFiles guard → warnCleanTree transition.
            target: "showResult",
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

    // ── Stage the selected files ─────────────────────────────────────
    stageSelected: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "stageFilesActor",
        input: ({ event }) => ({
          files: (event as { output?: string[] }).output ?? [],
        }),
        onDone: "refreshStaged",
        onError: {
          target: "aborted",
        },
      },
    },

    // ── Refresh staged file list after staging ───────────────────────
    refreshStaged: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "getStagedFilesActor",
        onDone: {
          target: "showResult",
          actions: "assignStagedFiles",
        },
        onError: {
          target: "aborted",
        },
      },
    },

    // ── Display final staged file list ───────────────────────────────
    showResult: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "displayStagedResultActor",
        // Pass context so the actor knows which files were staged in this session.
        // The actor still calls getStagedFilesWithStatus() for accurate statuses,
        // but filters to only the files in context.stagedFiles.
        input: ({ context }) => ({ stagedFiles: context.stagedFiles }),
        onDone: "done",
        onError: "done", // non-fatal
      },
    },

    // ── Terminal states ──────────────────────────────────────────────
    aborted: {
      type: "final",
      entry: "markAborted",
    },

    done: {
      type: "final",
    },
  },
});
