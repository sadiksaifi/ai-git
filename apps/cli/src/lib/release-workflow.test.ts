import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readPinnedBunVersion } from "./workflow-test-helpers.ts";

const ROOT_DIR = resolve(import.meta.dir, "../../../../");
const RELEASE_WORKFLOW_PATH = resolve(ROOT_DIR, ".github/workflows/release.yml");

describe("release workflow", () => {
  it("pins Bun to the repo packageManager version", () => {
    const workflow = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
    const pinnedBunVersion = readPinnedBunVersion();

    expect(workflow).toContain("uses: oven-sh/setup-bun@v2");
    expect(workflow).toContain(`bun-version: ${pinnedBunVersion}`);
    expect(workflow).not.toContain("bun-version: latest");
  });

  it("verifies every published release target on a matching runner", () => {
    const workflow = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("verify-release-binaries:");
    expect(workflow).toContain("target: bun-darwin-arm64");
    expect(workflow).toContain("runner: macos-latest");
    expect(workflow).toContain("target: bun-darwin-x64");
    expect(workflow).toContain("runner: macos-15-intel");
    expect(workflow).toContain("target: bun-linux-arm64");
    expect(workflow).toContain("runner: ubuntu-24.04-arm");
    expect(workflow).toContain("target: bun-linux-x64");
    expect(workflow).toContain("runner: ubuntu-latest");
    expect(workflow).toContain("target: bun-windows-arm64");
    expect(workflow).toContain("runner: windows-11-arm");
    expect(workflow).toContain("target: bun-windows-x64");
    expect(workflow).toContain("runner: windows-latest");
    expect(workflow).toContain('bun run build --target "${{ matrix.target }}"');
    expect(workflow).not.toContain("./dist/ai-git --help > /dev/null");
    expect(workflow).toContain("needs: verify-release-binaries");
  });
});
