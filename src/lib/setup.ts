// ==============================================================================
// SETUP WIZARD (LEGACY)
// This file delegates to the new onboarding system while maintaining
// backward compatibility for the --init flow.
// ==============================================================================

import { outro } from "@clack/prompts";
import pc from "picocolors";
import { runWizard } from "./onboarding/wizard.ts";
import type { UserConfig } from "../config.ts";

/**
 * Run the setup wizard.
 * This is a compatibility wrapper that delegates to the new onboarding wizard.
 *
 * @param defaults - Optional default values (e.g., from CLI flags)
 * @param target - Where to save the configuration ("global" or "project")
 * @returns The saved configuration
 */
export async function runSetupWizard(
  defaults?: Partial<UserConfig>,
  target: "global" | "project" = "global"
): Promise<UserConfig> {
  console.clear();

  const result = await runWizard({ defaults, target });

  if (!result.completed || !result.config) {
    outro(pc.yellow("Setup incomplete. Run ai-git --setup to try again."));
    process.exit(1);
  }

  outro(pc.green("Setup complete! Run ai-git to generate your first commit."));

  return result.config;
}
