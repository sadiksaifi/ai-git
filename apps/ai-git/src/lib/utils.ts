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
 * Wrap text to a specific width.
 */
export function wrapText(text: string, width: number): string {
  if (width <= 0) return text;
  
  const lines = text.split("\n");
  const wrappedLines: string[] = [];

  for (const line of lines) {
    if (line.length <= width) {
      wrappedLines.push(line);
      continue;
    }

    let currentLine = line;
    while (currentLine.length > width) {
      let splitIndex = currentLine.lastIndexOf(" ", width);
      if (splitIndex === -1) {
        splitIndex = width;
      }
      wrappedLines.push(currentLine.slice(0, splitIndex));
      currentLine = currentLine.slice(splitIndex).trimStart();
    }
    if (currentLine.length > 0) {
      wrappedLines.push(currentLine);
    }
  }

  return wrappedLines.join("\n");
}

