import { setup, assign, type ActorLogicFrom } from "xstate";
import {
  pushActor as defaultPushActor,
  addRemoteAndPushActor as defaultAddRemoteAndPushActor,
  fetchRemoteActor as defaultFetchRemoteActor,
  checkRemoteAheadActor as defaultCheckRemoteAheadActor,
  pullRebaseActor as defaultPullRebaseActor,
} from "./actors/git.actors.ts";
import {
  confirmActor as defaultConfirmActor,
  textActor as defaultTextActor,
} from "./actors/clack.actors.ts";
import { extractErrorMessage, UserCancelledError } from "../lib/errors.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface PushMachineInput {
  push: boolean;
  dangerouslyAutoApprove: boolean;
  isInteractiveMode: boolean;
}

export interface PushMachineContext {
  push: boolean;
  dangerouslyAutoApprove: boolean;
  isInteractiveMode: boolean;
  pushed: boolean;
  errorMessage: string;
  remoteUrl: string;
  remoteAheadCount: number;
  exitCode: 0 | 1;
}

export interface PushMachineOutput {
  pushed: boolean;
  exitCode: 0 | 1;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Detect "no remote" git errors by matching known English error strings.
 * Note: This is locale-dependent and won't match non-English git output.
 * A future improvement could probe `git config branch.<name>.remote` instead.
 */
function isMissingRemoteError(error: unknown): boolean {
  const msg = extractErrorMessage(error);
  return (
    msg.includes("No configured push destination") || msg.includes("no remote repository specified")
  );
}

// ── Machine ──────────────────────────────────────────────────────────

export const pushMachine = setup({
  types: {
    context: {} as PushMachineContext,
    input: {} as PushMachineInput,
    output: {} as PushMachineOutput,
  },
  actors: {
    pushActor: defaultPushActor as ActorLogicFrom<typeof defaultPushActor>,
    addRemoteAndPushActor: defaultAddRemoteAndPushActor as ActorLogicFrom<
      typeof defaultAddRemoteAndPushActor
    >,
    confirmActor: defaultConfirmActor as ActorLogicFrom<typeof defaultConfirmActor>,
    textActor: defaultTextActor as ActorLogicFrom<typeof defaultTextActor>,
    fetchRemoteActor: defaultFetchRemoteActor as ActorLogicFrom<typeof defaultFetchRemoteActor>,
    checkRemoteAheadActor: defaultCheckRemoteAheadActor as ActorLogicFrom<
      typeof defaultCheckRemoteAheadActor
    >,
    pullRebaseActor: defaultPullRebaseActor as ActorLogicFrom<typeof defaultPullRebaseActor>,
  },
  guards: {
    isPushFlagOrAutoApprove: ({ context }) => context.push || context.dangerouslyAutoApprove,
    isInteractiveMode: ({ context }) => context.isInteractiveMode,
    isMissingRemote: ({ event }) => {
      const error = (event as { error?: unknown }).error;
      return isMissingRemoteError(error);
    },
    isUserCancelled: ({ event }) => {
      const error = (event as { error?: unknown }).error;
      return error instanceof UserCancelledError;
    },
    isConfirmed: ({ event }) => (event as { output?: boolean }).output === true,
    isRemoteNotAhead: ({ context }) => context.remoteAheadCount === 0,
  },
  actions: {
    markPushed: assign({ pushed: true }),
    markNotPushed: assign({ pushed: false }),
    storeErrorMessage: assign({
      errorMessage: ({ event }) => {
        const error = (event as { error?: unknown }).error;
        return extractErrorMessage(error);
      },
    }),
    storeRemoteUrl: assign({
      remoteUrl: ({ event }) => {
        return (event as { output?: string }).output ?? "";
      },
    }),
    storeRemoteAheadCount: assign({
      remoteAheadCount: ({ event }) => {
        return (event as { output?: number }).output ?? 0;
      },
    }),
    storeRemoteAheadError: assign({
      errorMessage: ({ context }) =>
        `Remote is ${context.remoteAheadCount} commit(s) ahead. Pull and rebase before pushing.`,
    }),
    markExitError: assign({ exitCode: 1 as const }),
  },
}).createMachine({
  id: "push",
  initial: "checkFlags",
  context: ({ input }) => ({
    push: input.push,
    dangerouslyAutoApprove: input.dangerouslyAutoApprove,
    isInteractiveMode: input.isInteractiveMode,
    pushed: false,
    errorMessage: "",
    remoteUrl: "",
    remoteAheadCount: 0,
    exitCode: 0 as const,
  }),
  output: ({ context }) => ({
    pushed: context.pushed,
    exitCode: context.exitCode,
  }),
  states: {
    // ── Entry: check flags to determine path ─────────────────────────
    checkFlags: {
      always: [
        {
          guard: "isPushFlagOrAutoApprove",
          target: "fetchRemote",
        },
        {
          guard: "isInteractiveMode",
          target: "promptPush",
        },
        {
          target: "done",
        },
      ],
    },

    // ── PU9: interactive → ask user if they want to push ─────────────
    promptPush: {
      invoke: {
        src: "confirmActor",
        // @ts-expect-error — XState v5 invoke type inference
        input: { message: "Push to remote?" },
        onDone: [
          {
            guard: "isConfirmed",
            target: "fetchRemote",
          },
          {
            target: "done",
          },
        ],
        onError: {
          // PU10: user cancel at push prompt
          target: "done",
        },
      },
    },

    // ── PU12/PU18: fetch remote to check for upstream changes ────────
    fetchRemote: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "fetchRemoteActor",
        onDone: {
          target: "checkRemoteAhead",
        },
        onError: {
          // PU18: fetch fails (no remote/no upstream/network) → skip check
          target: "pushing",
        },
      },
    },

    // ── PU12/PU13/PU17: check if remote has new commits ─────────────
    checkRemoteAhead: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "checkRemoteAheadActor",
        onDone: {
          target: "evaluateRemoteAhead",
          actions: "storeRemoteAheadCount",
        },
        onError: {
          // Failed to check → skip, proceed to push
          target: "pushing",
        },
      },
    },

    // ── Evaluate remote ahead count ──────────────────────────────────
    evaluateRemoteAhead: {
      always: [
        {
          guard: "isRemoteNotAhead",
          // PU12: not ahead → push
          target: "pushing",
        },
        {
          guard: "isInteractiveMode",
          // PU13: ahead + interactive → warn
          target: "warnRemoteAhead",
        },
        {
          // PU17: ahead + non-interactive → fail
          target: "done",
          actions: ["storeRemoteAheadError", "markExitError"],
        },
      ],
    },

    // ── PU13/PU16: warn user remote is ahead, offer pull rebase ─────
    warnRemoteAhead: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "confirmActor",
        input: ({ context }) => ({
          message: `Remote is ${context.remoteAheadCount} commit(s) ahead. Pull and rebase before pushing?`,
        }),
        onDone: [
          {
            guard: "isConfirmed",
            target: "pullRebase",
          },
          {
            // PU16: user declines
            target: "done",
          },
        ],
        onError: {
          // User cancelled
          target: "done",
        },
      },
    },

    // ── PU14/PU15: pull with rebase ─────────────────────────────────
    pullRebase: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "pullRebaseActor",
        onDone: {
          // PU14: rebase succeeded → push
          target: "pushing",
        },
        onError: {
          // PU15: rebase failed (conflicts, etc.)
          target: "done",
          actions: ["storeErrorMessage", "markExitError"],
        },
      },
    },

    // ── PU1: attempt git push ────────────────────────────────────────
    pushing: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "pushActor",
        onDone: {
          target: "done",
          actions: "markPushed",
        },
        onError: [
          {
            guard: "isMissingRemote",
            target: "pushFailedNoRemote",
            actions: "storeErrorMessage",
          },
          {
            // PU8: other push error
            target: "done",
            actions: "storeErrorMessage",
          },
        ],
      },
    },

    // ── PU2/PU3: no remote → branch on interactive ───────────────────
    pushFailedNoRemote: {
      always: [
        {
          guard: "isInteractiveMode",
          target: "askAddRemote",
        },
        {
          // PU2: non-interactive → skip with log
          target: "done",
        },
      ],
    },

    // ── PU3: ask user if they want to add a remote ───────────────────
    askAddRemote: {
      invoke: {
        src: "confirmActor",
        // @ts-expect-error — XState v5 invoke type inference
        input: { message: "No remote configured. Add one now?" },
        onDone: [
          {
            guard: "isConfirmed",
            target: "enterRemoteUrl",
          },
          {
            // PU7: user declines
            target: "done",
          },
        ],
        onError: {
          // PU7: user cancel
          target: "done",
        },
      },
    },

    // ── PU4/PU6: prompt for remote URL ───────────────────────────────
    enterRemoteUrl: {
      invoke: {
        src: "textActor",
        input: {
          // @ts-expect-error — XState v5 invoke type inference
          message: "Remote URL:",
          placeholder: "git@github.com:user/repo.git",
          validate: (value: string) => {
            if (!value.trim()) return "Remote URL is required";
            return undefined;
          },
        },
        onDone: {
          target: "addRemoteAndPush",
          actions: "storeRemoteUrl",
        },
        onError: {
          // PU6: user cancel
          target: "done",
        },
      },
    },

    // ── PU4/PU5: add remote and push ─────────────────────────────────
    addRemoteAndPush: {
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "addRemoteAndPushActor",
        input: ({ context }) => ({ url: context.remoteUrl }),
        onDone: {
          target: "done",
          actions: "markPushed",
        },
        onError: {
          // PU5: remote add/push failed
          target: "done",
          actions: "storeErrorMessage",
        },
      },
    },

    // ── Terminal state ───────────────────────────────────────────────
    done: {
      type: "final",
    },
  },
});
