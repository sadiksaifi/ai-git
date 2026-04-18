import { describe, expect, it } from "bun:test";
import {
  getHostBinaryPath,
  getHostCompileTarget,
  getSmokeTestBinaryPath,
  parseBuildOutfile,
  parseBuildTarget,
  shouldSmokeTestBuiltBinary,
} from "./build-artifact.ts";

describe("build artifact helpers", () => {
  it("parses explicit Bun build targets", () => {
    expect(parseBuildTarget(["--target", "bun-linux-x64"])).toBe("bun-linux-x64");
    expect(parseBuildTarget(["--target=bun-linux-arm64"])).toBe("bun-linux-arm64");
    expect(parseBuildTarget(["--outfile", "dist/ai-git", "--target", "bun-darwin-arm64"])).toBe(
      "bun-darwin-arm64",
    );
    expect(parseBuildTarget(["--target=bun-linux-x64", "--target", "bun-darwin-arm64"])).toBe(
      "bun-darwin-arm64",
    );
  });

  it("ignores missing or malformed target flags", () => {
    expect(parseBuildTarget([])).toBeUndefined();
    expect(parseBuildTarget(["--target"])).toBeUndefined();
    expect(parseBuildTarget(["--target="])).toBeUndefined();
    expect(parseBuildTarget(["--target", "--outfile", "dist/ai-git"])).toBeUndefined();
    expect(parseBuildTarget(["--target", "bun-linux-x64", "--target"])).toBeUndefined();
  });

  it("parses explicit Bun build output paths", () => {
    expect(parseBuildOutfile(["--outfile", "dist/ai-git-custom"])).toBe("dist/ai-git-custom");
    expect(parseBuildOutfile(["--outfile=dist/ai-git-custom"])).toBe("dist/ai-git-custom");
    expect(parseBuildOutfile(["--outfile=dist/old", "--outfile", "dist/new"])).toBe("dist/new");
  });

  it("ignores missing or malformed output flags", () => {
    expect(parseBuildOutfile([])).toBeUndefined();
    expect(parseBuildOutfile(["--outfile"])).toBeUndefined();
    expect(parseBuildOutfile(["--outfile="])).toBeUndefined();
    expect(parseBuildOutfile(["--outfile", "--target", "bun-linux-x64"])).toBeUndefined();
    expect(parseBuildOutfile(["--outfile", "dist/ai-git", "--outfile"])).toBeUndefined();
  });

  it("maps host platform and arch to Bun compile targets", () => {
    expect(getHostCompileTarget("darwin", "arm64")).toBe("bun-darwin-arm64");
    expect(getHostCompileTarget("darwin", "x64")).toBe("bun-darwin-x64");
    expect(getHostCompileTarget("linux", "arm64")).toBe("bun-linux-arm64");
    expect(getHostCompileTarget("win32", "x64")).toBe("bun-windows-x64");
  });

  it("returns undefined for unsupported host targets", () => {
    expect(getHostCompileTarget("freebsd", "x64")).toBeUndefined();
    expect(getHostCompileTarget("darwin", "ia32")).toBeUndefined();
  });

  it("smoke-tests host builds only", () => {
    expect(shouldSmokeTestBuiltBinary(undefined, "bun-darwin-arm64")).toBe(true);
    expect(shouldSmokeTestBuiltBinary("bun-darwin-arm64", "bun-darwin-arm64")).toBe(true);
    expect(shouldSmokeTestBuiltBinary("bun-linux-x64", "bun-darwin-arm64")).toBe(false);
    expect(shouldSmokeTestBuiltBinary("bun-linux-x64", undefined)).toBe(false);
  });

  it("uses the right binary path for the host platform", () => {
    expect(getHostBinaryPath("darwin")).toBe("./dist/ai-git");
    expect(getHostBinaryPath("linux")).toBe("./dist/ai-git");
    expect(getHostBinaryPath("win32")).toBe("./dist/ai-git.exe");
    expect(getHostBinaryPath("win32", "dist/custom")).toBe("dist/custom.exe");
    expect(getHostBinaryPath("win32", "dist/custom.exe")).toBe("dist/custom.exe");
  });

  it("resolves the smoke-test binary path from forwarded args", () => {
    expect(getSmokeTestBinaryPath([], "darwin")).toBe("./dist/ai-git");
    expect(getSmokeTestBinaryPath(["--outfile", "dist/ai-git-custom"], "linux")).toBe(
      "dist/ai-git-custom",
    );
    expect(getSmokeTestBinaryPath(["--outfile=dist/ai-git-custom"], "linux")).toBe(
      "dist/ai-git-custom",
    );
    expect(getSmokeTestBinaryPath(["--outfile", "dist/ai-git-custom"], "win32")).toBe(
      "dist/ai-git-custom.exe",
    );
  });
});
