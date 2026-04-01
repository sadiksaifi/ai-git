import { fromPromise } from "xstate";
import { note } from "@clack/prompts";
import pc from "picocolors";
import { getStagedFilesWithStatus, getUnstagedFilesWithStatus, type CommitResult } from "../../lib/git.ts";
import { displayFileList } from "../../lib/display.ts";

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
