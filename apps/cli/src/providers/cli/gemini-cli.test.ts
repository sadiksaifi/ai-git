import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GEMINI_SETTINGS_FILE, CACHE_DIR } from "../../lib/paths.ts";
import * as path from "node:path";
import { GEMINI_OPTIMIZED_SETTINGS, ensureGeminiSettings } from "./gemini-cli.ts";

describe("GEMINI_OPTIMIZED_SETTINGS", () => {
  it("should disable auto-update", () => {
    expect(GEMINI_OPTIMIZED_SETTINGS.general.enableAutoUpdate).toBe(false);
    expect(GEMINI_OPTIMIZED_SETTINGS.general.enableAutoUpdateNotification).toBe(false);
  });

  it("should disable context directory scanning", () => {
    expect(GEMINI_OPTIMIZED_SETTINGS.context.includeDirectoryTree).toBe(false);
    expect(GEMINI_OPTIMIZED_SETTINGS.context.discoveryMaxDirs).toBe(0);
  });

  it("should disable telemetry and usage stats", () => {
    expect(GEMINI_OPTIMIZED_SETTINGS.telemetry.enabled).toBe(false);
    expect(GEMINI_OPTIMIZED_SETTINGS.privacy.usageStatisticsEnabled).toBe(false);
  });

  it("should disable skills and hooks", () => {
    expect(GEMINI_OPTIMIZED_SETTINGS.skills.enabled).toBe(false);
    expect(GEMINI_OPTIMIZED_SETTINGS.hooksConfig.enabled).toBe(false);
  });
});

describe("ensureGeminiSettings", () => {
  let originalFile: typeof Bun.file;
  let originalWrite: typeof Bun.write;
  let fileContents: Map<string, string>;
  let fileExistsMap: Map<string, boolean>;

  beforeEach(() => {
    fileContents = new Map();
    fileExistsMap = new Map();
    originalFile = Bun.file;
    originalWrite = Bun.write;

    (Bun as any).file = (filePath: string) => ({
      exists: async () => fileExistsMap.get(filePath) ?? false,
      text: async () => {
        const content = fileContents.get(filePath);
        if (content === undefined) throw new Error("ENOENT");
        return content;
      },
    });

    (Bun as any).write = async (filePath: string, content: string) => {
      fileContents.set(filePath, content);
    };
  });

  afterEach(() => {
    (Bun as any).file = originalFile;
    (Bun as any).write = originalWrite;
  });

  it("should rewrite when file content differs from current settings", async () => {
    fileExistsMap.set(GEMINI_SETTINGS_FILE, true);
    fileContents.set(GEMINI_SETTINGS_FILE, JSON.stringify({ old: true }));

    await ensureGeminiSettings();

    expect(fileContents.get(GEMINI_SETTINGS_FILE)).toBe(
      JSON.stringify(GEMINI_OPTIMIZED_SETTINGS, null, 2),
    );
  });

  it("should rewrite when file contains invalid JSON", async () => {
    fileExistsMap.set(GEMINI_SETTINGS_FILE, true);
    fileContents.set(GEMINI_SETTINGS_FILE, "not valid json{{{");

    await ensureGeminiSettings();

    expect(fileContents.get(GEMINI_SETTINGS_FILE)).toBe(
      JSON.stringify(GEMINI_OPTIMIZED_SETTINGS, null, 2),
    );
  });

  it("should not throw when write fails (read-only filesystem)", async () => {
    fileExistsMap.set(GEMINI_SETTINGS_FILE, false);
    (Bun as any).write = async () => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    };

    // Should not throw
    await ensureGeminiSettings();
  });

  it("should skip write when content already matches", async () => {
    const expected = JSON.stringify(GEMINI_OPTIMIZED_SETTINGS, null, 2);
    fileExistsMap.set(GEMINI_SETTINGS_FILE, true);
    fileContents.set(GEMINI_SETTINGS_FILE, expected);

    let writeCalled = false;
    (Bun as any).write = async () => {
      writeCalled = true;
    };

    await ensureGeminiSettings();

    expect(writeCalled).toBe(false);
  });
});

describe("geminiCliAdapter.invoke", () => {
  let spawnCalls: { cmd: string[]; opts: { env?: Record<string, string> } }[] = [];
  let writtenPaths: string[] = [];
  let originalSpawn: typeof Bun.spawn;
  let originalFile: typeof Bun.file;
  let originalWrite: typeof Bun.write;

  beforeEach(() => {
    spawnCalls = [];
    writtenPaths = [];
    originalSpawn = Bun.spawn;
    originalFile = Bun.file;
    originalWrite = Bun.write;

    (Bun as any).file = (filePath: string) => ({
      exists: async () => true,
      text: async () => JSON.stringify(GEMINI_OPTIMIZED_SETTINGS, null, 2),
    });

    (Bun as any).write = async (filePath: string, content: string) => {
      writtenPaths.push(filePath);
    };

    (Bun as any).spawn = (cmd: string[], opts: any) => {
      spawnCalls.push({ cmd, opts });
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("feat: test commit"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        exited: Promise.resolve(0),
      };
    };
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
    (Bun as any).file = originalFile;
    (Bun as any).write = originalWrite;
  });

  it("should set GEMINI_CLI_SYSTEM_SETTINGS_PATH in spawn env", async () => {
    const { geminiCliAdapter } = await import("./gemini-cli.ts");
    await geminiCliAdapter.invoke({
      model: "gemini-2.5-flash",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const env = spawnCalls[0]!.opts.env!;
    expect(env.GEMINI_CLI_SYSTEM_SETTINGS_PATH).toBe(GEMINI_SETTINGS_FILE);
  });

  it("should set NODE_COMPILE_CACHE for bytecode caching", async () => {
    const { geminiCliAdapter } = await import("./gemini-cli.ts");
    await geminiCliAdapter.invoke({
      model: "gemini-2.5-flash",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const env = spawnCalls[0]!.opts.env!;
    expect(env.NODE_COMPILE_CACHE).toBe(path.join(CACHE_DIR, "gemini-compile-cache"));
  });

  it("should respect existing GEMINI_CLI_SYSTEM_SETTINGS_PATH from process.env", async () => {
    const externalPath = "/etc/gemini/managed-settings.json";
    process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = externalPath;

    try {
      const { geminiCliAdapter } = await import("./gemini-cli.ts");
      await geminiCliAdapter.invoke({
        model: "gemini-2.5-flash",
        system: "test system",
        prompt: "test prompt",
      });

      expect(spawnCalls).toHaveLength(1);
      const env = spawnCalls[0]!.opts.env!;
      expect(env.GEMINI_CLI_SYSTEM_SETTINGS_PATH).toBe(externalPath);
    } finally {
      delete process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
    }
  });

  it("should still set GEMINI_SYSTEM_MD in spawn env", async () => {
    const { geminiCliAdapter } = await import("./gemini-cli.ts");
    await geminiCliAdapter.invoke({
      model: "gemini-2.5-flash",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const env = spawnCalls[0]!.opts.env!;
    expect(env.GEMINI_SYSTEM_MD).toBeDefined();
  });

  it("should only write the temp system prompt file (no real filesystem side-effects)", async () => {
    const { geminiCliAdapter } = await import("./gemini-cli.ts");
    await geminiCliAdapter.invoke({
      model: "gemini-2.5-flash",
      system: "test system",
      prompt: "test prompt",
    });

    // Only the temp system prompt file should be written (settings file is up-to-date via mock)
    expect(writtenPaths).toHaveLength(1);
    expect(writtenPaths[0]).toContain("ai-git-system-");
  });
});
