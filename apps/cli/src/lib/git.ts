import { $ } from "bun";
import pc from "picocolors";
import { LOCKFILES, filterExcludedFiles } from "./utils.ts";
import { CLIError } from "./errors.ts";

// ==============================================================================
// GIT OPERATIONS
// ==============================================================================

/**
 * Check if git is installed.
 * Throws CLIError if not found.
 */
export async function checkGitInstalled(): Promise<void> {
  try {
    await $`git --version`.quiet();
  } catch {
    console.error(pc.red("Error: 'git' is not installed."));
    console.error(pc.dim("Install git: https://git-scm.com/downloads"));
    throw new CLIError("'git' is not installed.", 1, "Install git: https://git-scm.com/downloads");
  }
}

/**
 * Check if the current directory is inside a git repository.
 * Throws CLIError if not inside a git repository.
 */
export async function checkInsideRepo(): Promise<void> {
  try {
    await $`git rev-parse --is-inside-work-tree`.quiet();
  } catch {
    console.error(pc.red("Error: Not a git repository."));
    console.error(pc.dim("Run this command inside a git repository."));
    throw new CLIError("Not a git repository.", 1, "Run this command inside a git repository.");
  }
}

/**
 * Get the root directory of the git repository.
 * Returns null if not in a git repository.
 */
export async function getRepoRoot(): Promise<string | null> {
  try {
    const root = await $`git rev-parse --show-toplevel`.text();
    return root.trim();
  } catch {
    return null;
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
 * Get last N commit subjects for style context.
 * Returns empty array if no commits exist or on error.
 */
export async function getRecentCommits(n: number = 5): Promise<string[]> {
  try {
    const output = await $`git log -${n} --format=%s`.text();
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get compact staged file list with status (A/M/D/R).
 * Returns empty string if nothing is staged.
 */
export async function getStagedFileList(): Promise<string> {
  try {
    return (await $`git diff --staged --name-status -- . ${LOCKFILES}`.text()).trim();
  } catch {
    return "";
  }
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
 * Stage all changes except those matching exclusion patterns.
 */
export async function stageAllExcept(
  excludePatterns?: string[]
): Promise<void> {
  if (!excludePatterns || excludePatterns.length === 0) {
    await stageAll();
    return;
  }

  const allFiles = await getUnstagedFiles();
  const filesToStage = filterExcludedFiles(allFiles, excludePatterns);

  if (filesToStage.length > 0) {
    await stageFiles(filesToStage);
  }
}

/**
 * Commit result information.
 */
export interface CommitResult {
  /** Short commit hash */
  hash: string;
  /** Branch name */
  branch: string;
  /** First line of commit message */
  subject: string;
  /** Number of files changed */
  filesChanged: number;
  /** Number of insertions */
  insertions: number;
  /** Number of deletions */
  deletions: number;
  /** List of files with their status (A=added, M=modified, D=deleted) */
  files: Array<{ status: string; path: string }>;
  /** Whether this is the root commit */
  isRoot: boolean;
}

/**
 * Create a git commit with the given message.
 * Returns structured commit information.
 */
export async function commit(message: string): Promise<CommitResult> {
  // Run commit quietly and capture output
  const result = await $`git commit -m ${message}`.quiet();
  const stdout = result.stdout.toString();

  // Parse the commit output
  // Format: "[branch hash] message\n files changed, insertions, deletions\n create mode ... file\n ..."
  const lines = stdout.trim().split("\n");
  
  // Parse first line: "[main abc1234] commit message" or "[main (root-commit) abc1234] message"
  const headerMatch = lines[0]?.match(/^\[([^\s\]]+)(?:\s+\([^)]+\))?\s+([a-f0-9]+)\]/);
  const branch = headerMatch?.[1] ?? "unknown";
  const hash = headerMatch?.[2] ?? "unknown";
  const isRoot = lines[0]?.includes("(root-commit)") ?? false;
  
  // Parse subject from the header line
  const subjectMatch = lines[0]?.match(/\]\s+(.+)$/);
  const subject = subjectMatch?.[1] ?? message.split("\n")[0] ?? "";

  // Parse stats line: " 8 files changed, 233 insertions(+)"
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  
  for (const line of lines) {
    const statsMatch = line.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/);
    if (statsMatch) {
      filesChanged = parseInt(statsMatch[1] ?? "0", 10);
      insertions = parseInt(statsMatch[2] ?? "0", 10);
      deletions = parseInt(statsMatch[3] ?? "0", 10);
      break;
    }
  }

  // Parse file list: " create mode 100644 path/to/file" or " rename ... => ..."
  const files: Array<{ status: string; path: string }> = [];
  for (const line of lines) {
    const createMatch = line.match(/^\s+create mode \d+ (.+)$/);
    if (createMatch) {
      files.push({ status: "A", path: createMatch[1] ?? "" });
      continue;
    }
    const deleteMatch = line.match(/^\s+delete mode \d+ (.+)$/);
    if (deleteMatch) {
      files.push({ status: "D", path: deleteMatch[1] ?? "" });
      continue;
    }
    const renameMatch = line.match(/^\s+rename (.+) => (.+) \(\d+%\)$/);
    if (renameMatch) {
      files.push({ status: "R", path: `${renameMatch[1]} → ${renameMatch[2]}` });
      continue;
    }
  }

  return {
    hash,
    branch,
    subject,
    filesChanged,
    insertions,
    deletions,
    files,
    isRoot,
  };
}

/**
 * Push changes to remote.
 * Throws with stderr available on error.
 */
export async function push(): Promise<void> {
  await $`git push`.quiet();
}

/**
 * Add a remote and push.
 */
export async function addRemoteAndPush(url: string): Promise<void> {
  await $`git remote add origin ${url}`.quiet();
  await $`git push -u origin HEAD`.quiet();
}
