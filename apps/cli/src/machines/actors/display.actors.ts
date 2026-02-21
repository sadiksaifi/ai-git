import { fromPromise } from "xstate";
import { getStagedFilesWithStatus, getUnstagedFilesWithStatus } from "../../lib/git.ts";
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
    const relevant = input.stagedFiles.length > 0
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

export function createDisplayFileSummaryActor(
  resolver?: () => Promise<void>,
) {
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
