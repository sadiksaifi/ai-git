import {
  spinner,
  select,
  text,
  isCancel,
  note,
  log,
} from "@clack/prompts";
import pc from "picocolors";
import { buildSystemPrompt, buildUserPrompt } from "../prompt.ts";
import { DEFAULT_SLOW_WARNING_THRESHOLD_MS, type PromptCustomization } from "../config.ts";
import type { ProviderAdapter } from "../providers/types.ts";
import { getStagedDiff, getBranchName, setBranchName, commit, getRecentCommits, getStagedFileList, type CommitResult } from "./git.ts";
import { validateCommitMessage, buildRetryContext } from "./validation.ts";
import { wrapText } from "./utils.ts";
import { TEMP_MSG_FILE } from "./paths.ts";

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

/**
 * Create a timer that fires a warning callback after `thresholdMs`.
 * Returns a cleanup function that cancels the timer.
 * If thresholdMs <= 0, no timer is created and cleanup is a no-op.
 */
export function createSlowWarningTimer(
  thresholdMs: number,
  onSlow: () => void,
): () => void {
  if (thresholdMs <= 0) return () => {};
  const timer = setTimeout(onSlow, thresholdMs);
  return () => clearTimeout(timer);
}

/**
 * Run the AI generation loop.
 * Generates commit messages, validates them, and handles user interactions.
 */
export async function runGenerationLoop(
  ctx: GenerationContext
): Promise<GenerationResult> {
  const { adapter, model, modelName, options, promptCustomization } = ctx;

  // Build the system prompt with any user customizations
  const systemPromptStr = buildSystemPrompt(promptCustomization);

  let loop = true;
  let autoRetries = 0;
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

  // Flag to skip AI generation (used after manual edit)
  let skipGeneration = false;
  const slowThresholdMs = ctx.slowWarningThresholdMs ?? DEFAULT_SLOW_WARNING_THRESHOLD_MS;

  while (loop) {
    let cleanMsg = lastGeneratedMessage;

    // Only call AI if we need to generate/regenerate
    if (!skipGeneration) {
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
        refinements: lastGeneratedMessage && userRefinements.length > 0
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

        return { message: "", committed: false, aborted: false };
      }

      // Call AI
      let rawMsg = "";

      const cancelSlowWarning = createSlowWarningTimer(slowThresholdMs, () => {
        s.message(
          pc.yellow(`Still generating with ${modelName}... Speed depends on your selected provider and model.`)
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
        const providerName = isApiMode ? adapter.providerId.charAt(0).toUpperCase() + adapter.providerId.slice(1) : "AI";

        if (errorMessage.includes("Requested entity was not found")) {
          console.error(pc.red(`Error: The model '${model}' was not found.`));
          console.error(pc.yellow("This usually means the model ID is incorrect or you don't have access to it."));
          console.error(pc.dim(`Try running 'ai-git --setup' to select a different model.`));
        } else if (isApiMode) {
          console.error(pc.red(`${providerName} API Error:`));
          console.error(pc.yellow(errorMessage));
          console.error("");
          console.error(pc.dim("This error is from the API provider, not ai-git."));
          console.error(pc.dim("You may need to:"));
          console.error(pc.dim("  - Check your API key and account settings"));
          console.error(pc.dim("  - Try a different model (run: ai-git --setup)"));
          console.error(pc.dim("  - Check the provider's status page or documentation"));
        } else {
          console.error(pc.red(errorMessage));
        }
        process.exit(1);
      }

      // Cleanup message
      cleanMsg = rawMsg
        .replace(/^```.*/gm, "") // Remove code blocks
        .replace(/```$/gm, "")
        .trim();

      if (!cleanMsg) {
        console.error(pc.red("Error: AI returned empty message."));
        process.exit(1);
      }

      // Multi-stage validation
      const validationResult = validateCommitMessage(cleanMsg);

      // Handle critical errors (auto-retry)
      if (!validationResult.valid) {
        if (autoRetries < 3) {
          autoRetries++;
          const criticalErrors = validationResult.errors
            .filter((e) => e.severity === "critical")
            .map((e) => e.message);
          lastGeneratedMessage = cleanMsg;
          generationErrors = criticalErrors;
          log.warn(
            pc.yellow(
              `Validation failed: ${criticalErrors.join("; ")}. Retrying (${autoRetries}/3)...`
            )
          );
          continue;
        } else {
          log.warn(
            pc.yellow(
              `Validation issues persist after 3 retries. Showing result with warnings.`
            )
          );
        }
      }

      // Show important/minor warnings
      const warnings = validationResult.errors.filter(
        (e) => e.severity === "important" || e.severity === "minor"
      );
      if (warnings.length > 0) {
        for (const w of warnings) {
          log.warn(pc.yellow(`${w.severity}: ${w.message} — ${w.suggestion}`));
        }
      }

      // Reset on success
      if (validationResult.valid) {
        autoRetries = 0;
        generationErrors = [];
      }

      lastGeneratedMessage = cleanMsg;
    }

    // Reset skip flag for next iteration
    skipGeneration = false;

    // Commit logic
    if (options.commit) {
      try {
        const result = await commit(cleanMsg);
        showCommitResult(result);
        return { message: cleanMsg, committed: true, aborted: false };
      } catch (err) {
        log.error(pc.red("Git commit failed."));
        if (err && typeof err === "object" && "stderr" in err) {
          console.error(pc.dim(String((err as any).stderr).trim()));
        } else if (err instanceof Error) {
          console.error(pc.dim(err.message));
        } else {
          console.error(pc.dim(String(err)));
        }
        return { message: cleanMsg, committed: false, aborted: true };
      }
    }

    // Interactive flow
    note(cleanMsg, "Generated Commit Message");

    const action = await select({
      message: "Action",
      options: [
        { value: "commit", label: "Commit" },
        { value: "edit", label: "Edit" },
        { value: "edit-ai", label: "Refine with AI" },
        { value: "regenerate", label: "Regenerate" },
        { value: "cancel", label: "Cancel" },
      ],
    });

    if (isCancel(action) || action === "cancel") {
      return { message: "", committed: false, aborted: true };
    }

    if (action === "edit-ai") {
      const instruction = await text({
        message: "Enter instructions for AI refinement:",
        placeholder: "e.g. 'Make it more enthusiastic' or 'Fix the typo'",
        validate: (value) => {
          if (!value) return "Please enter an instruction.";
        },
      });

      if (isCancel(instruction)) {
        return { message: "", committed: false, aborted: true };
      }

      userRefinements.push(instruction as string);
      continue;
    }

    if (action === "regenerate") {
      autoRetries = 0;
      generationErrors = [];
      userRefinements = [];
      continue;
    }

    if (action === "commit") {
      try {
        const result = await commit(cleanMsg);
        showCommitResult(result);
        return { message: cleanMsg, committed: true, aborted: false };
      } catch (err) {
        log.error(pc.red("Git commit failed."));
        if (err && typeof err === "object" && "stderr" in err) {
          console.error(pc.dim(String((err as any).stderr).trim()));
        } else if (err instanceof Error) {
          console.error(pc.dim(err.message));
        } else {
          console.error(pc.dim(String(err)));
        }
        continue;
      }
    }

    if (action === "edit") {
      // Edit Flow - opens editor and returns to menu (fixes Issue #5)
      await Bun.write(TEMP_MSG_FILE, cleanMsg);
      
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
        console.error(pc.red("Error: No suitable editor found. Please set the EDITOR environment variable."));
        continue;
      }

      const editProc = Bun.spawn([editor, TEMP_MSG_FILE], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await editProc.exited;

      const finalMsg = await Bun.file(TEMP_MSG_FILE).text();
      if (finalMsg.trim()) {
        // Update the message and show menu again instead of auto-committing
        lastGeneratedMessage = finalMsg.trim();
        skipGeneration = true; // Don't regenerate, just show edited message
        continue;
      } else {
        return { message: "", committed: false, aborted: true };
      }
    }
  }

  return { message: lastGeneratedMessage, committed: false, aborted: false };
}
