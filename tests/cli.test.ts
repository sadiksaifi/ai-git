import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "bun";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

const CLI_PATH = path.resolve(__dirname, "../src/index.ts");
const CONFIG_DIR = path.join(os.homedir(), ".config", "ai-git");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Test configuration to bypass setup wizard
const TEST_CONFIG = {
  mode: "cli",
  provider: "claude",
  model: "haiku",
};

describe("ai-git CLI", () => {
  let originalConfig: string | null = null;

  // Save original config and set up test config
  beforeAll(async () => {
    // Save original config if it exists
    try {
      originalConfig = fs.readFileSync(CONFIG_FILE, "utf-8");
    } catch {
      originalConfig = null;
    }

    // Create test config to bypass setup wizard
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(TEST_CONFIG, null, 2));
  });

  // Restore original config after tests
  afterAll(() => {
    if (originalConfig !== null) {
      fs.writeFileSync(CONFIG_FILE, originalConfig);
    } else {
      // Remove test config if there was no original
      try {
        fs.unlinkSync(CONFIG_FILE);
      } catch {
        // Ignore if file doesn't exist
      }
    }
  });

  it("should print help with --help flag", async () => {
    const proc = spawn(["bun", "run", CLI_PATH, "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    expect(output).toContain("Usage:");
    expect(output).toContain("Options:");
    expect(proc.exitCode).toBe(0);
  });

  it("should print version with --version flag", async () => {
    const proc = spawn(["bun", "run", CLI_PATH, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    expect(output).toMatch(/\d+\.\d+\.\d+/);
    expect(proc.exitCode).toBe(0);
  });

  it("should fail if not in a git repository", async () => {
    // Create a temp dir that is definitely not a git repo
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ai-git-test-no-git-")
    );

    const proc = spawn(["bun", "run", CLI_PATH], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    expect(stderr).toContain("Error: Not a git repository.");
    expect(proc.exitCode).toBe(1);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should run dry-run correctly", async () => {
    // We can run this in the current repo since it is a git repo
    const proc = spawn(["bun", "run", CLI_PATH, "--dry-run", "-a"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(stdout).toContain("Dry Run: Full Prompt");
    expect(stdout).toContain(
      'Role: Expert Developer & Git Commit Specialist (Conventional Commits v1.0.0)'
    );
    expect(proc.exitCode).toBe(0);
  });
});
