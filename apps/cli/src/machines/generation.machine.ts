import { setup, assign, not, type ActorLogicFrom } from "xstate";
import {
  getBranchNameActor as defaultGetBranchNameActor,
  setBranchNameActor as defaultSetBranchNameActor,
  gatherContextActor as defaultGatherContextActor,
  commitActor as defaultCommitActor,
} from "./actors/git.actors.ts";
import { invokeAIActor as defaultInvokeAIActor } from "./actors/ai.actors.ts";
import {
  selectActor as defaultSelectActor,
  textActor as defaultTextActor,
} from "./actors/clack.actors.ts";
import {
  displayCommitResultActor as defaultDisplayCommitResultActor,
  displayValidationWarningsActor as defaultDisplayValidationWarningsActor,
  displayCommitMessageActor as defaultDisplayCommitMessageActor,
  displayDryRunActor as defaultDisplayDryRunActor,
  displayAIErrorActor as defaultDisplayAIErrorActor,
} from "./actors/display.actors.ts";
import { editorActor as defaultEditorActor } from "./actors/editor.actors.ts";
import {
  validateCommitMessage,
  buildRetryContext,
  type ValidationResult,
} from "../lib/validation.ts";
import { buildSystemPrompt, buildUserPrompt } from "../prompt.ts";
import { extractErrorMessage, NoEditorError, EmptyEditError } from "../lib/errors.ts";
import type { CommitResult } from "../lib/git.ts";
import type { ProviderAdapter } from "../providers/types.ts";
import type { PromptCustomization } from "../config.ts";

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
  promptCustomization?: PromptCustomization;
  editor?: string;
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
  promptCustomization?: PromptCustomization;
  editor?: string;

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
  systemPrompt: string;
  userPrompt: string;
  committed: boolean;
  aborted: boolean;
  _routeTarget: "retry" | "edit";
  _lastRawError: unknown;
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
    .replace(/^```$/gm, "") // Remove closing fence lines
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
    setBranchNameActor: defaultSetBranchNameActor as ActorLogicFrom<
      typeof defaultSetBranchNameActor
    >,
    gatherContextActor: defaultGatherContextActor as ActorLogicFrom<
      typeof defaultGatherContextActor
    >,
    invokeAIActor: defaultInvokeAIActor as ActorLogicFrom<typeof defaultInvokeAIActor>,
    commitActor: defaultCommitActor as ActorLogicFrom<typeof defaultCommitActor>,
    selectActor: defaultSelectActor as ActorLogicFrom<typeof defaultSelectActor>,
    textActor: defaultTextActor as ActorLogicFrom<typeof defaultTextActor>,
    displayCommitResultActor: defaultDisplayCommitResultActor as ActorLogicFrom<
      typeof defaultDisplayCommitResultActor
    >,
    displayValidationWarningsActor: defaultDisplayValidationWarningsActor as ActorLogicFrom<
      typeof defaultDisplayValidationWarningsActor
    >,
    displayCommitMessageActor: defaultDisplayCommitMessageActor as ActorLogicFrom<
      typeof defaultDisplayCommitMessageActor
    >,
    displayDryRunActor: defaultDisplayDryRunActor as ActorLogicFrom<
      typeof defaultDisplayDryRunActor
    >,
    displayAIErrorActor: defaultDisplayAIErrorActor as ActorLogicFrom<
      typeof defaultDisplayAIErrorActor
    >,
    editorActor: defaultEditorActor as ActorLogicFrom<typeof defaultEditorActor>,
  },
  guards: {
    isBranchNameNull: ({ context }) => context.branchName === null,
    isDangerouslyAutoApprove: ({ context }) => context.options.dangerouslyAutoApprove,
    isDryRun: ({ context }) => context.options.dryRun,
    isAutoCommit: ({ context }) => context.options.commit || context.options.dangerouslyAutoApprove,
    isEmptyMessage: ({ context }) => !context.currentMessage,
    hasCriticalErrors: ({ context }) => {
      if (!context.validationResult) return false;
      return !context.validationResult.valid;
    },
    canAutoRetry: ({ context }) => context.autoRetries < 3,
    isMenuCommit: ({ event }) => (event as { output?: string }).output === "commit",
    isMenuRetry: ({ event }) => (event as { output?: string }).output === "retry",
    isMenuEdit: ({ event }) => (event as { output?: string }).output === "edit",
    isRefinementNonEmpty: ({ event }) => {
      const text = (event as { output?: string }).output ?? "";
      return text.trim().length > 0;
    },
    isNoEditorError: ({ event }) => (event as { error?: unknown }).error instanceof NoEditorError,
    isEmptyEditError: ({ event }) => (event as { error?: unknown }).error instanceof EmptyEditError,
  },
  actions: {
    assignBranchName: assign({
      branchName: ({ event }) => (event as { output?: string | null }).output ?? null,
    }),
    assignDefaultBranch: assign({ branchName: "main" as string | null }),
    assignBranchNameFromPrompt: assign({
      branchName: ({ event }) => (event as { output?: string }).output ?? "main",
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
      validationResult: ({ context }) => validateCommitMessage(context.currentMessage),
    }),
    assignCommitResult: assign({
      commitResult: ({ event }) => (event as { output?: CommitResult }).output ?? null,
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
      _lastRawError: ({ event }) => (event as { error?: unknown }).error,
    }),
    logContextError: assign({
      generationErrors: ({ context, event }) => {
        const error = (event as { error?: unknown }).error;
        return [
          ...context.generationErrors,
          `Context gathering failed: ${extractErrorMessage(error)}`,
        ];
      },
    }),
    assignEditedMessage: assign({
      currentMessage: ({ event }) => (event as { output?: string }).output ?? "",
      editedManually: true,
      autoRetries: 3,
    }),
    buildPrompts: assign({
      systemPrompt: ({ context }) => buildSystemPrompt(context.promptCustomization),
      userPrompt: ({ context }) => {
        let errorContext: string | undefined;
        if (context.generationErrors.length > 0 && context.lastGeneratedMessage) {
          const lastResult = validateCommitMessage(context.lastGeneratedMessage);
          errorContext = buildRetryContext(lastResult.errors, context.lastGeneratedMessage);
        }
        return buildUserPrompt({
          branchName: context.branchName ?? "main",
          hint: context.options.hint,
          recentCommits: context.commits ? context.commits.split("\n").filter(Boolean) : undefined,
          stagedFileList: context.fileList || undefined,
          errors: errorContext,
          refinements:
            context.lastGeneratedMessage && context.userRefinements.length > 0
              ? {
                  lastMessage: context.lastGeneratedMessage,
                  instructions: context.userRefinements,
                }
              : undefined,
          diff: context.diff,
        });
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
    promptCustomization: input.promptCustomization,
    editor: input.editor,
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
    systemPrompt: "",
    userPrompt: "",
    committed: false,
    aborted: false,
    _routeTarget: "retry" as const,
    _lastRawError: undefined as unknown,
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
              target: "initBranch",
              actions: "assignBranchName",
            },
            onError: {
              target: "initBranch",
            },
          },
        },

        // ── IB: Prompt for initial branch name if new repo ─────────
        initBranch: {
          initial: "checkBranch",
          states: {
            checkBranch: {
              always: [
                { guard: not("isBranchNameNull"), target: "done" },
                {
                  guard: "isDangerouslyAutoApprove",
                  target: "setBranch",
                  actions: "assignDefaultBranch",
                },
                { target: "promptBranchName" },
              ],
            },
            promptBranchName: {
              // @ts-expect-error — XState v5 invoke type inference
              invoke: {
                src: "textActor",
                input: {
                  message: "No commits found. Set initial branch name?",
                  initialValue: "main",
                },
                onDone: {
                  target: "setBranch",
                  actions: "assignBranchNameFromPrompt",
                },
                onError: { target: "aborted" },
              },
            },
            setBranch: {
              // @ts-expect-error — XState v5 invoke type inference
              invoke: {
                src: "setBranchNameActor",
                input: ({ context }: { context: GenerationContext }) => ({
                  name: context.branchName!,
                }),
                onDone: "done",
                onError: { target: "aborted" },
              },
            },
            done: { type: "final" as const },
            aborted: { type: "final" as const, entry: "markAborted" },
          },
          onDone: [
            {
              guard: ({ context }: { context: GenerationContext }) => context.aborted,
              target: "fatalError",
            },
            { target: "gatherContext" },
          ],
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

        // ── GN14: Build prompts, then check dry-run ──────────────────
        buildPrompt: {
          entry: "buildPrompts",
          always: [
            {
              guard: "isDryRun",
              target: "displayDryRun",
            },
            {
              target: "invokeAI",
            },
          ],
        },

        // ── GN14: dry-run → display prompts → done ────────────────
        displayDryRun: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "displayDryRunActor",
            input: ({ context }) => ({
              systemPrompt: context.systemPrompt,
              userPrompt: context.userPrompt,
            }),
            onDone: "dryRunDone",
            onError: "dryRunDone", // non-fatal
          },
        },

        dryRunDone: {
          type: "final" as const,
        },

        // ── GN8-GN10: Invoke AI provider ───────────────────────────
        invokeAI: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "invokeAIActor",
            input: ({ context }) => ({
              model: context.model,
              system: context.systemPrompt,
              prompt: context.userPrompt,
              modelName: context.modelName,
              slowThresholdMs: context.slowWarningThresholdMs,
              adapter: context.adapter,
            }),
            onDone: {
              target: "checkEmpty",
              actions: "assignAIResponse",
            },
            onError: {
              // GN8-GN10: AI provider error → display error → fatal
              target: "displayError",
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

        // ── Display AI error before fatal ──────────────────────────
        displayError: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "displayAIErrorActor",
            input: ({ context }) => ({
              error: context._lastRawError,
              adapter: context.adapter,
              model: context.model,
            }),
            onDone: "fatalError",
            onError: "fatalError", // display failure is non-fatal
          },
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
            if (!context.validationResult || context.validationResult.valid) return false;
            return context.autoRetries < 3;
          },
          target: "autoRetry",
        },
        {
          // GN7: Critical errors + retries exhausted → prompt anyway
          guard: "hasCriticalErrors",
          target: "prompt",
        },
        {
          // Edited message → prompt (preserve editedManually + autoRetries)
          guard: ({ context }) => context.editedManually,
          target: "prompt",
        },
        {
          // GN4/GN5: Valid → prompt (reset counters for fresh cycle)
          target: "prompt",
          actions: "resetRetryCounts",
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
      initial: "displayMessage",
      states: {
        // ── Display commit message before menu/auto-commit ─────────
        displayMessage: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "displayCommitMessageActor",
            input: ({ context }) => ({
              message: context.currentMessage,
              hasWarnings: context.validationResult ? !context.validationResult.valid : false,
            }),
            onDone: "displayWarnings",
            onError: "displayWarnings", // non-fatal
          },
        },

        // ── Display validation warnings ────────────────────────────
        displayWarnings: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "displayValidationWarningsActor",
            input: ({ context }) => ({
              validationResult: context.validationResult!,
              autoRetries: context.autoRetries,
              editedManually: context.editedManually,
            }),
            onDone: "checkCommitMode",
            onError: "checkCommitMode", // non-fatal
          },
        },

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
              target: "showCommitResult",
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
                  label:
                    context.validationResult && !context.validationResult.valid
                      ? "Commit (with warnings)"
                      : "Commit",
                },
                { value: "retry", label: "Retry" },
                { value: "edit", label: "Edit" },
                { value: "cancel", label: "Quit" },
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
              target: "showCommitResult",
              actions: "assignCommitResult",
            },
            onError: {
              // GN19: commit error → back to menu
              target: "showMenu",
            },
          },
        },

        // ── Display commit result after successful commit ──────────
        showCommitResult: {
          // @ts-expect-error — XState v5 invoke type inference
          invoke: {
            src: "displayCommitResultActor",
            input: ({ context }) => ({ commitResult: context.commitResult! }),
            onDone: "committed",
            onError: "committed", // display failure is non-fatal
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
          message: "Enter instructions to refine (or leave blank to retry as-is):",
          placeholder: "e.g. 'Make the header shorter' or 'Use fix instead of feat'",
        },
        onDone: [
          {
            guard: "isRefinementNonEmpty",
            target: "generate",
            actions: ["appendRefinement", "resetRetryCounts"],
          },
          {
            // GN25: blank → clear refinements
            target: "generate",
            actions: ["clearRefinements", "resetRetryCounts"],
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
      // @ts-expect-error — XState v5 invoke type inference
      invoke: {
        src: "editorActor",
        input: ({ context }) => ({
          message: context.currentMessage,
          editor: context.editor,
        }),
        onDone: {
          target: "validate",
          actions: "assignEditedMessage",
        },
        onError: [
          {
            guard: "isNoEditorError",
            target: "validate",
          },
          {
            guard: "isEmptyEditError",
            target: "prompt",
          },
          {
            target: "prompt",
            actions: "storeErrorMessage",
          },
        ],
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
