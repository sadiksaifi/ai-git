import { describe, test, expect } from "bun:test";
import {
  getRecentCommits,
  getStagedFileList,
  getStagedFilesWithStatus,
  getUnstagedFilesWithStatus,
  type FileWithStatus,
} from "./git.ts";

describe("getRecentCommits", () => {
  test("returns array of commit subjects", async () => {
    const commits = await getRecentCommits(5);
    expect(Array.isArray(commits)).toBe(true);
    // In a repo with commits, should return strings
    if (commits.length > 0) {
      expect(typeof commits[0]).toBe("string");
      expect(commits[0]!.length).toBeGreaterThan(0);
    }
  });

  test("respects count parameter", async () => {
    const commits = await getRecentCommits(2);
    expect(commits.length).toBeLessThanOrEqual(2);
  });

  test("returns empty array for n=0", async () => {
    const commits = await getRecentCommits(0);
    expect(commits).toEqual([]);
  });
});

describe("getStagedFileList", () => {
  test("returns string of staged files", async () => {
    const fileList = await getStagedFileList();
    expect(typeof fileList).toBe("string");
  });
});

describe("getStagedFilesWithStatus", () => {
  test("returns FileWithStatus array", async () => {
    const files = await getStagedFilesWithStatus();
    expect(Array.isArray(files)).toBe(true);
    for (const f of files) {
      expect(typeof f.status).toBe("string");
      expect(typeof f.path).toBe("string");
      expect(f.status.length).toBe(1);
      expect(f.path.length).toBeGreaterThan(0);
    }
  });
});

describe("getUnstagedFilesWithStatus", () => {
  test("returns FileWithStatus array", async () => {
    const files = await getUnstagedFilesWithStatus();
    expect(Array.isArray(files)).toBe(true);
    for (const f of files) {
      expect(typeof f.status).toBe("string");
      expect(typeof f.path).toBe("string");
      expect(f.status.length).toBe(1);
      expect(f.path.length).toBeGreaterThan(0);
    }
  });
});
