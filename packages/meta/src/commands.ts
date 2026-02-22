import type { CommandDef } from "./types.ts";

// ==============================================================================
// @ai-git/meta — Command Definitions
// ==============================================================================

/**
 * CLI subcommand definitions.
 */
export const COMMANDS: Record<string, CommandDef> = {
  configure: {
    name: "configure",
    description: "Set up AI provider and model",
  },
  upgrade: {
    name: "upgrade",
    description: "Update ai-git to the latest version",
  },
};
