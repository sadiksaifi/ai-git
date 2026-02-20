import { spinner, confirm, text, isCancel, log } from "@clack/prompts";
import pc from "picocolors";
import { push, addRemoteAndPush, getRemoteSyncStatus } from "./git.ts";

// ==============================================================================
// PUSH MANAGEMENT
// ==============================================================================

export interface PushOptions {
  push: boolean;
  dangerouslyAutoApprove: boolean;
  isInteractiveMode: boolean;
}

export interface PushPromptDeps {
  confirmPrompt: typeof confirm;
  getRemoteSyncStatusFn: typeof getRemoteSyncStatus;
  warn: (message: string) => void;
}

/**
 * Prompt for push and suggest pulling first when remote has new commits.
 */
export async function shouldProceedWithPush(
  deps?: Partial<PushPromptDeps>
): Promise<boolean> {
  const confirmPrompt = deps?.confirmPrompt ?? confirm;
  const getRemoteSyncStatusFn = deps?.getRemoteSyncStatusFn ?? getRemoteSyncStatus;
  const warn = deps?.warn ?? ((message: string) => log.warn(message));

  const shouldPush = await confirmPrompt({
    message: "Do you want to git push?",
    initialValue: false,
  });

  if (!shouldPush || isCancel(shouldPush)) {
    return false;
  }

  const syncStatus = await getRemoteSyncStatusFn();
  if (!syncStatus.remoteAhead) {
    return true;
  }

  warn("Remote has new commits. Consider running `git pull --rebase` before pushing.");

  const continuePush = await confirmPrompt({
    message: "Remote has new commits. Pull first before pushing. Continue anyway?",
    initialValue: false,
  });

  return !!continuePush && !isCancel(continuePush);
}

/**
 * Safely push changes to remote.
 * Handles missing remote repository by prompting user to add one.
 *
 * @param isAutomated - If true, skip interactive prompts
 */
export async function safePush(isAutomated: boolean): Promise<void> {
  const s = spinner();
  s.start("Pushing changes...");

  try {
    await push();
    s.stop("Pushed successfully");
  } catch (error: any) {
    s.stop("Push failed");

    // Check for missing remote error
    const stderr = error.stderr?.toString() || "";
    if (
      stderr.includes("No configured push destination") ||
      stderr.includes("no remote repository specified")
    ) {
      if (isAutomated) {
        log.error(pc.red("No remote repository configured. Cannot push."));
        return;
      }

      log.warn("No remote repository configured.");

      const addRemote = await confirm({
        message: "Do you want to add a remote repository?",
        initialValue: true,
      });

      if (isCancel(addRemote) || !addRemote) {
        log.info("Push skipped.");
        return;
      }

      const remoteUrl = await text({
        message: "Enter the remote repository URL:",
        placeholder: "git@github.com:user/repo.git",
        validate: (value) => {
          if (!value) return "URL is required";
        },
      });

      if (isCancel(remoteUrl)) {
        return;
      }

      const s2 = spinner();
      s2.start("Adding remote and pushing...");
      try {
        await addRemoteAndPush(remoteUrl as string);
        s2.stop("Remote added and pushed successfully");
      } catch (e: any) {
        s2.stop("Failed to push to new remote");
        const errMsg = e.stderr?.toString() || e.message || "Unknown error";
        log.error(pc.red(errMsg));
      }
    } else {
      // Some other error - extract meaningful message
      const errMsg = stderr || error.message || "Unknown error";
      log.error(pc.red(`Push failed: ${errMsg}`));
    }
  }
}

/**
 * Handle the push flow based on options.
 *
 * @param options - Push options
 */
export async function handlePush(options: PushOptions): Promise<void> {
  if (options.push) {
    // --push flag provided: push automatically
    await safePush(options.dangerouslyAutoApprove);
  } else if (options.isInteractiveMode) {
    // Interactive mode (no workflow flags): prompt user and check remote sync
    const shouldPush = await shouldProceedWithPush();
    if (shouldPush) {
      await safePush(false);
    }
  }
  // Flag-only mode without --push: do nothing (no prompt, no push)
}
