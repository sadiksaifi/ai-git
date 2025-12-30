// ==============================================================================
// POST-SETUP PROMPT
// Ask user if they want to try AI Git now.
// ==============================================================================

import { confirm, note, isCancel } from "@clack/prompts";
import pc from "picocolors";
import { QUICK_REFERENCE } from "./constants.ts";

/**
 * Ask if user wants to try AI Git now.
 * Returns true if user wants to continue, false if they want to exit.
 */
export async function askTryNow(): Promise<boolean> {
  const tryNow = await confirm({
    message: "Would you like to try AI Git now?",
    initialValue: true,
  });

  if (isCancel(tryNow) || !tryNow) {
    showQuickReference();
    return false;
  }

  return true;
}

/**
 * Show quick reference commands.
 */
function showQuickReference(): void {
  const commands = QUICK_REFERENCE.commands
    .map((c) => `  ${pc.cyan(c.cmd.padEnd(16))} ${pc.dim(c.desc)}`)
    .join("\n");

  note(
    ["You're all set! Here's how to use AI Git:", "", commands].join("\n"),
    "Quick Reference"
  );
}
