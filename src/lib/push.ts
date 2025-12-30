import { spinner, confirm, text, isCancel, log } from "@clack/prompts";
import pc from "picocolors";
import { push, addRemoteAndPush } from "./git.ts";

// ==============================================================================
// PUSH MANAGEMENT
// ==============================================================================

export interface PushOptions {
  push: boolean;
  dangerouslyAutoApprove: boolean;
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
        console.error(
          pc.red("Error: No remote repository configured. Cannot push.")
        );
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
      } catch (e) {
        s2.stop("Failed to push to new remote");
        console.error(e);
      }
    } else {
      // Some other error
      console.error(pc.red("Error pushing changes:"));
      console.error(error);
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
    await safePush(options.dangerouslyAutoApprove);
  } else if (!options.dangerouslyAutoApprove) {
    const shouldPush = await confirm({
      message: "Do you want to git push?",
      initialValue: false,
    });

    if (shouldPush && !isCancel(shouldPush)) {
      await safePush(false);
    }
  }
}
