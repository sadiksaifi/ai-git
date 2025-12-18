import * as path from "node:path";
import * as os from "node:os";

// ==============================================================================
// SHARED UTILITIES & CONSTANTS
// ==============================================================================

/**
 * Temporary file path for editing commit messages.
 */
export const TEMP_MSG_FILE = path.join(os.tmpdir(), "ai-git-msg.txt");

/**
 * Lock files to exclude from git diff.
 * These files are typically auto-generated and don't provide meaningful diff context.
 */
export const LOCKFILES = [
  ":(exclude)package-lock.json",
  ":(exclude)yarn.lock",
  ":(exclude)pnpm-lock.yaml",
  ":(exclude)bun.lockb",
  ":(exclude)bun.lock",
  ":(exclude)Cargo.lock",
  ":(exclude)Gemfile.lock",
  ":(exclude)composer.lock",
  ":(exclude)poetry.lock",
  ":(exclude)deno.lock",
  ":(exclude)go.sum",
];

/**
 * Parse shell-style arguments from a string.
 * Handles quoted strings (single and double quotes).
 *
 * @param input - The input string to parse
 * @returns Array of parsed arguments
 *
 * @example
 * parseShellArgs('--model "gemini-2.5-flash" --flag')
 * // Returns: ['--model', 'gemini-2.5-flash', '--flag']
 */
export function parseShellArgs(input: string): string[] {
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match[1] !== undefined) {
      // Double-quoted string
      args.push(match[1]);
    } else if (match[2] !== undefined) {
      // Single-quoted string
      args.push(match[2]);
    } else {
      // Unquoted token
      args.push(match[0]);
    }
  }

  return args;
}
