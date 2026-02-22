import { spinner, confirm, text, isCancel, log } from "@clack/prompts";
import pc from "picocolors";
import { push, addRemoteAndPush } from "./git.ts";
import { extractErrorMessage } from "./errors.ts";

// ==============================================================================
// PUSH MANAGEMENT
// ==============================================================================

export interface PushOptions {
  push: boolean;
  dangerouslyAutoApprove: boolean;
  isInteractiveMode: boolean;
}

/** Returns trimmed stderr string for Bun shell errors, or "" for everything else. */
function getShellStderr(error: unknown): string {
  if (error === null || typeof error !== "object" || !("stderr" in error)) return "";
  const { stderr } = error as { stderr: unknown };
  return (
    stderr instanceof Buffer ? stderr.toString() : typeof stderr === "string" ? stderr : ""
  ).trim();
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
  } catch (error) {
    s.stop("Push failed");

    // Check for missing remote error
    const stderrStr = getShellStderr(error);
    if (
      stderrStr.includes("No configured push destination") ||
      stderrStr.includes("no remote repository specified")
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
      } catch (innerError) {
        s2.stop("Failed to push to new remote");
        log.error(pc.red(extractErrorMessage(innerError)));
      }
    } else {
      // Some other error - extract meaningful message
      log.error(pc.red(`Push failed: ${extractErrorMessage(error)}`));
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
    // Interactive mode (no workflow flags): prompt user
    const shouldPush = await confirm({
      message: "Do you want to git push?",
      initialValue: false,
    });

    if (shouldPush && !isCancel(shouldPush)) {
      await safePush(false);
    }
  }
  // Flag-only mode without --push: do nothing (no prompt, no push)
}
