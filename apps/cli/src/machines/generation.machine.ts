import { setup, assign, type ActorLogicFrom } from "xstate";
import {
  getBranchNameActor as defaultGetBranchNameActor,
  gatherContextActor as defaultGatherContextActor,
  commitActor as defaultCommitActor,
} from "./actors/git.actors.ts";
import { invokeAIActor as defaultInvokeAIActor } from "./actors/ai.actors.ts";
import {
  selectActor as defaultSelectActor,
  textActor as defaultTextActor,
} from "./actors/clack.actors.ts";
import {
  validateCommitMessage,
  buildRetryContext,
  type ValidationResult,
} from "../lib/validation.ts";
import { buildSystemPrompt, buildUserPrompt } from "../prompt.ts";
import { extractErrorMessage } from "../lib/errors.ts";
import type { CommitResult } from "../lib/git.ts";
import type { ProviderAdapter } from "../providers/types.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface GenerationInput {
  model: string;
  modelName: string;
  options: {
    commit: boolean;
    dangerouslyAutoApprove: boolean;
    dryRun: boolean;
    hint?: string;
  };
  slowWarningThresholdMs: number;
  adapter?: ProviderAdapter;
}

export interface GenerationContext {
  // From input
  model: string;
  modelName: string;
  options: {
    commit: boolean;
    dangerouslyAutoApprove: boolean;
    dryRun: boolean;
    hint?: string;
  };
  slowWarningThresholdMs: number;
  adapter?: ProviderAdapter;

  // State
  branchName: string | null;
  diff: string;
  commits: string;
  fileList: string;
  currentMessage: string;
  lastGeneratedMessage: string;
  autoRetries: number;
  editedManually: boolean;
  generationErrors: string[];
  userRefinements: string[];
  validationResult: ValidationResult | null;
  commitResult: CommitResult | null;
  committed: boolean;
  aborted: boolean;
  _routeTarget: "retry" | "edit";
}

export interface GenerationOutput {
  message: string;
  committed: boolean;
  aborted: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Clean markdown code blocks and stray backticks from AI response.
 */
function cleanAIResponse(raw: string): string {
  return raw
    .replace(/^```\w*$/gm, "") // Remove opening fence lines (```lang)
    .replace(/^```$/gm, "")     // Remove closing fence lines
    .trim();
}

// ── Machine ──────────────────────────────────────────────────────────

export const generationMachine = setup({
  types: {
    context: {} as GenerationContext,
    input: {} as GenerationInput,
    output: {} as GenerationOutput,
  },
  actors: {
    getBranchNameActor: defaultGetBranchNameActor as ActorLogicFrom<
      typeof defaultGetBranchNameActor
    >,
    gatherContextActor: defaultGatherContextActor as ActorLogicFrom<
      typeof defaultGatherContextActor
    >,
    invokeAIActor: defaultInvokeAIActor as ActorLogicFrom<
      typeof defaultInvokeAIActor
    >,
    commitActor: defaultCommitActor as ActorLogicFrom<
      typeof defaultCommitActor
    >,
    selectActor: defaultSelectActor as ActorLogicFrom<
      typeof defaultSelectActor
    >,
    textActor: defaultTextActor as ActorLogicFrom<typeof defaultTextActor>,
  },
  guards: {
    isDryRun: ({ context }) => context.options.dryRun,
    isAutoCommit: ({ context }) =>
      context.options.commit || context.options.dangerouslyAutoApprove,
    isEmptyMessage: ({ context }) => !context.currentMessage,
    hasCriticalErrors: ({ context }) => {
      if (!context.validationResult) return false;
      return !context.validationResult.valid;
    },
    canAutoRetry: ({ context }) => context.autoRetries < 3,
    isMenuCommit: ({ event }) =>
      (event as { output?: string }).output === "commit",
    isMenuRetry: ({ event }) =>
      (event as { output?: string }).output === "retry",
    isMenuEdit: ({ event }) =>
      (event as { output?: string }).output === "edit",
    isRefinementNonEmpty: ({ event }) => {
      const text = (event as { output?: string }).output ?? "";
      return text.trim().length > 0;
    },
  },
  actions: {
    assignBranchName: assign({
      branchName: ({ event }) =>
        (event as { output?: string | null }).output ?? null,
    }),
    assignGatheredContext: assign({
      diff: ({ event }) => {
        const out = (event as { output?: { diff: string } }).output;
        return out?.diff ?? "";
      },
      commits: ({ event }) => {
        const out = (event as { output?: { commits: string } }).output;
        return out?.commits ?? "";
      },
      fileList: ({ event }) => {
        const out = (event as { output?: { fileList: string } }).output;
        return out?.fileList ?? "";
      },
    }),
    assignAIResponse: assign({
      currentMessage: ({ event }) => {
        const raw = (event as { output?: string }).output ?? "";
        return cleanAIResponse(raw);
      },
    }),
    assignValidationResult: assign({
      validationResult: ({ context }) =>
        validateCommitMessage(context.currentMessage),
    }),
    assignCommitResult: assign({
      commitResult: ({ event }) =>
        (event as { output?: CommitResult }).output ?? null,
      committed: true,
    }),
    markAborted: assign({ aborted: true }),
    markCommitted: assign({ committed: true }),
    incrementAutoRetries: assign({
      autoRetries: ({ context }) => context.autoRetries + 1,
      lastGeneratedMessage: ({ context }) => context.currentMessage,
      generationErrors: ({ context }) => {
        if (!context.validationResult) return context.generationErrors;
        return context.validationResult.errors
          .filter((e) => e.severity === "critical")
          .map((e) => e.message);
      },
    }),
    resetRetryCounts: assign({
      autoRetries: 0,
      editedManually: false,
      generationErrors: [] as string[],
    }),
    appendRefinement: assign({
      userRefinements: ({ context, event }) => {
        const text = ((event as { output?: string }).output ?? "").trim();
        return [...context.userRefinements, text];
      },
      lastGeneratedMessage: ({ context }) => context.currentMessage,
    }),
    clearRefinements: assign({
      userRefinements: [] as string[],
      lastGeneratedMessage: ({ context }) => context.currentMessage,
    }),
    setRouteToRetry: assign({ _routeTarget: "retry" as const }),
    setRouteToEdit: assign({ _routeTarget: "edit" as const }),
    storeErrorMessage: assign({
      generationErrors: ({ context, event }) => {
        const error = (event as { error?: unknown }).error;
        return [...context.generationErrors, extractErrorMessage(error)];
      },
    }),
    logContextError: assign({
      generationErrors: ({ context, event }) => {
        const error = (event as { error?: unknown }).error;
        return [...context.generationErrors, `Context gathering failed: ${extractErrorMessage(error)}`];
      },
    }),
  },
}).createMachine({
  id: "generation",
  initial: "generate",
  context: ({ input }) => ({
    model: input.model,
    modelName: input.modelName,
    options: input.options,
    slowWarningThresholdMs: input.slowWarningThresholdMs,
    adapter: input.adapter,
    branchName: null,
    diff: "",
    commits: "",
    fileList: "",
    currentMessage: "",
    lastGeneratedMessage: "",
    autoRetries: 0,
    editedManually: false,
    generationErrors: [],
    userRefinements: [],
    validationResult: null,
    commitResult: null,
    committed: false,
    aborted: false,
    _routeTarget: "retry" as const,
  }),
  output: ({ context }) => ({
    message: context.currentMessage,
    committed: context.committed,
    aborted: context.aborted,
  }),
  states: {
    // ══════════════════════════════════════════════════════════════════
    // ── GENERATE (compound state) ─────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    generate: {
      initial: "fetchContext",
      states: {
        // ── GN1/GN2: Fetch branch name ─────────────────────────────
        fetchContext: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "getBranchNameActor",
            onDone: {
              target: "gatherContext",
              actions: "assignBranchName",
            },
            onError: {
              target: "gatherContext",
            },
          },
        },

        // ── Gather diff, commits, file list ────────────────────────
        gatherContext: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "gatherContextActor",
            onDone: {
              target: "buildPrompt",
              actions: "assignGatheredContext",
            },
            onError: {
              target: "fatalError",
              actions: "logContextError",
            },
          },
        },

        // ── GN14: Check dry-run before invoking AI ─────────────────
        buildPrompt: {
          always: [
            {
              guard: "isDryRun",
              target: "dryRunDone",
            },
            {
              target: "invokeAI",
            },
          ],
        },

        // ── GN14: dry-run → done without AI call ───────────────────
        dryRunDone: {
          type: "final" as const,
        },

        // ── GN8-GN10: Invoke AI provider ───────────────────────────
        invokeAI: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "invokeAIActor",
            input: ({ context }) => {
              // Build error context if retrying
              let errorContext: string | undefined;
              if (
                context.generationErrors.length > 0 &&
                context.lastGeneratedMessage
              ) {
                const lastResult = validateCommitMessage(
                  context.lastGeneratedMessage,
                );
                errorContext = buildRetryContext(
                  lastResult.errors,
                  context.lastGeneratedMessage,
                );
              }

              const userPrompt = buildUserPrompt({
                branchName: context.branchName ?? "main",
                hint: context.options.hint,
                recentCommits: context.commits
                  ? context.commits.split("\n").filter(Boolean)
                  : undefined,
                stagedFileList: context.fileList || undefined,
                errors: errorContext,
                refinements:
                  context.lastGeneratedMessage &&
                  context.userRefinements.length > 0
                    ? {
                        lastMessage: context.lastGeneratedMessage,
                        instructions: context.userRefinements,
                      }
                    : undefined,
                diff: context.diff,
              });

              return {
                model: context.model,
                system: buildSystemPrompt(),
                prompt: userPrompt,
                modelName: context.modelName,
                slowThresholdMs: context.slowWarningThresholdMs,
                adapter: context.adapter,
              };
            },
            onDone: {
              target: "checkEmpty",
              actions: "assignAIResponse",
            },
            onError: {
              // GN8-GN10: AI provider error → fatal
              target: "fatalError",
              actions: "storeErrorMessage",
            },
          },
        },

        // ── GN11: Check for empty response ─────────────────────────
        checkEmpty: {
          always: [
            {
              guard: "isEmptyMessage",
              target: "fatalError",
            },
            {
              target: "toValidate",
            },
          ],
        },

        // ── Fatal error → done(aborted) — BUG #3 FIX ──────────────
        fatalError: {
          type: "final" as const,
          entry: "markAborted",
        },

        // ── Transition out to validate ─────────────────────────────
        toValidate: {
          type: "final" as const,
        },
      },
      onDone: [
        {
          guard: ({ context }) => context.aborted,
          target: "done",
        },
        {
          guard: "isDryRun",
          target: "done",
        },
        {
          target: "validate",
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // ── VALIDATE ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    validate: {
      entry: "assignValidationResult",
      always: [
        {
          // GN6: Critical errors + can auto-retry
          guard: ({ context }) => {
            if (
              !context.validationResult ||
              context.validationResult.valid
            )
              return false;
            return context.autoRetries < 3;
          },
          target: "autoRetry",
        },
        {
          // GN7: Critical errors + retries exhausted → prompt anyway
          // GN4/GN5: Valid → prompt
          target: "prompt",
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // ── AUTO_RETRY ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    autoRetry: {
      entry: "incrementAutoRetries",
      always: {
        target: "generate",
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── PROMPT (compound state) ───────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    prompt: {
      initial: "checkCommitMode",
      states: {
        // ── GN15-GN17: Check if auto-commit ────────────────────────
        checkCommitMode: {
          always: [
            {
              guard: "isAutoCommit",
              target: "autoCommit",
            },
            {
              target: "showMenu",
            },
          ],
        },

        // ── GN15: Auto-commit (--commit or --dangerouslyAutoApprove)
        autoCommit: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "commitActor",
            input: ({ context }) => ({ message: context.currentMessage }),
            onDone: {
              target: "committed",
              actions: "assignCommitResult",
            },
            onError: {
              // GN17: commit failed
              target: "commitError",
            },
          },
        },

        // ── GN18-GN23: Interactive menu ────────────────────────────
        showMenu: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "selectActor",
            input: ({ context }) => ({
              message: "Action",
              options: [
                {
                  value: "commit",
                  label: context.validationResult && !context.validationResult.valid
                    ? "Commit (with warnings)"
                    : "Commit",
                },
                { value: "retry", label: "Retry" },
                { value: "edit", label: "Edit" },
                { value: "cancel", label: "Cancel" },
              ],
            }),
            onDone: [
              {
                guard: "isMenuCommit",
                target: "tryCommit",
              },
              {
                guard: "isMenuRetry",
                target: "toRetry",
              },
              {
                guard: "isMenuEdit",
                target: "toEdit",
              },
              {
                // GN22: Cancel
                target: "cancelled",
              },
            ],
            onError: {
              // GN23: Ctrl+C
              target: "cancelled",
            },
          },
        },

        // ── GN18: Try commit from menu ─────────────────────────────
        tryCommit: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "commitActor",
            input: ({ context }) => ({ message: context.currentMessage }),
            onDone: {
              target: "committed",
              actions: "assignCommitResult",
            },
            onError: {
              // GN19: commit error → back to menu
              target: "showMenu",
            },
          },
        },

        // ── Terminal sub-states ─────────────────────────────────────
        committed: {
          type: "final" as const,
        },

        commitError: {
          type: "final" as const,
          entry: "markAborted",
        },

        cancelled: {
          type: "final" as const,
          entry: "markAborted",
        },

        toRetry: {
          type: "final" as const,
          entry: "setRouteToRetry",
        },

        toEdit: {
          type: "final" as const,
          entry: "setRouteToEdit",
        },
      },
      onDone: [
        {
          guard: ({ context }) => context.committed,
          target: "done",
        },
        {
          guard: ({ context }) => context.aborted,
          target: "done",
        },
        {
          // Check which sub-final we came from: toRetry or toEdit
          // We use a dedicated routing state to handle this
          target: "retryOrEdit",
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // ── RETRY_OR_EDIT routing ─────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    retryOrEdit: {
      always: [
        {
          guard: ({ context }) => context._routeTarget === "edit",
          target: "edit",
        },
        {
          target: "retry",
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // ── RETRY ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    retry: {
      invoke: {
        src: "textActor",
        input: {
          // @ts-expect-error — XState v5 invoke type inference
          message:
            "Enter instructions to refine (or leave blank to retry as-is):",
          placeholder:
            "e.g. 'Make the header shorter' or 'Use fix instead of feat'",
        },
        onDone: [
          {
            guard: "isRefinementNonEmpty",
            target: "generate",
            actions: "appendRefinement",
          },
          {
            // GN25: blank → clear refinements
            target: "generate",
            actions: "clearRefinements",
          },
        ],
        onError: {
          // GN26: cancel at retry prompt → abort
          target: "done",
          actions: "markAborted",
        },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── EDIT ──────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    edit: {
      // Simplified: for now redirect to validate with current message
      always: {
        target: "validate",
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // ── DONE (final) ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    done: {
      type: "final",
    },
  },
});
