// ==============================================================================
// WELCOME SCREEN
// Two-column layout inspired by Claude Code's UI.
// ==============================================================================

import pc from "picocolors";
import { BOX } from "./constants.ts";
import { getRandomTip } from "../flags.ts";
import { getRepoRoot } from "../git.ts";

export interface WelcomeResult {
  proceed: boolean;
}

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: needed for ANSI
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Pad string to exact width (handles ANSI codes).
 */
function padTo(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = width - stripped.length;
  if (padding <= 0) {
    return text;
  }
  return text + " ".repeat(padding);
}

/**
 * Center text within a given width.
 */
function center(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, Math.floor((width - stripped.length) / 2));
  const rightPad = width - stripped.length - padding;
  return " ".repeat(padding) + text + " ".repeat(rightPad);
}

/**
 * Truncate path to fit width.
 */
function truncatePath(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path;
  return "..." + path.slice(-(maxWidth - 3));
}

/**
 * Wrap text to fit within a specific width.
 */
function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  if (words.length === 0) return [];
  
  const lines: string[] = [];
  let currentLine = words[0] ?? "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i] ?? "";
    if (stripAnsi(currentLine + " " + word).length <= maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

/**
 * Display a two-column welcome screen inspired by Claude Code.
 */
export async function showWelcomeScreen(version: string): Promise<WelcomeResult> {
  console.clear();

  // Layout dimensions
  const leftWidth = 30;
  const rightWidth = 42;
  const totalWidth = leftWidth + rightWidth + 3; // +3 for borders

  // Get context info
  const repoRoot = await getRepoRoot();
  const cwd = repoRoot || process.cwd();
  const shortCwd = cwd.replace(process.env.HOME || "", "~");
  const displayCwd = truncatePath(shortCwd, leftWidth - 4);

  // Get random tip
  const tip = getRandomTip();

  // Build left column content (without borders)
  const leftContent: string[] = [
    "",
    "",
    center(pc.cyan("▄▀█ █   ▄▄ █▀▀ █ ▀█▀"), leftWidth),
    center(pc.cyan("█▀█ █   ░░ █▄█ █ ░█░"), leftWidth),
    "",
    center(pc.dim("Welcome to AI Git!"), leftWidth),
    "",
    // "",
    center(pc.dim(displayCwd), leftWidth),
    "",
  ];

  // Build right column content (without borders)
  // Use null to mark separator row
  const rightContent: (string | null)[] = [
    "",
    ` ${pc.bold("Features:")}`,
    ` ${pc.dim("•")} Conventional Commits format`,
    ` ${pc.dim("•")} Smart scope detection`,
    ` ${pc.dim("•")} Interactive refinement`,
    "",
    null, // separator marker
    ` ${pc.bold("Tip:")} ${pc.cyan(`ai-git ${tip.flag}`)}`,
  ];

  // Wrap tip description
  const wrappedTip = wrapText(tip.desc, rightWidth - 2); // -2 for left padding
  for (const line of wrappedTip) {
    rightContent.push(` ${pc.dim(line)}`);
  }

  // Ensure both columns have same height
  const maxRows = Math.max(leftContent.length, rightContent.length);
  while (leftContent.length < maxRows) leftContent.push("");
  while (rightContent.length < maxRows) rightContent.push("");

  // Build the box
  const lines: string[] = [];

  // Top border with title and middle connector
  const title = ` AI Git v${version} `;
  const titlePadLeft = 3;
  const leftRemaining = leftWidth - titlePadLeft - title.length;
  
  lines.push(
    pc.dim(BOX.topLeft) +
      pc.dim(BOX.horizontal.repeat(titlePadLeft)) +
      title +
      pc.dim(BOX.horizontal.repeat(Math.max(0, leftRemaining))) +
      pc.dim(BOX.horizontalDown) +
      pc.dim(BOX.horizontal.repeat(rightWidth)) +
      pc.dim(BOX.topRight)
  );

  // Content rows with middle divider
  for (let i = 0; i < maxRows; i++) {
    const leftCell = padTo(leftContent[i] || "", leftWidth);
    const rightItem = rightContent[i];
    
    // Check if this is a separator row (marked with null)
    if (rightItem === null) {
      lines.push(
        pc.dim(BOX.vertical) +
          leftCell +
          pc.dim(BOX.verticalRight) +
          pc.dim(BOX.horizontal.repeat(rightWidth)) +
          pc.dim(BOX.verticalLeft)
      );
    } else {
      const rightCell = padTo(rightItem || "", rightWidth);
      lines.push(
        pc.dim(BOX.vertical) +
          leftCell +
          pc.dim(BOX.vertical) +
          rightCell +
          pc.dim(BOX.vertical)
      );
    }
  }

  // Bottom border (connects to clack UI below)
  lines.push(
    pc.dim(BOX.verticalRight) +
      pc.dim(BOX.horizontal.repeat(leftWidth)) +
      pc.dim(BOX.horizontalUp) +
      pc.dim(BOX.horizontal.repeat(rightWidth)) +
      pc.dim(BOX.bottomRight)
  );

  // Render
  for (const line of lines) {
    console.log(line);
  }

  // No confirmation needed - jump straight into setup
  return { proceed: true };
}
