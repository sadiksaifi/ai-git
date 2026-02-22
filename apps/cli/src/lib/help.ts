import pc from "picocolors";
import {
  CLI_NAME,
  CLI_DESCRIPTION,
  COMMANDS,
  getFlagsByCategory,
  type FlagDef,
  type CommandDef,
} from "@ai-git/meta";

// ==============================================================================
// HELP RENDERER
// ==============================================================================

/**
 * Column width for the left side of flag/command entries.
 * Ensures aligned descriptions.
 */
const COLUMN_WIDTH = 31;

/**
 * Format a flag entry: "  -X, --flag-name <arg>       description"
 */
function formatFlag(flag: FlagDef): string {
  let left: string;
  if (flag.short) {
    left = `${flag.short}, ${flag.long}`;
  } else {
    left = `    ${flag.long}`;
  }
  if (flag.arg) {
    left += ` ${flag.arg}`;
  }
  const padding = Math.max(1, COLUMN_WIDTH - left.length);
  return `  ${left}${" ".repeat(padding)}${flag.description}`;
}

/**
 * Format a command entry: "  name                        description"
 */
function formatCommand(cmd: CommandDef): string {
  const padding = Math.max(1, COLUMN_WIDTH - cmd.name.length);
  return `  ${cmd.name}${" ".repeat(padding)}${cmd.description}`;
}

/**
 * Render the full help output.
 * All data sourced from @ai-git/meta.
 */
export function renderHelp(): string {
  const lines: string[] = [];

  // Usage
  lines.push(`${pc.bold("Usage:")}`);
  lines.push(`  $ ${CLI_NAME} [command] [options]`);
  lines.push("");

  // Description
  lines.push(CLI_DESCRIPTION);
  lines.push("");

  // Commands
  lines.push(`${pc.bold("Commands:")}`);
  for (const cmd of Object.values(COMMANDS)) {
    lines.push(formatCommand(cmd));
  }
  lines.push("");

  // Flags by category
  const grouped = getFlagsByCategory();
  for (const { category, flags } of grouped) {
    lines.push(`${pc.bold(`${category.label}:`)}`);
    for (const flag of flags) {
      lines.push(formatFlag(flag));
    }
    lines.push("");
  }

  return lines.join("\n");
}
