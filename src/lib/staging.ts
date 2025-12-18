import {
  select,
  multiselect,
  isCancel,
  note,
  spinner,
} from "@clack/prompts";
import {
  getStagedFiles,
  getUnstagedFiles,
  stageFiles,
  stageAll,
} from "./git.ts";

// ==============================================================================
// STAGING MANAGEMENT
// ==============================================================================

export interface StagingOptions {
  stageAll: boolean;
  yes: boolean;
}

export interface StagingResult {
  stagedFiles: string[];
  aborted: boolean;
}

/**
 * Handle the interactive staging flow.
 * Returns the list of staged files or indicates if the user aborted.
 */
export async function handleStaging(
  options: StagingOptions
): Promise<StagingResult> {
  let stagedFiles = await getStagedFiles();

  if (stagedFiles.length > 0) {
    // Files already staged
    note(
      stagedFiles.map((f) => `+ ${f}`).join("\n"),
      "Currently Staged Files"
    );

    const unstagedFiles = await getUnstagedFiles();

    if (unstagedFiles.length > 0 && !options.stageAll && !options.yes) {
      const action = await select({
        message:
          "You have unstaged changes. Would you like to stage more files?",
        options: [
          { value: "continue", label: "No, proceed with generation" },
          { value: "select", label: "Yes, select files to stage" },
          { value: "all", label: "Stage All (git add -A)" },
        ],
      });

      if (isCancel(action)) {
        return { stagedFiles: [], aborted: true };
      }

      if (action === "all") {
        const s = spinner();
        s.start("Staging all changes...");
        await stageAll();
        s.stop("Staged all changes");
        stagedFiles = await getStagedFiles();
        note(stagedFiles.map((f) => `+ ${f}`).join("\n"), "Staged Files");
      } else if (action === "select") {
        const selected = await multiselect({
          message: "Select files to stage",
          options: unstagedFiles.map((f) => ({ value: f, label: f })),
          required: false,
        });

        if (isCancel(selected)) {
          return { stagedFiles: [], aborted: true };
        }

        if (selected.length > 0) {
          const s = spinner();
          s.start("Staging selected files...");
          await stageFiles(selected as string[]);
          s.stop("Staged selected files");
          stagedFiles = await getStagedFiles();
        }
      }
    }
  } else {
    // No files staged yet
    const unstagedFiles = await getUnstagedFiles();

    if (unstagedFiles.length === 0) {
      // Working directory is clean - return empty with no abort
      // The caller should handle this case
      return { stagedFiles: [], aborted: false };
    }

    if (options.stageAll) {
      const s = spinner();
      s.start("Staging all changes...");
      await stageAll();
      s.stop("Staged all changes");
      stagedFiles = await getStagedFiles();
      note(stagedFiles.map((f) => `+ ${f}`).join("\n"), "Staged Files");
    } else {
      // Interactive Staging
      const action = await select({
        message: "No staged changes detected. What would you like to do?",
        options: [
          { value: "all", label: "Stage All (git add -A)" },
          { value: "select", label: "Select Files" },
          { value: "cancel", label: "Cancel" },
        ],
      });

      if (isCancel(action) || action === "cancel") {
        return { stagedFiles: [], aborted: true };
      }

      if (action === "all") {
        const s = spinner();
        s.start("Staging all changes...");
        await stageAll();
        s.stop("Staged all changes");
        stagedFiles = await getStagedFiles();
        note(stagedFiles.map((f) => `+ ${f}`).join("\n"), "Staged Files");
      } else if (action === "select") {
        const selected = await multiselect({
          message: "Select files to stage",
          options: unstagedFiles.map((f) => ({ value: f, label: f })),
          required: true,
        });

        if (isCancel(selected)) {
          return { stagedFiles: [], aborted: true };
        }

        const s = spinner();
        s.start("Staging selected files...");
        await stageFiles(selected as string[]);
        s.stop("Staged selected files");
        stagedFiles = await getStagedFiles();
      }
    }
  }

  return { stagedFiles, aborted: false };
}
