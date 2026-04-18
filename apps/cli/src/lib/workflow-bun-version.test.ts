import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { readPinnedBunVersion } from "./workflow-test-helpers.ts";

const ROOT_DIR = resolve(import.meta.dir, "../../../../");
const WORKFLOW_PATHS = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-web.yml",
  ".github/workflows/release.yml",
].map((path) => resolve(ROOT_DIR, path));

describe("workflow Bun versions", () => {
  it("pins every setup-bun step to the repo packageManager version", async () => {
    const pinnedBunVersion = await readPinnedBunVersion();

    for (const workflowPath of WORKFLOW_PATHS) {
      const workflow = await Bun.file(workflowPath).text();
      expect(workflow).toContain("setup-bun");
      expect(workflow).toContain(`bun-version: ${pinnedBunVersion}`);
      expect(workflow).not.toContain("bun-version: latest");
    }
  });
});
