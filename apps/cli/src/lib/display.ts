import { log, note } from "@clack/prompts";
import pc from "picocolors";
import type { FileWithStatus } from "./git.ts";

/**
 * Color a status indicator based on its type.
 */
function colorStatus(status: string): string {
  switch (status) {
    case "A":
    case "?":
      return pc.green(status);
    case "D":
      return pc.red(status);
    case "M":
      return pc.yellow(status);
    case "R":
      return pc.cyan(status);
    default:
      return pc.dim(status);
  }
}

/**
 * Format a list of files with colored status indicators.
 * Returns a multi-line string with "  M path/to/file" format.
 */
export function formatFileList(files: FileWithStatus[]): string {
  if (files.length === 0) return "";
  return files
    .map((f) => `  ${colorStatus(f.status)} ${f.path}`)
    .join("\n");
}

/**
 * Display a titled file list using clack's log.info().
 */
export function displayFileList(
  title: string,
  files: FileWithStatus[],
): void {
  if (files.length === 0) return;
  const header = `${title} (${files.length}):`;
  log.info(`${header}\n${formatFileList(files)}`);
}

/**
 * Display the generated commit message in a note box.
 * Used in both interactive and auto-commit modes.
 */
export function displayCommitMessage(
  message: string,
  hasWarnings: boolean = false,
): void {
  const title = hasWarnings
    ? "Generated Commit Message (with warnings)"
    : "Generated Commit Message";
  note(message, title);
}
