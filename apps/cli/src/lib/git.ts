import { $ } from "bun";
import pc from "picocolors";
import { LOCKFILES, filterExcludedFiles } from "./utils.ts";
import { CLIError } from "./errors.ts";

// ==============================================================================
// TYPES
// ==============================================================================

/**
 * A file path with its git status indicator.
 */
export interface FileWithStatus {
  /** Git status: "M" (modified), "A" (added), "D" (deleted), "R" (renamed), "?" (untracked) */
  status: string;
  path: string;
}

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
 * Parse `git diff --name-status` output into FileWithStatus[].
 * Exported for deterministic testing with mock output.
 */
export function parseNameStatusOutput(output: string): FileWithStatus[] {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = (parts[0] ?? "M").trim().charAt(0);
      // Renames: git outputs "R100\told-path\tnew-path" — show both paths
      const path =
        status === "R" && parts[2]
          ? `${(parts[1] ?? "").trim()} → ${parts[2].trim()}`
          : (parts[1] ?? "").trim();
      return { status, path };
    })
    .filter((f) => f.path);
}

/**
 * Get staged files with their status (M/A/D/R).
 * Uses `git diff --cached --name-status`.
 *
 * Intentionally includes all files (including lock files) because this is used
 * for display purposes. For AI prompt context, use getStagedFileList() which
 * excludes lock files via the LOCKFILES filter.
 */
export async function getStagedFilesWithStatus(): Promise<FileWithStatus[]> {
  try {
    const output = await $`git diff --cached --name-status`.text();
    return parseNameStatusOutput(output);
  } catch {
    return [];
  }
}

/**
 * Parse modified + untracked output into FileWithStatus[].
 * Exported for deterministic testing with mock output.
 */
export function parseUnstagedOutput(modified: string, untracked: string): FileWithStatus[] {
  const files: FileWithStatus[] = [];

  // Parse modified/deleted (format: "M\tfile.ts" or "D\tfile.ts")
  for (const line of modified.trim().split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    files.push({
      status: (parts[0] ?? "M").trim().charAt(0),
      path: (parts[1] ?? "").trim(),
    });
  }

  // Untracked files
  for (const path of untracked.trim().split("\n").filter(Boolean)) {
    if (!files.some((f) => f.path === path.trim())) {
      files.push({ status: "?", path: path.trim() });
    }
  }

  return files.filter((f) => f.path);
}

/**
 * Get unstaged files with their status.
 * Modified tracked files → "M", deleted → "D", untracked → "?".
 */
export async function getUnstagedFilesWithStatus(): Promise<FileWithStatus[]> {
  try {
    const modified = await $`git diff --name-status`.text();
    const untracked = await $`git ls-files -o --exclude-standard`.text();
    return parseUnstagedOutput(modified, untracked);
  } catch {
    return [];
  }
}

/**
 * Get the current branch name.
 * Returns null if in a new repo with no commits.
 */
export async function getBranchName(): Promise<string | null> {
  try {
    const branchName = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
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
    diffOutput = lines.slice(0, 2500).join("\n") + "\n... [DIFF TRUNCATED] ...";
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
export async function stageAllExcept(excludePatterns?: string[]): Promise<void> {
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
    const statsMatch = line.match(
      /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/,
    );
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

/**
 * Fetch updates from the remote for the current branch's upstream.
 * Throws if no remote is configured or on network errors.
 */
export async function fetchRemote(): Promise<void> {
  await $`git fetch`.quiet();
}

/**
 * Count how many commits the remote tracking branch is ahead of HEAD.
 * Returns 0 if the remote is not ahead or there is no upstream.
 */
export async function getRemoteAheadCount(): Promise<number> {
  const output = await $`git rev-list HEAD..@{u} --count`.text();
  return parseInt(output.trim(), 10) || 0;
}

/**
 * Pull with rebase from the remote tracking branch.
 * Throws on conflicts or other errors.
 */
export async function pullRebase(): Promise<void> {
  await $`git pull --rebase`.quiet();
}
