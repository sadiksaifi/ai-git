import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dir, "../../../../");
const ROOT_PACKAGE_JSON_PATH = resolve(ROOT_DIR, "package.json");
const WORKFLOW_PATHS = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-web.yml",
  ".github/workflows/release.yml",
].map((path) => resolve(ROOT_DIR, path));

function readPinnedBunVersion(): string {
  const packageJson = JSON.parse(readFileSync(ROOT_PACKAGE_JSON_PATH, "utf8")) as {
    packageManager?: string;
  };
  const match = packageJson.packageManager?.match(/^bun@(.+)$/);

  if (!match?.[1]) {
    throw new Error("Root package.json must pin Bun via packageManager");
  }

  return match[1];
}

describe("workflow Bun versions", () => {
  it("pins every setup-bun step to the repo packageManager version", () => {
    const pinnedBunVersion = readPinnedBunVersion();

    for (const workflowPath of WORKFLOW_PATHS) {
      const workflow = readFileSync(workflowPath, "utf8");
      expect(workflow).toContain("setup-bun");
      expect(workflow).toContain(`bun-version: ${pinnedBunVersion}`);
      expect(workflow).not.toContain("bun-version: latest");
    }
  });
});
