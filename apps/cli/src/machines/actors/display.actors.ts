import { fromPromise } from "xstate";
import { getStagedFilesWithStatus, getUnstagedFilesWithStatus } from "../../lib/git.ts";
import { displayFileList } from "../../lib/display.ts";

// ── Display staged result (after staging resolves) ────────────────────

export function createDisplayStagedResultActor(
  resolver?: () => Promise<void>,
) {
  const defaultResolver = async () => {
    const staged = await getStagedFilesWithStatus();
    displayFileList("Staged files", staged);
  };
  return fromPromise(async () => (resolver ?? defaultResolver)());
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
