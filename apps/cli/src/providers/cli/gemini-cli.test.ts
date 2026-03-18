import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GEMINI_SETTINGS_FILE, CACHE_DIR } from "../../lib/paths.ts";
import * as path from "node:path";
import { GEMINI_OPTIMIZED_SETTINGS } from "./gemini-cli.ts";

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

describe("geminiCliAdapter.invoke", () => {
  let spawnCalls: { cmd: string[]; opts: { env?: Record<string, string> } }[] = [];
  let originalSpawn: typeof Bun.spawn;
  let writtenFiles: Map<string, string>;

  beforeEach(() => {
    spawnCalls = [];
    writtenFiles = new Map();
    originalSpawn = Bun.spawn;

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

  it("should disable Code Assist endpoint to skip network fetch", async () => {
    const { geminiCliAdapter } = await import("./gemini-cli.ts");
    await geminiCliAdapter.invoke({
      model: "gemini-2.5-flash",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const env = spawnCalls[0]!.opts.env!;
    expect(env.CODE_ASSIST_ENDPOINT).toBe("http://localhost:1");
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
});
