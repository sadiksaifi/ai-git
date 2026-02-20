import { describe, it, expect, afterEach } from "bun:test";
import { spawn } from "bun";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const CLI_PATH = path.resolve(__dirname, "index.ts");
const TEST_CONFIG = {
  provider: "claude-code",
  model: "haiku",
};

interface RunCLIOptions {
  cwd?: string;
  homeDir: string;
  pathEnv?: string;
  extraEnv?: Record<string, string>;
}

interface RunCLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const tempPaths: string[] = [];

function trackTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

function cleanOutput(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

function createTestHome(config: Record<string, string> = TEST_CONFIG): string {
  const homeDir = trackTempDir("ai-git-home-");
  const configDir = path.join(homeDir, ".config", "ai-git");
  const configFile = path.join(configDir, "config.json");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  return homeDir;
}

function runGit(cwd: string, args: string[]): void {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (proc.exitCode !== 0) {
    const stderr = Buffer.from(proc.stderr).toString();
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

function createGitRepo(): string {
  const repoDir = trackTempDir("ai-git-repo-");
  runGit(repoDir, ["init"]);
  runGit(repoDir, ["config", "user.email", "test@example.com"]);
  runGit(repoDir, ["config", "user.name", "AI Git Test"]);

  const trackedFile = path.join(repoDir, "README.md");
  fs.writeFileSync(trackedFile, "initial\n");
  runGit(repoDir, ["add", "README.md"]);
  runGit(repoDir, ["commit", "-m", "chore: init"]);

  return repoDir;
}

async function createPathWithoutProviderCLI(): Promise<string> {
  const binDir = trackTempDir("ai-git-bin-");
  const gitPath = await Bun.which("git");

  if (!gitPath) {
    throw new Error("git binary not found");
  }

  fs.symlinkSync(gitPath, path.join(binDir, "git"));

  const whichPath = await Bun.which("which");
  if (whichPath) {
    fs.symlinkSync(whichPath, path.join(binDir, "which"));
  }

  return binDir;
}

async function runCLI(
  args: string[],
  options: RunCLIOptions
): Promise<RunCLIResult> {
  const proc = spawn([process.execPath, "run", CLI_PATH, ...args], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: options.homeDir,
      XDG_CONFIG_HOME: path.join(options.homeDir, ".config"),
      XDG_CACHE_HOME: path.join(options.homeDir, ".cache"),
      AI_GIT_DISABLE_UPDATE_CHECK: "1",
      NO_COLOR: "1",
      CI: "1",
      PATH: options.pathEnv ?? process.env.PATH ?? "",
      ...(options.extraEnv ?? {}),
    },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    stdout: cleanOutput(stdout),
    stderr: cleanOutput(stderr),
    exitCode,
  };
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("ai-git CLI", () => {
  it("should print help with --help flag", async () => {
    const homeDir = createTestHome();
    const noProviderPath = await createPathWithoutProviderCLI();

    const result = await runCLI(["--help"], {
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("Options:");
    expect(result.exitCode).toBe(0);
  });

  it("should print version with --version flag", async () => {
    const homeDir = createTestHome();
    const noProviderPath = await createPathWithoutProviderCLI();

    const result = await runCLI(["--version"], {
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stdout).toMatch(/\d+\.\d+\.\d+(?:-dev(?:\.\d+)?)?/);
    expect(result.exitCode).toBe(0);
  });

  it("should fail if not in a git repository before provider checks", async () => {
    const homeDir = createTestHome();
    const noProviderPath = await createPathWithoutProviderCLI();
    const nonRepoDir = trackTempDir("ai-git-no-repo-");

    const result = await runCLI([], {
      cwd: nonRepoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stderr).toContain("Error: Not a git repository.");
    expect(result.stderr).not.toContain("CLI is not installed");
    expect(result.exitCode).toBe(1);
  });

  it("should run dry-run correctly without provider availability", async () => {
    const homeDir = createTestHome();
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    fs.writeFileSync(path.join(repoDir, "README.md"), "updated\n");

    const result = await runCLI(["--dry-run", "-a"], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stdout).toContain("DRY RUN: SYSTEM PROMPT");
    expect(result.stdout).toContain("DRY RUN: USER PROMPT");
    expect(result.stdout).toContain(
      'You generate git commit messages following Conventional Commits v1.0.0.'
    );
    expect(result.stderr).not.toContain("CLI is not installed");
    expect(result.exitCode).toBe(0);
  });

  it("should fail in non-dry-run mode when provider CLI is missing", async () => {
    const homeDir = createTestHome();
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    const result = await runCLI([], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stderr).toContain("Error: 'claude' CLI is not installed.");
    expect(result.exitCode).toBe(1);
  });

  it("should fail fast when configured API model is deprecated", async () => {
    const homeDir = createTestHome({
      provider: "openai",
      model: "o1-preview",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    const catalogOverrideFile = path.join(trackTempDir("ai-git-catalog-"), "catalog.json");
    fs.writeFileSync(
      catalogOverrideFile,
      JSON.stringify(
        {
          anthropic: { models: {} },
          openai: {
            models: {
              "o1-preview": {
                name: "o1 Preview",
                status: "deprecated",
                reasoning: true,
                tool_call: true,
                release_date: "2024-09-12",
                last_updated: "2024-09-12",
              },
            },
          },
          google: { models: {} },
        },
        null,
        2
      )
    );

    const result = await runCLI([], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
      extraEnv: {
        AI_GIT_MODEL_CATALOG_OVERRIDE: catalogOverrideFile,
      },
    });

    expect(result.stderr).toContain("is deprecated");
    expect(result.stderr).toContain("ai-git --setup");
    expect(result.exitCode).toBe(1);
  });

  it("should auto-migrate legacy claude-code config and run dry-run", async () => {
    // Create a config with the old plain "sonnet" model ID
    const homeDir = createTestHome({
      provider: "claude-code",
      model: "sonnet",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    fs.writeFileSync(path.join(repoDir, "README.md"), "updated\n");

    const result = await runCLI(["--dry-run", "-a"], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    // Should work (migration converts "sonnet" → "sonnet-low")
    expect(result.stdout).toContain("DRY RUN: SYSTEM PROMPT");
    expect(result.exitCode).toBe(0);

    // Verify config was migrated on disk
    const configPath = path.join(homeDir, ".config", "ai-git", "config.json");
    const migratedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(migratedConfig.model).toBe("sonnet-low");

    // Verify backup file was created
    const configDir = path.dirname(configPath);
    const configBase = path.basename(configPath);
    const backupFile = fs.readdirSync(configDir).find(
      (f) => f.startsWith(`${configBase}.`) && f.endsWith(".bak")
    );
    expect(backupFile).toBeDefined();
    const backupConfig = JSON.parse(
      fs.readFileSync(path.join(configDir, backupFile!), "utf8")
    );
    expect(backupConfig.model).toBe("sonnet");
  });

  it("should work with effort-based model IDs in dry-run", async () => {
    const homeDir = createTestHome({
      provider: "claude-code",
      model: "sonnet-high",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    fs.writeFileSync(path.join(repoDir, "README.md"), "updated\n");

    const result = await runCLI(["--dry-run", "-a"], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stdout).toContain("DRY RUN: SYSTEM PROMPT");
    expect(result.exitCode).toBe(0);
  });

  it("should work with haiku model ID (no effort)", async () => {
    const homeDir = createTestHome({
      provider: "claude-code",
      model: "haiku",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    fs.writeFileSync(path.join(repoDir, "README.md"), "updated\n");

    const result = await runCLI(["--dry-run", "-a"], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stdout).toContain("DRY RUN: SYSTEM PROMPT");
    expect(result.exitCode).toBe(0);
  });

  it("should reject invalid effort model like haiku-high", async () => {
    const homeDir = createTestHome({
      provider: "claude-code",
      model: "haiku-high",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    const result = await runCLI([], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    // Config validation should fail because haiku-high is not in the registry,
    // triggering the setup wizard instead of proceeding normally
    expect(result.stdout).toContain("Select AI provider");
    expect(result.exitCode).toBe(0);
  });
});
