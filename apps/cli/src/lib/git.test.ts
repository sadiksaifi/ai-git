import { describe, test, expect } from "bun:test";
import { getRecentCommits, getStagedFileList } from "./git.ts";

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

  test("returns empty array on error", async () => {
    // Should not throw, just return empty
    const commits = await getRecentCommits(0);
    expect(Array.isArray(commits)).toBe(true);
  });
});

describe("getStagedFileList", () => {
  test("returns string of staged files", async () => {
    const fileList = await getStagedFileList();
    expect(typeof fileList).toBe("string");
  });
});
