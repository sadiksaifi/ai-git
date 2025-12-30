// ==============================================================================
// WELCOME SCREEN
// First-time user introduction explaining what AI Git does.
// ==============================================================================

import { intro, note, confirm, isCancel } from "@clack/prompts";
import pc from "picocolors";
import { WELCOME_COPY } from "./constants.ts";
import { CONFIG_FILE } from "../../config.ts";

export interface WelcomeResult {
  proceed: boolean;
}

/**
 * Display the welcome screen for first-time users.
 * Explains what AI Git does and what the setup will configure.
 */
export async function showWelcomeScreen(version: string): Promise<WelcomeResult> {
  console.clear();

  // Branded intro banner
  intro(pc.bgCyan(pc.black(` AI Git ${version} `)));

  // Welcome message with value proposition
  const welcomeText = [
    pc.bold(WELCOME_COPY.tagline),
    "",
    ...WELCOME_COPY.description,
    "",
    pc.dim("Features:"),
    ...WELCOME_COPY.features.map((f) => pc.dim(`  - ${f}`)),
  ].join("\n");

  note(welcomeText, "Welcome to AI Git");

  // Explain what setup will do
  const setupExplanation = [
    ...WELCOME_COPY.setupOverview.map((line) => {
      // Highlight the mode names
      if (line.includes("CLI Mode")) {
        return line.replace("CLI Mode", pc.cyan("CLI Mode"));
      }
      if (line.includes("API Mode")) {
        return line.replace("API Mode", pc.cyan("API Mode"));
      }
      return line;
    }),
    "",
    pc.dim(`Settings will be saved to: ${CONFIG_FILE}`),
  ].join("\n");

  note(setupExplanation, "Setup Overview");

  const proceed = await confirm({
    message: "Ready to begin setup?",
    initialValue: true,
  });

  if (isCancel(proceed)) {
    return { proceed: false };
  }

  return { proceed: proceed as boolean };
}
