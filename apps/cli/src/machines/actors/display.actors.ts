import { fromPromise } from "xstate";
import { log, note } from "@clack/prompts";
import pc from "picocolors";
import { getStagedFilesWithStatus, getUnstagedFilesWithStatus, type CommitResult } from "../../lib/git.ts";
import { displayFileList } from "../../lib/display.ts";
import type { ValidationResult } from "../../lib/validation.ts";

// ── Display staged result (after staging resolves) ────────────────────

export interface DisplayStagedResultInput {
  stagedFiles: string[];
}

export function createDisplayStagedResultActor(
  resolver?: (input: DisplayStagedResultInput) => Promise<void>,
) {
  const defaultResolver = async (input: DisplayStagedResultInput) => {
    // Re-fetch statuses for accurate display (context only stores paths),
    // then filter to files the machine actually staged this session.
    const allStaged = await getStagedFilesWithStatus();
    const relevant =
      input.stagedFiles.length > 0
        ? allStaged.filter((f) => input.stagedFiles.some((p) => f.path.includes(p)))
        : allStaged;
    displayFileList("Staged files", relevant);
  };
  return fromPromise(async ({ input }: { input: DisplayStagedResultInput }) =>
    (resolver ?? defaultResolver)(input),
  );
}

export const displayStagedResultActor = createDisplayStagedResultActor();

// ── Display file summary (before interactive prompt) ──────────────────

export function createDisplayFileSummaryActor(resolver?: () => Promise<void>) {
  const defaultResolver = async () => {
    const staged = await getStagedFilesWithStatus();
    const unstaged = await getUnstagedFilesWithStatus();
    if (staged.length > 0) {
      displayFileList("Staged files", staged);
    }
    if (unstaged.length > 0) {
      displayFileList("Unstaged files", unstaged);
    }
  };
  return fromPromise(async () => (resolver ?? defaultResolver)());
}

export const displayFileSummaryActor = createDisplayFileSummaryActor();

// ── Display commit result (after successful commit) ─────────────────

export interface DisplayCommitResultInput {
  commitResult: CommitResult;
}

export function createDisplayCommitResultActor(
  resolver?: (input: DisplayCommitResultInput) => Promise<void>,
) {
  const defaultResolver = async (input: DisplayCommitResultInput) => {
    const { commitResult: result } = input;
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

    // File list (if any)
    if (result.files.length > 0) {
      lines.push("");
      for (const file of result.files) {
        const statusColor =
          file.status === "A" ? pc.green : file.status === "D" ? pc.red : pc.yellow;
        lines.push(`${statusColor(file.status)} ${file.path}`);
      }
    }

    note(lines.join("\n"), "Commit Created");
  };
  return fromPromise(async ({ input }: { input: DisplayCommitResultInput }) =>
    (resolver ?? defaultResolver)(input),
  );
}

export const displayCommitResultActor = createDisplayCommitResultActor();

// ── Display validation warnings ─────────────────────────────────────

export interface DisplayValidationWarningsInput {
  validationResult: ValidationResult;
  autoRetries: number;
  editedManually: boolean;
}

export function createDisplayValidationWarningsActor(
  resolver?: (input: DisplayValidationWarningsInput) => Promise<void>,
) {
  const defaultResolver = async (input: DisplayValidationWarningsInput) => {
    const { validationResult, autoRetries, editedManually } = input;
    if (!validationResult) return;

    if (!validationResult.valid) {
      // Retries exhausted — show all errors
      log.warn(
        pc.yellow(
          editedManually
            ? "Validation failed on manually edited message"
            : `Maximum validation retries reached (${autoRetries}/3)`,
        ),
      );
      for (const err of validationResult.errors) {
        log.warn(pc.yellow(`${err.severity}: ${err.message} — ${err.suggestion}`));
      }
    } else {
      // Valid — show non-critical warnings if any
      const warnings = validationResult.errors.filter(
        (e) => e.severity === "important" || e.severity === "minor",
      );
      for (const w of warnings) {
        log.warn(pc.yellow(`${w.severity}: ${w.message} — ${w.suggestion}`));
      }
    }
  };
  return fromPromise(async ({ input }: { input: DisplayValidationWarningsInput }) =>
    (resolver ?? defaultResolver)(input),
  );
}

export const displayValidationWarningsActor = createDisplayValidationWarningsActor();

// ── Display commit message (before menu/auto-commit) ────────────────

export interface DisplayCommitMessageInput {
  message: string;
  hasWarnings: boolean;
}

export function createDisplayCommitMessageActor(
  resolver?: (input: DisplayCommitMessageInput) => Promise<void>,
) {
  const defaultResolver = async (input: DisplayCommitMessageInput) => {
    const { displayCommitMessage } = await import("../../lib/display.ts");
    displayCommitMessage(input.message, input.hasWarnings);
  };
  return fromPromise(async ({ input }: { input: DisplayCommitMessageInput }) =>
    (resolver ?? defaultResolver)(input),
  );
}

export const displayCommitMessageActor = createDisplayCommitMessageActor();

// ── Display dry-run output (system + user prompts) ──────────────────

export interface DisplayDryRunInput {
  systemPrompt: string;
  userPrompt: string;
}

export function createDisplayDryRunActor(
  resolver?: (input: DisplayDryRunInput) => Promise<void>,
) {
  const defaultResolver = async (input: DisplayDryRunInput) => {
    const { wrapText } = await import("../../lib/utils.ts");
    const width = process.stdout.columns || 80;
    const border = pc.dim("─".repeat(width));

    console.log("");
    console.log(pc.bgCyan(pc.black(" DRY RUN: SYSTEM PROMPT ")));
    console.log(border);
    console.log(wrapText(input.systemPrompt, width));
    console.log(border);
    console.log("");
    console.log(pc.bgCyan(pc.black(" DRY RUN: USER PROMPT ")));
    console.log(border);
    console.log(wrapText(input.userPrompt, width));
    console.log(border);
    console.log("");
  };
  return fromPromise(async ({ input }: { input: DisplayDryRunInput }) =>
    (resolver ?? defaultResolver)(input),
  );
}

export const displayDryRunActor = createDisplayDryRunActor();
