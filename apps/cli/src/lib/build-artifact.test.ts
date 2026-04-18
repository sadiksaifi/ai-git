import { describe, expect, it } from "bun:test";
import {
  getHostBinaryPath,
  getHostCompileTarget,
  parseBuildTarget,
  shouldSmokeTestBuiltBinary,
} from "./build-artifact.ts";

describe("build artifact helpers", () => {
  it("parses explicit Bun build targets", () => {
    expect(parseBuildTarget(["--target", "bun-linux-x64"])).toBe("bun-linux-x64");
    expect(parseBuildTarget(["--outfile", "dist/ai-git", "--target", "bun-darwin-arm64"])).toBe(
      "bun-darwin-arm64",
    );
  });

  it("ignores missing or malformed target flags", () => {
    expect(parseBuildTarget([])).toBeUndefined();
    expect(parseBuildTarget(["--target"])).toBeUndefined();
    expect(parseBuildTarget(["--target", "--outfile", "dist/ai-git"])).toBeUndefined();
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
  });
});
