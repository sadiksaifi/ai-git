import { describe, test, expect } from "bun:test";
import {
  getRecentCommits,
  getStagedFileList,
  getStagedFilesWithStatus,
  getUnstagedFilesWithStatus,
  parseNameStatusOutput,
  parseUnstagedOutput,
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

// Smoke test — per-file assertions only run when files exist in the working tree.
// Deterministic coverage is provided by parseNameStatusOutput tests below.
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

// Smoke test — per-file assertions only run when files exist in the working tree.
// Deterministic coverage is provided by parseUnstagedOutput tests below.
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

describe("parseNameStatusOutput", () => {
  test("parses modified, added, and deleted files", () => {
    const output = "M\tsrc/app.ts\nA\tsrc/new.ts\nD\tsrc/old.ts\n";
    const result = parseNameStatusOutput(output);
    expect(result).toEqual([
      { status: "M", path: "src/app.ts" },
      { status: "A", path: "src/new.ts" },
      { status: "D", path: "src/old.ts" },
    ]);
  });

  test("parses renamed files with old → new format", () => {
    const output = "R100\tsrc/old-name.ts\tsrc/new-name.ts\n";
    const result = parseNameStatusOutput(output);
    expect(result).toEqual([{ status: "R", path: "src/old-name.ts → src/new-name.ts" }]);
  });

  test("handles partial rename scores", () => {
    const output = "R085\tutils.ts\tlib/utils.ts\n";
    const result = parseNameStatusOutput(output);
    expect(result).toEqual([{ status: "R", path: "utils.ts → lib/utils.ts" }]);
  });

  test("returns empty array for empty output", () => {
    expect(parseNameStatusOutput("")).toEqual([]);
    expect(parseNameStatusOutput("\n")).toEqual([]);
  });

  test("handles copy status (destination path not captured)", () => {
    const output = "C100\tsrc/original.ts\tsrc/copy.ts\n";
    const result = parseNameStatusOutput(output);
    expect(result).toEqual([{ status: "C", path: "src/original.ts" }]);
  });

  test("handles mixed statuses including renames", () => {
    const output = "M\tREADME.md\nR100\tsrc/a.ts\tsrc/b.ts\nA\tsrc/c.ts\n";
    const result = parseNameStatusOutput(output);
    expect(result).toEqual([
      { status: "M", path: "README.md" },
      { status: "R", path: "src/a.ts → src/b.ts" },
      { status: "A", path: "src/c.ts" },
    ]);
  });
});

describe("parseUnstagedOutput", () => {
  test("parses modified and untracked files", () => {
    const modified = "M\tsrc/app.ts\nD\tsrc/old.ts\n";
    const untracked = "new-file.ts\n";
    const result = parseUnstagedOutput(modified, untracked);
    expect(result).toEqual([
      { status: "M", path: "src/app.ts" },
      { status: "D", path: "src/old.ts" },
      { status: "?", path: "new-file.ts" },
    ]);
  });

  test("deduplicates files appearing in both modified and untracked", () => {
    const modified = "M\tsrc/app.ts\n";
    const untracked = "src/app.ts\nnew.ts\n";
    const result = parseUnstagedOutput(modified, untracked);
    expect(result).toEqual([
      { status: "M", path: "src/app.ts" },
      { status: "?", path: "new.ts" },
    ]);
  });

  test("returns empty array for no changes", () => {
    expect(parseUnstagedOutput("", "")).toEqual([]);
  });

  test("handles rename in modified output (destination path not captured)", () => {
    const modified = "R100\tsrc/old.ts\tsrc/new.ts\n";
    const result = parseUnstagedOutput(modified, "");
    expect(result).toEqual([{ status: "R", path: "src/old.ts" }]);
  });

  test("handles only untracked files", () => {
    const result = parseUnstagedOutput("", "a.ts\nb.ts\n");
    expect(result).toEqual([
      { status: "?", path: "a.ts" },
      { status: "?", path: "b.ts" },
    ]);
  });
});
