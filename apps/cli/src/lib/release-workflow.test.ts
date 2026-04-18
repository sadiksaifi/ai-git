import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { readPinnedBunVersion } from "./workflow-test-helpers.ts";

const ROOT_DIR = resolve(import.meta.dir, "../../../../");
const RELEASE_WORKFLOW_PATH = resolve(ROOT_DIR, ".github/workflows/release.yml");

type WorkflowStep = {
  name?: string;
  run?: string;
};

type ReleaseMatrixEntry = {
  target: string;
  runner: string;
  binary_name: string;
};

type ReleaseWorkflow = {
  jobs?: {
    "verify-release-binaries"?: {
      strategy?: {
        matrix?: {
          include?: ReleaseMatrixEntry[];
        };
      };
      steps?: WorkflowStep[];
    };
    release?: {
      needs?: string | string[];
      steps?: WorkflowStep[];
    };
  };
};

async function readReleaseWorkflow(): Promise<ReleaseWorkflow> {
  return Bun.YAML.parse(await Bun.file(RELEASE_WORKFLOW_PATH).text()) as ReleaseWorkflow;
}

describe("release workflow", () => {
  it("pins Bun to the repo packageManager version", async () => {
    const workflow = await Bun.file(RELEASE_WORKFLOW_PATH).text();
    const pinnedBunVersion = await readPinnedBunVersion();

    expect(workflow).toContain("uses: oven-sh/setup-bun@v2");
    expect(workflow).toContain(`bun-version: ${pinnedBunVersion}`);
    expect(workflow).not.toContain("bun-version: latest");
  });

  it("verifies every published release target on a matching runner", async () => {
    const workflow = await readReleaseWorkflow();
    const verifyJob = workflow.jobs?.["verify-release-binaries"];
    const releaseJob = workflow.jobs?.release;

    expect(verifyJob).toBeDefined();
    expect(verifyJob?.strategy?.matrix?.include).toEqual([
      { target: "bun-darwin-arm64", runner: "macos-latest", binary_name: "ai-git" },
      { target: "bun-darwin-x64", runner: "macos-15-intel", binary_name: "ai-git" },
      { target: "bun-linux-arm64", runner: "ubuntu-24.04-arm", binary_name: "ai-git" },
      { target: "bun-linux-x64", runner: "ubuntu-latest", binary_name: "ai-git" },
      { target: "bun-windows-arm64", runner: "windows-11-arm", binary_name: "ai-git.exe" },
      { target: "bun-windows-x64", runner: "windows-latest", binary_name: "ai-git.exe" },
    ]);

    const verifyInstallStep = verifyJob?.steps?.find(
      (step) => step.name === "Install dependencies",
    );
    const verifyBuildStep = verifyJob?.steps?.find(
      (step) => step.name === "Build and smoke test compiled binary",
    );

    expect(verifyInstallStep?.run).toBe("bun install --frozen-lockfile");
    expect(verifyBuildStep?.run).toContain('bun run build --target "${{ matrix.target }}"');
    expect(verifyBuildStep?.run).toContain('test -f "dist/${{ matrix.binary_name }}"');
    expect(verifyBuildStep?.run).toContain('"./dist/${{ matrix.binary_name }}" --help > /dev/null');
    expect(releaseJob?.needs).toBe("verify-release-binaries");
  });
});
