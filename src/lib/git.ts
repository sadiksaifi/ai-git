import { $ } from "bun";
import pc from "picocolors";
import { LOCKFILES } from "./utils.ts";

// ==============================================================================
// GIT OPERATIONS
// ==============================================================================

/**
 * Check if git is installed.
 * Exits with error if not found.
 */
export async function checkGitInstalled(): Promise<void> {
  try {
    await $`git --version`.quiet();
  } catch {
    console.error(pc.red("Error: 'git' is not installed."));
    process.exit(1);
  }
}

/**
 * Check if the current directory is inside a git repository.
 * Exits with error if not.
 */
export async function checkInsideRepo(): Promise<void> {
  try {
    await $`git rev-parse --is-inside-work-tree`.quiet();
  } catch {
    console.error(pc.red("Error: Not a git repository."));
    process.exit(1);
  }
}

/**
 * Get the list of currently staged files.
 */
export async function getStagedFiles(): Promise<string[]> {
  const output = await $`git diff --cached --name-only`.text();
  return output.trim().split("\n").filter(Boolean);
}

/**
 * Get the list of unstaged files (modified + untracked).
 */
export async function getUnstagedFiles(): Promise<string[]> {
  const modified = await $`git ls-files -m --exclude-standard`.text();
  const untracked = await $`git ls-files -o --exclude-standard`.text();

  return [...modified.split("\n"), ...untracked.split("\n")]
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i); // unique
}

/**
 * Get the current branch name.
 * Returns null if in a new repo with no commits.
 */
export async function getBranchName(): Promise<string | null> {
  try {
    const branchName = (
      await $`git rev-parse --abbrev-ref HEAD`.text()
    ).trim();
    return branchName;
  } catch {
    return null;
  }
}

/**
 * Create or rename the initial branch.
 */
export async function setBranchName(name: string): Promise<void> {
  await $`git branch -M ${name}`;
}

/**
 * Get the staged diff, excluding lock files.
 * Falls back to --stat if the diff is empty.
 * Truncates to 2500 lines max.
 */
export async function getStagedDiff(): Promise<string> {
  let diffOutput = await $`git diff --staged -- . ${LOCKFILES}`.text();

  // Fallback for empty diffs
  if (!diffOutput.trim()) {
    diffOutput = await $`git diff --staged --stat`.text();
  }

  // Truncate if massive
  const lines = diffOutput.split("\n");
  if (lines.length > 2500) {
    diffOutput =
      lines.slice(0, 2500).join("\n") + "\n... [DIFF TRUNCATED] ...";
  }

  return diffOutput;
}

/**
 * Stage specific files.
 */
export async function stageFiles(files: string[]): Promise<void> {
  for (const file of files) {
    await $`git add ${file}`;
  }
}

/**
 * Stage all changes (git add -A).
 */
export async function stageAll(): Promise<void> {
  await $`git add -A`;
}

/**
 * Create a git commit with the given message.
 */
export async function commit(message: string): Promise<void> {
  await $`git commit -m ${message}`;
}

/**
 * Push changes to remote.
 */
export async function push(): Promise<void> {
  await $`git push`;
}

/**
 * Add a remote and push.
 */
export async function addRemoteAndPush(url: string): Promise<void> {
  await $`git remote add origin ${url}`;
  await $`git push -u origin HEAD`;
}
