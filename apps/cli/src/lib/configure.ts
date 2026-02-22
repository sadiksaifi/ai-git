import { createActor, waitFor } from "xstate";
import { select, isCancel, cancel } from "@clack/prompts";
import { initMachine } from "../machines/init.machine.ts";
import { runOnboarding } from "./onboarding/index.ts";

// ==============================================================================
// CONFIGURE FLOW
// ==============================================================================

/**
 * Result of running the configure flow.
 */
export interface ConfigureResult {
  exitCode: 0 | 1;
  /** Whether the user wants to continue running ai-git after setup. */
  continueToRun: boolean;
}

/**
 * Shared configure flow used by both `ai-git configure` command
 * and the first-run auto-trigger in cliMachine.
 *
 * Prompts user to choose Global or Project configuration,
 * then delegates to the appropriate setup flow.
 */
export async function runConfigureFlow(): Promise<ConfigureResult> {
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
    cancel("Configuration cancelled.");
    return { exitCode: 1, continueToRun: false };
  }

  if (choice === "global") {
    const result = await runOnboarding({ target: "global" });
    return {
      exitCode: result.completed ? 0 : 1,
      continueToRun: result.continueToRun,
    };
  }

  // Project: run the init machine
  const actor = createActor(initMachine, {
    input: {},
  });
  actor.start();
  const snapshot = await waitFor(actor, (s) => s.status === "done", {
    timeout: 600_000,
  });
  return {
    exitCode: snapshot.output!.exitCode,
    continueToRun: snapshot.output!.continue ?? false,
  };
}
