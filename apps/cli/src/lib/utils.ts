import pc from "picocolors";

// ==============================================================================
// SHARED UTILITIES & CONSTANTS
// ==============================================================================

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

/**
 * Parse a pattern as regex if it uses /pattern/flags or regex:pattern syntax.
 * Returns the RegExp if valid, null otherwise.
 */
export function parseRegexPattern(pattern: string): RegExp | null {
  // /pattern/flags syntax
  const slashMatch = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (slashMatch && slashMatch[1] !== undefined) {
    try {
      return new RegExp(slashMatch[1], slashMatch[2] ?? "");
    } catch (e) {
      console.warn(
        pc.yellow(`Warning: Invalid regex pattern "${pattern}": ${e instanceof Error ? e.message : e}`)
      );
      return null;
    }
  }

  // regex:pattern syntax
  if (pattern.startsWith("regex:")) {
    const regexBody = pattern.slice(6);
    try {
      return new RegExp(regexBody);
    } catch (e) {
      console.warn(
        pc.yellow(`Warning: Invalid regex pattern "${pattern}": ${e instanceof Error ? e.message : e}`)
      );
      return null;
    }
  }

  return null;
}

/**
 * Check if a pattern is a glob (contains *, ?, or [...]).
 */
function isGlobPattern(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?") || /\[.+\]/.test(pattern);
}

/**
 * Check if a file path matches any exclusion pattern.
 * Supports:
 * - Exact paths
 * - Directory prefixes (trailing /)
 * - Glob patterns (*, ?, [...])
 * - Regex patterns (/pattern/flags or regex:pattern)
 */
export function matchesExcludePattern(
  filePath: string,
  patterns: string[]
): boolean {
  for (const pattern of patterns) {
    // Skip empty patterns
    if (!pattern) continue;

    // Check for regex pattern first
    const regex = parseRegexPattern(pattern);
    if (regex !== null) {
      if (regex.test(filePath)) {
        return true;
      }
      continue;
    }

    // Directory pattern (ends with /)
    if (pattern.endsWith("/")) {
      if (filePath.startsWith(pattern) || filePath + "/" === pattern) {
        return true;
      }
    }
    // Glob pattern with *, ?, or [...]
    else if (isGlobPattern(pattern)) {
      const glob = new Bun.Glob(pattern);
      const basename = filePath.split("/").pop() ?? "";
      // Match against full path and basename
      if (glob.match(filePath) || glob.match(basename)) {
        return true;
      }
    }
    // Exact match or prefix (treat as directory)
    else if (filePath === pattern || filePath.startsWith(pattern + "/")) {
      return true;
    }
  }
  return false;
}

/**
 * Filter out files that match any exclusion pattern.
 */
export function filterExcludedFiles(
  files: string[],
  patterns: string[]
): string[] {
  if (!patterns || patterns.length === 0) return files;
  return files.filter((f) => !matchesExcludePattern(f, patterns));
}

