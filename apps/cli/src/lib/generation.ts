import { spinner, select, text, isCancel, note, log } from "@clack/prompts";
import pc from "picocolors";
import { buildSystemPrompt, buildUserPrompt } from "../prompt.ts";
import { DEFAULT_SLOW_WARNING_THRESHOLD_MS, type PromptCustomization } from "../config.ts";
import type { ProviderAdapter } from "../providers/types.ts";
import {
  getStagedDiff,
  getBranchName,
  setBranchName,
  commit,
  getRecentCommits,
  getStagedFileList,
  type CommitResult,
} from "./git.ts";
import { validateCommitMessage, buildRetryContext, type ValidationError } from "./validation.ts";
import { displayCommitMessage } from "./display.ts";
import { wrapText } from "./utils.ts";
import { TEMP_MSG_FILE } from "./paths.ts";
import { CLIError } from "./errors.ts";

// ==============================================================================
// AI GENERATION ENGINE
// ==============================================================================

/**
 * Format and display the commit result in a styled box.
 */
function showCommitResult(result: CommitResult): void {
  const lines: string[] = [];

  // Header: [branch hash] subject
  const rootLabel = result.isRoot ? " (root-commit)" : "";
  lines.push(pc.dim(`[${result.branch}${rootLabel} ${result.hash}]`) + ` ${result.subject}`);
  lines.push("");

  // Stats
  const stats: string[] = [];
  if (result.filesChanged > 0) {
    stats.push(`${result.filesChanged} file${result.filesChanged === 1 ? "" : "s"} changed`);
  }
  if (result.insertions > 0) {
    stats.push(pc.green(`${result.insertions} insertion${result.insertions === 1 ? "" : "s"}(+)`));
  }
  if (result.deletions > 0) {
    stats.push(pc.red(`${result.deletions} deletion${result.deletions === 1 ? "" : "s"}(-)`));
  }
  if (stats.length > 0) {
    lines.push(stats.join(", "));
  }

  // File list (if any new/deleted files)
  if (result.files.length > 0) {
    lines.push("");
    for (const file of result.files) {
      const statusColor = file.status === "A" ? pc.green : file.status === "D" ? pc.red : pc.yellow;
      lines.push(`${statusColor(file.status)} ${file.path}`);
    }
  }

  note(lines.join("\n"), "Commit Created");
}

export interface GenerationOptions {
  commit: boolean;
  dangerouslyAutoApprove: boolean;
  hint?: string;
  dryRun: boolean;
}

export interface GenerationContext {
  adapter: ProviderAdapter;
  model: string;
  modelName: string;
  options: GenerationOptions;
  /** Optional prompt customization from user config */
  promptCustomization?: PromptCustomization;
  /** Preferred editor from config */
  editor?: string;
  /** Milliseconds before showing slow-generation warning. Default: 5 000. 0 = disabled. */
  slowWarningThresholdMs?: number;
}

export interface GenerationResult {
  message: string;
  committed: boolean;
  aborted: boolean;
}

/** State machine states for the generation loop */
export type GenerationState =
  | { type: "generate" }
  | { type: "validate"; message: string }
  | { type: "auto_retry"; message: string; errors: string[] }
  | { type: "prompt"; message: string; validationFailed: boolean; warnings: ValidationError[] }
  | { type: "retry"; message: string }
  | { type: "edit"; message: string }
  | { type: "done"; result: GenerationResult };

/**
 * Create a timer that fires a warning callback after `thresholdMs`.
 * Returns a cleanup function that cancels the timer.
 * If thresholdMs <= 0, no timer is created and cleanup is a no-op.
 */
export function createSlowWarningTimer(thresholdMs: number, onSlow: () => void): () => void {
  if (thresholdMs <= 0) return () => {};
  const timer = setTimeout(onSlow, thresholdMs);
  return () => clearTimeout(timer);
}

/**
 * Resolve the slow-warning threshold from a GenerationContext,
 * falling back to DEFAULT_SLOW_WARNING_THRESHOLD_MS.
 */
export function resolveSlowWarningThreshold(ctx: GenerationContext): number {
  return ctx.slowWarningThresholdMs ?? DEFAULT_SLOW_WARNING_THRESHOLD_MS;
}

/** Log a commit error with appropriate formatting based on error type. */
function logCommitError(err: unknown): void {
  if (err && typeof err === "object" && "stderr" in err) {
    console.error(pc.dim(String((err as { stderr: unknown }).stderr).trim()));
  } else if (err instanceof Error) {
    console.error(pc.dim(err.message));
  } else {
    console.error(pc.dim(String(err)));
  }
}

/**
 * Run the AI generation loop.
 * Generates commit messages, validates them, and handles user interactions.
 */
export async function runGenerationLoop(ctx: GenerationContext): Promise<GenerationResult> {
  const { adapter, model, modelName, options, promptCustomization } = ctx;

  // Build the system prompt with any user customizations
  const systemPromptStr = buildSystemPrompt(promptCustomization);

  // Mutable context for the state machine
  let autoRetries = 0;
  let editedManually = false;
  let generationErrors: string[] = [];
  let userRefinements: string[] = [];
  let lastGeneratedMessage: string = "";

  // Get branch name ONCE before the loop (fixes Issue #6)
  let branchName = await getBranchName();

  if (!branchName) {
    // New repo with no commits
    if (options.dangerouslyAutoApprove) {
      branchName = "main";
    } else {
      const newBranch = await text({
        message: "No commits found. Set initial branch name?",
        placeholder: "main",
        initialValue: "main",
        validate: (value) => {
          if (!value) return "Please enter a branch name.";
        },
      });

      if (isCancel(newBranch)) {
        return { message: "", committed: false, aborted: true };
      }
      branchName = newBranch as string;
    }

    await setBranchName(branchName);
  }

  const slowThresholdMs = resolveSlowWarningThreshold(ctx);

  // --- State machine ---
  let state: GenerationState = { type: "generate" };

  while (state.type !== "done") {
    switch (state.type) {
      // ── GENERATE ──────────────────────────────────────────────
      case "generate": {
        const s = spinner();
        s.start(`Analyzing changes with ${modelName}...`);

        // Gather context
        const [diffOutput, recentCommits, stagedFileList] = await Promise.all([
          getStagedDiff(),
          getRecentCommits(5),
          getStagedFileList(),
        ]);

        // Build error context if retrying
        let errorContext: string | undefined;
        if (generationErrors.length > 0 && lastGeneratedMessage) {
          const lastResult = validateCommitMessage(lastGeneratedMessage);
          errorContext = buildRetryContext(lastResult.errors, lastGeneratedMessage);
        }

        // Build user prompt with all dynamic context
        const userPrompt = buildUserPrompt({
          branchName: branchName!,
          hint: options.hint,
          recentCommits,
          stagedFileList,
          errors: errorContext,
          refinements:
            lastGeneratedMessage && userRefinements.length > 0
              ? { lastMessage: lastGeneratedMessage, instructions: userRefinements }
              : undefined,
          diff: diffOutput,
        });

        // Handle dry run
        if (options.dryRun) {
          s.stop("Dry run complete");

          const width = process.stdout.columns || 80;
          const border = pc.dim("─".repeat(width));

          console.log("");
          console.log(pc.bgCyan(pc.black(" DRY RUN: SYSTEM PROMPT ")));
          console.log(border);
          console.log(wrapText(systemPromptStr, width));
          console.log(border);
          console.log("");
          console.log(pc.bgCyan(pc.black(" DRY RUN: USER PROMPT ")));
          console.log(border);
          console.log(wrapText(userPrompt, width));
          console.log(border);
          console.log("");

          state = { type: "done", result: { message: "", committed: false, aborted: false } };
          break;
        }

        // Call AI
        let rawMsg = "";

        const cancelSlowWarning = createSlowWarningTimer(slowThresholdMs, () => {
          s.message(
            pc.yellow(
              `Still generating with ${modelName}... Speed depends on your selected provider and model.`,
            ),
          );
        });

        try {
          rawMsg = await adapter.invoke({ model, system: systemPromptStr, prompt: userPrompt });
          cancelSlowWarning();
          s.stop("Message generated");
        } catch (e) {
          cancelSlowWarning();
          s.stop("Generation failed");
          console.error("");
          let errorMessage = String(e);
          if (e instanceof Error) {
            errorMessage = e.message;
          }

          // Determine if this is an API provider error
          const isApiMode = adapter.mode === "api";
          const providerName = isApiMode
            ? adapter.providerId.charAt(0).toUpperCase() + adapter.providerId.slice(1)
            : "AI";

          if (errorMessage.includes("Requested entity was not found")) {
            console.error(pc.red(`Error: The model '${model}' was not found.`));
            console.error(
              pc.yellow(
                "This usually means the model ID is incorrect or you don't have access to it.",
              ),
            );
            console.error(pc.dim(`Try running 'ai-git configure' to select a different model.`));
          } else if (isApiMode) {
            console.error(pc.red(`${providerName} API Error:`));
            console.error(pc.yellow(errorMessage));
            console.error("");
            console.error(pc.dim("This error is from the API provider, not ai-git."));
            console.error(pc.dim("You may need to:"));
            console.error(pc.dim("  - Check your API key and account settings"));
            console.error(pc.dim("  - Try a different model (run: ai-git configure)"));
            console.error(pc.dim("  - Check the provider's status page or documentation"));
          } else {
            console.error(pc.red(errorMessage));
          }
          throw new CLIError(errorMessage);
        }

        // Cleanup message
        const cleanMsg = rawMsg
          .replace(/^```.*/gm, "") // Remove code blocks
          .replace(/```$/gm, "")
          .trim();

        if (!cleanMsg) {
          console.error(pc.red("Error: AI returned empty message."));
          throw new CLIError("AI returned empty message.");
        }

        state = { type: "validate", message: cleanMsg };
        break;
      }

      // ── VALIDATE ──────────────────────────────────────────────
      case "validate": {
        const validationResult = validateCommitMessage(state.message);

        if (!validationResult.valid) {
          if (autoRetries < 3) {
            const criticalErrors = validationResult.errors
              .filter((e) => e.severity === "critical")
              .map((e) => e.message);
            state = { type: "auto_retry", message: state.message, errors: criticalErrors };
          } else {
            // Retries exhausted — show failure UI
            log.warn(
              pc.yellow(
                editedManually
                  ? "Validation failed on manually edited message"
                  : "Maximum validation retries reached (3/3)",
              ),
            );
            editedManually = false;
            const allErrors = validationResult.errors;
            for (const err of allErrors) {
              log.warn(pc.yellow(`${err.severity}: ${err.message} — ${err.suggestion}`));
            }
            state = {
              type: "prompt",
              message: state.message,
              validationFailed: true,
              warnings: allErrors,
            };
          }
        } else {
          // Valid — reset counters
          autoRetries = 0;
          editedManually = false;
          generationErrors = [];

          // Show non-critical warnings if any
          const warnings = validationResult.errors.filter(
            (e) => e.severity === "important" || e.severity === "minor",
          );
          if (warnings.length > 0) {
            for (const w of warnings) {
              log.warn(pc.yellow(`${w.severity}: ${w.message} — ${w.suggestion}`));
            }
          }

          state = { type: "prompt", message: state.message, validationFailed: false, warnings };
        }
        break;
      }

      // ── AUTO_RETRY ────────────────────────────────────────────
      case "auto_retry": {
        autoRetries++;
        lastGeneratedMessage = state.message;
        generationErrors = state.errors;
        log.warn(
          pc.yellow(
            `Validation failed: ${state.errors.join("; ")}. Retrying (${autoRetries}/3)...`,
          ),
        );
        state = { type: "generate" };
        break;
      }

      // ── PROMPT ────────────────────────────────────────────────
      case "prompt": {
        const currentMessage: string = state.message;

        // Auto-commit flow (--commit flag)
        if (options.commit) {
          // Always display the generated message before committing
          displayCommitMessage(currentMessage, state.validationFailed);

          if (state.validationFailed) {
            log.warn(pc.yellow("Committing with validation warnings (--commit flag active)."));
          }
          try {
            const result = await commit(currentMessage);
            showCommitResult(result);
            state = {
              type: "done",
              result: { message: currentMessage, committed: true, aborted: false },
            };
          } catch (err) {
            log.error(pc.red("Git commit failed."));
            logCommitError(err);
            state = {
              type: "done",
              result: { message: currentMessage, committed: false, aborted: true },
            };
          }
          break;
        }

        // Interactive flow
        displayCommitMessage(currentMessage, state.validationFailed);

        const commitLabel = state.validationFailed ? "Commit (with warnings)" : "Commit";

        const action = await select({
          message: "Action",
          options: [
            { value: "commit", label: commitLabel },
            { value: "retry", label: "Retry" },
            { value: "edit", label: "Edit" },
            { value: "cancel", label: "Quit" },
          ],
        });

        if (isCancel(action) || action === "cancel") {
          state = { type: "done", result: { message: "", committed: false, aborted: true } };
          break;
        }

        if (action === "commit") {
          try {
            const result = await commit(currentMessage);
            showCommitResult(result);
            state = {
              type: "done",
              result: { message: currentMessage, committed: true, aborted: false },
            };
          } catch (err) {
            log.error(pc.red("Git commit failed."));
            logCommitError(err);
            // Stay in prompt state to let user try again
            break;
          }
          break;
        }

        if (action === "retry") {
          lastGeneratedMessage = currentMessage;
          state = { type: "retry", message: currentMessage };
          break;
        }

        if (action === "edit") {
          lastGeneratedMessage = currentMessage;
          state = { type: "edit", message: currentMessage };
          break;
        }

        break;
      }

      // ── RETRY ─────────────────────────────────────────────────
      case "retry": {
        const instruction = await text({
          message: "Enter instructions to refine (or leave blank to retry as-is):",
          placeholder: "e.g. 'Make the header shorter' or 'Use fix instead of feat'",
        });

        if (isCancel(instruction)) {
          state = { type: "done", result: { message: "", committed: false, aborted: true } };
          break;
        }

        const trimmed = ((instruction as string) ?? "").trim();
        if (trimmed) {
          userRefinements.push(trimmed);
        } else {
          // Blank = fresh retry, clear previous refinements
          userRefinements = [];
        }

        // Reset retry counter for fresh attempts
        autoRetries = 0;
        editedManually = false;
        generationErrors = [];
        state = { type: "generate" };
        break;
      }

      // ── EDIT ──────────────────────────────────────────────────
      case "edit": {
        await Bun.write(TEMP_MSG_FILE, state.message);

        const candidates = [
          ctx.editor,
          process.env.VISUAL,
          process.env.EDITOR,
          ...(process.platform === "win32" ? ["code", "notepad"] : ["nvim", "vim", "nano", "vi"]),
        ].filter((e): e is string => !!e);
        let editor: string | null = null;

        for (const candidate of candidates) {
          if (await Bun.which(candidate)) {
            editor = candidate;
            break;
          }
        }

        if (!editor) {
          console.error(
            pc.red("Error: No suitable editor found. Please set the EDITOR environment variable."),
          );
          state = { type: "validate", message: state.message };
          break;
        }

        // Bun.spawn (not $) so the editor inherits stdin/stdout/stderr for interactive use
        const editProc = Bun.spawn([editor, TEMP_MSG_FILE], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });
        await editProc.exited;

        const trimmedMsg = (await Bun.file(TEMP_MSG_FILE).text()).trim();
        if (trimmedMsg) {
          lastGeneratedMessage = trimmedMsg;
          editedManually = true;
          autoRetries = 3; // prevent auto-retry from discarding a manual edit
          state = { type: "validate", message: trimmedMsg };
        } else {
          state = { type: "done", result: { message: "", committed: false, aborted: true } };
        }
        break;
      }

      default: {
        const _exhaustive: never = state;
        throw new Error(`Unhandled state: ${(_exhaustive as GenerationState).type}`);
      }
    }
  }

  return state.result;
}
