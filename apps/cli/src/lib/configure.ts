import { createActor, waitFor } from "xstate";
import { select, isCancel } from "@clack/prompts";
import { initMachine } from "../machines/init.machine.ts";
import { runOnboarding } from "./onboarding/index.ts";

// ==============================================================================
// CONFIGURE FLOW
// ==============================================================================

/**
 * Shared configure flow used by both `ai-git configure` command
 * and the first-run auto-trigger in cliMachine.
 *
 * Prompts user to choose Global or Project configuration,
 * then delegates to the appropriate setup flow.
 *
 * @returns exit code (0 = success, 1 = error/cancelled)
 */
export async function runConfigureFlow(): Promise<0 | 1> {
  const choice = await select({
    message: "Where do you want to configure?",
    options: [
      {
        value: "global" as const,
        label: "Global",
        hint: "~/.config/ai-git/config.json",
      },
      {
        value: "project" as const,
        label: "Project",
        hint: ".ai-git.json in current repo",
      },
    ],
  });

  if (isCancel(choice)) {
    return 1;
  }

  if (choice === "global") {
    const result = await runOnboarding({ target: "global" });
    return result.completed ? 0 : 1;
  }

  // Project: run the init machine
  const actor = createActor(initMachine, {
    input: {},
  });
  actor.start();
  const snapshot = await waitFor(actor, (s) => s.status === "done", {
    timeout: 600_000,
  });
  return snapshot.output!.exitCode;
}
