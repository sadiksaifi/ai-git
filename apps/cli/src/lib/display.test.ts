import { describe, test, expect } from "bun:test";
import { formatFileList } from "./display.ts";
import type { FileWithStatus } from "./git.ts";

describe("formatFileList", () => {
  test("formats files with colored status indicators", () => {
    const files: FileWithStatus[] = [
      { status: "M", path: "src/config.ts" },
      { status: "A", path: "src/new-file.ts" },
      { status: "D", path: "src/old-file.ts" },
    ];
    const result = formatFileList(files);
    // Should contain all file paths
    expect(result).toContain("src/config.ts");
    expect(result).toContain("src/new-file.ts");
    expect(result).toContain("src/old-file.ts");
    // Should contain status indicators
    expect(result).toContain("M");
    expect(result).toContain("A");
    expect(result).toContain("D");
  });

  test("returns empty string for empty file list", () => {
    expect(formatFileList([])).toBe("");
  });

  test("handles untracked files with ? status", () => {
    const files: FileWithStatus[] = [
      { status: "?", path: "new-untracked.ts" },
    ];
    const result = formatFileList(files);
    expect(result).toContain("?");
    expect(result).toContain("new-untracked.ts");
  });

  test("handles renamed files with R status", () => {
    const files: FileWithStatus[] = [
      { status: "R", path: "renamed-file.ts" },
    ];
    const result = formatFileList(files);
    expect(result).toContain("R");
    expect(result).toContain("renamed-file.ts");
  });
});
