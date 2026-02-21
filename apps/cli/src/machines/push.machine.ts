// @ts-nocheck — XState v5 invoke src/input type inference is overly strict
import { setup, assign, type ActorLogicFrom } from "xstate";
import {
  pushActor as defaultPushActor,
  addRemoteAndPushActor as defaultAddRemoteAndPushActor,
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
}

export interface PushMachineOutput {
  pushed: boolean;
  exitCode: 0;
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
    msg.includes("No configured push destination") ||
    msg.includes("no remote repository specified")
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
    confirmActor: defaultConfirmActor as ActorLogicFrom<
      typeof defaultConfirmActor
    >,
    textActor: defaultTextActor as ActorLogicFrom<typeof defaultTextActor>,
  },
  guards: {
    isPushFlagOrAutoApprove: ({ context }) =>
      context.push || context.dangerouslyAutoApprove,
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
  }),
  output: ({ context }) => ({
    pushed: context.pushed,
    exitCode: 0 as const,
  }),
  states: {
    // ── Entry: check flags to determine path ─────────────────────────
    checkFlags: {
      always: [
        {
          guard: "isPushFlagOrAutoApprove",
          target: "pushing",
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
        input: { message: "Push to remote?" },
        onDone: [
          {
            guard: "isConfirmed",
            target: "pushing",
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

    // ── PU1: attempt git push ────────────────────────────────────────
    pushing: {
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
