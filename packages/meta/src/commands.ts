import type { CommandDef } from "./types.ts";

// ==============================================================================
// @ai-git/meta — Command Definitions
// ==============================================================================

/**
 * CLI subcommand definitions.
 */
export const COMMANDS = {
  configure: {
    name: "configure",
    description: "Set up AI provider and model",
  },
  upgrade: {
    name: "upgrade",
    description: "Update ai-git to the latest version",
  },
} as const satisfies Record<string, CommandDef>;
