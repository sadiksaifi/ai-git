// ==============================================================================
// ONBOARDING ORCHESTRATOR
// Main entry point for the onboarding experience.
// ==============================================================================

import { outro } from "@clack/prompts";
import pc from "picocolors";
import { runWizard } from "./wizard.ts";
import { askTryNow } from "./demo.ts";
import type { UserConfig } from "../../config.ts";

// ==============================================================================
// TYPES
// ==============================================================================

export interface OnboardingOptions {
  /** Default values from CLI flags. */
  defaults?: Partial<UserConfig>;
  /** Where to save the configuration. */
  target?: "global" | "project";
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
 * 1. Setup wizard
 * 2. Ask if user wants to try now (for first-time global setup)
 */
export async function runOnboarding(
  options: OnboardingOptions
): Promise<OnboardingResult> {
  const { defaults, target = "global" } = options;

  // Step 1: Setup wizard
  const wizardResult = await runWizard({ defaults, target });

  if (!wizardResult.completed || !wizardResult.config) {
    outro(pc.dim("Run ai-git --setup to try again"));
    return { config: null, completed: false, continueToRun: false };
  }

  // Step 2: Ask if user wants to try now (only for first-time global setup)
  let continueToRun = false;
  if (target === "global") {
    continueToRun = await askTryNow();
    if (!continueToRun) {
      outro(pc.green("You're all set!"));
    }
  } else {
    outro(pc.green("You're all set!"));
  }

  return { config: wizardResult.config, completed: true, continueToRun };
}

// ==============================================================================
// RE-EXPORTS
// ==============================================================================

export { showWelcomeScreen } from "../ui/welcome.ts";
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
