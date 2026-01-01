// ==============================================================================
// ONBOARDING ORCHESTRATOR
// Main entry point for the onboarding experience.
// ==============================================================================

import { outro } from "@clack/prompts";
import pc from "picocolors";
import { showWelcomeScreen } from "./welcome.ts";
import { runWizard } from "./wizard.ts";
import { askTryNow } from "./demo.ts";
import type { UserConfig } from "../../config.ts";

// ==============================================================================
// TYPES
// ==============================================================================

export interface OnboardingOptions {
  /** Version string to display in the header. */
  version: string;
  /** Default values from CLI flags. */
  defaults?: Partial<UserConfig>;
  /** Where to save the configuration. */
  target?: "global" | "project";
  /** Skip the welcome screen (for --setup flag). */
  skipWelcome?: boolean;
}

export interface OnboardingResult {
  /** The saved configuration, or null if cancelled. */
  config: UserConfig | null;
  /** Whether onboarding completed successfully. */
  completed: boolean;
  /** Whether user wants to continue running ai-git now. */
  continueToRun: boolean;
}

// ==============================================================================
// MAIN ORCHESTRATOR
// ==============================================================================

/**
 * Run the complete onboarding flow for first-time users.
 *
 * Flow:
 * 1. Welcome screen (unless skipWelcome)
 * 2. Setup wizard
 * 3. Ask if user wants to try now (for first-time global setup)
 */
export async function runOnboarding(
  options: OnboardingOptions
): Promise<OnboardingResult> {
  const { version, defaults, target = "global", skipWelcome = false } = options;

  // Step 1: Welcome screen (skip if --setup flag used)
  if (!skipWelcome) {
    const welcomeResult = await showWelcomeScreen(version);
    if (!welcomeResult.proceed) {
      outro(pc.dim("Cancelled"));
      return { config: null, completed: false, continueToRun: false };
    }
  }

  // Step 2: Setup wizard
  const wizardResult = await runWizard({ defaults, target });

  if (!wizardResult.completed || !wizardResult.config) {
    outro(pc.dim("Run ai-git --setup to try again"));
    return { config: null, completed: false, continueToRun: false };
  }

  // Step 3: Ask if user wants to try now (only for first-time global setup)
  let continueToRun = false;
  if (target === "global" && !skipWelcome) {
    continueToRun = await askTryNow();
    if (!continueToRun) {
      outro(pc.green("You're all set! ✨"));
    }
  } else {
    outro(pc.green("You're all set! ✨"));
  }

  return { config: wizardResult.config, completed: true, continueToRun };
}

// ==============================================================================
// RE-EXPORTS
// ==============================================================================

export { showWelcomeScreen } from "./welcome.ts";
export { runWizard } from "./wizard.ts";
export { askTryNow } from "./demo.ts";
export {
  diagnoseConfig,
  formatDiagnostics,
  isConfigValid,
  type ConfigDiagnostic,
  type ConfigError,
  type ConfigWarning,
} from "./diagnostics.ts";
