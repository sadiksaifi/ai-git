import { describe, test, expect } from "bun:test";
import { detectPlatform } from "./upgrade.ts";

describe("detectPlatform", () => {
  test("returns PlatformInfo on supported platform", () => {
    const result = detectPlatform();
    if (process.platform === "darwin" || process.platform === "linux") {
      expect(result).not.toBeNull();
      expect(result!.os).toBe(process.platform === "darwin" ? "darwin" : "linux");
      expect(["arm64", "x64"]).toContain(result!.arch);
      expect(result!.archiveName).toMatch(/^ai-git-.+\.tar\.gz$/);
    }
  });

  test("archiveName follows naming convention", () => {
    const result = detectPlatform();
    if (result) {
      expect(result.archiveName).toBe(
        `ai-git-${result.os}-${result.arch}.tar.gz`,
      );
    }
  });
});
