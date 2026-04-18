import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dir, "../../../../");
const RELEASE_WORKFLOW_PATH = resolve(ROOT_DIR, ".github/workflows/release.yml");
const ROOT_PACKAGE_JSON_PATH = resolve(ROOT_DIR, "package.json");

function readPinnedBunVersion(): string {
  const packageJson = JSON.parse(readFileSync(ROOT_PACKAGE_JSON_PATH, "utf8")) as {
    packageManager?: string;
  };
  const packageManager = packageJson.packageManager ?? "";
  const match = packageManager.match(/^bun@(.+)$/);

  if (!match?.[1]) {
    throw new Error("Root package.json must pin Bun via packageManager");
  }

  return match[1];
}

describe("release workflow", () => {
  it("pins Bun to the repo packageManager version", () => {
    const workflow = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
    const pinnedBunVersion = readPinnedBunVersion();

    expect(workflow).toContain("uses: oven-sh/setup-bun@v1");
    expect(workflow).toContain(`bun-version: ${pinnedBunVersion}`);
    expect(workflow).not.toContain("bun-version: latest");
  });

  it("smoke-tests the host Linux release binary after build", () => {
    const workflow = readFileSync(RELEASE_WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("./dist/ai-git --help > /dev/null");
  });
});
