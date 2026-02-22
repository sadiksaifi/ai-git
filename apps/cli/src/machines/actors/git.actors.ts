import { fromPromise } from "xstate";
import { $ } from "bun";
import {
  getStagedFiles,
  getUnstagedFiles,
  stageFiles,
  stageAllExcept,
  commit,
  push,
  addRemoteAndPush,
  getBranchName,
  setBranchName,
  getStagedDiff,
  getRecentCommits,
  getStagedFileList,
  type CommitResult,
} from "../../lib/git.ts";
import { CLIError } from "../../lib/errors.ts";

// ── Actor Factories ──────────────────────────────────────────────────

export function createCheckGitInstalledActor(
  checker: () => Promise<void> = async () => {
    try {
      await $`git --version`.quiet();
    } catch {
      throw new CLIError("git is not installed", 1, "Install git: https://git-scm.com");
    }
  },
) {
  return fromPromise(async () => {
    await checker();
  });
}

export function createCheckInsideRepoActor(
  checker: () => Promise<void> = async () => {
    try {
      await $`git rev-parse --is-inside-work-tree`.quiet();
    } catch {
      throw new CLIError("Not inside a git repository", 1, "Run 'git init' first");
    }
  },
) {
  return fromPromise(async () => {
    await checker();
  });
}

export function createGetStagedFilesActor(resolver: () => Promise<string[]> = getStagedFiles) {
  return fromPromise(async () => resolver());
}

export function createGetUnstagedFilesActor(resolver: () => Promise<string[]> = getUnstagedFiles) {
  return fromPromise(async () => resolver());
}

export function createStageFilesActor(resolver: (files: string[]) => Promise<void> = stageFiles) {
  return fromPromise(async ({ input }: { input: { files: string[] } }) => {
    await resolver(input.files);
  });
}

export function createStageAllExceptActor(
  resolver: (exclude?: string[]) => Promise<void> = stageAllExcept,
) {
  return fromPromise(async ({ input }: { input: { exclude?: string[] } }) => {
    await resolver(input.exclude);
  });
}

export function createCommitActor(resolver: (message: string) => Promise<CommitResult> = commit) {
  return fromPromise(async ({ input }: { input: { message: string } }) => {
    return resolver(input.message);
  });
}

export function createPushActor(resolver: () => Promise<void> = push) {
  return fromPromise(async () => {
    await resolver();
  });
}

export function createAddRemoteAndPushActor(
  resolver: (url: string) => Promise<void> = addRemoteAndPush,
) {
  return fromPromise(async ({ input }: { input: { url: string } }) => {
    await resolver(input.url);
  });
}

export function createGetBranchNameActor(
  resolver: () => Promise<string | null> = async () => getBranchName(),
) {
  return fromPromise(async () => resolver());
}

export function createSetBranchNameActor(
  resolver: (name: string) => Promise<void> = async (name) => {
    await setBranchName(name);
  },
) {
  return fromPromise(async ({ input }: { input: { name: string } }) => {
    await resolver(input.name);
  });
}

export function createGatherContextActor(
  resolver?: () => Promise<{ diff: string; commits: string; fileList: string }>,
) {
  const defaultResolver = async () => {
    const [diff, commits, fileList] = await Promise.all([
      getStagedDiff(),
      getRecentCommits(5).then((c) => c.join("\n")),
      getStagedFileList(),
    ]);
    return { diff, commits, fileList };
  };
  return fromPromise(async () => (resolver ?? defaultResolver)());
}

// ── Production Singleton Actors ──────────────────────────────────────

export const checkGitInstalledActor = createCheckGitInstalledActor();
export const checkInsideRepoActor = createCheckInsideRepoActor();
export const getStagedFilesActor = createGetStagedFilesActor();
export const getUnstagedFilesActor = createGetUnstagedFilesActor();
export const stageFilesActor = createStageFilesActor();
export const stageAllExceptActor = createStageAllExceptActor();
export const commitActor = createCommitActor();
export const pushActor = createPushActor();
export const addRemoteAndPushActor = createAddRemoteAndPushActor();
export const getBranchNameActor = createGetBranchNameActor();
export const setBranchNameActor = createSetBranchNameActor();
export const gatherContextActor = createGatherContextActor();
