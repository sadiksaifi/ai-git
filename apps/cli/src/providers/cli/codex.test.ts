import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getProviderById, getModelIds } from "../registry.ts";

describe("codexAdapter.invoke", () => {
  let spawnCalls: { cmd: string[]; opts: unknown }[] = [];
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    spawnCalls = [];
    originalSpawn = Bun.spawn;

    (Bun as any).spawn = (cmd: string[], opts: unknown) => {
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

  it("should disable update check on startup", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    const cmd = spawnCalls[0]!.cmd;
    const idx = cmd.indexOf("check_for_update_on_startup=false");
    expect(idx).toBeGreaterThan(0);
    expect(cmd[idx - 1]).toBe("-c");
  });

  it("should disable shell_snapshot feature", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    const cmd = spawnCalls[0]!.cmd;
    const disableIdx = cmd.indexOf("shell_snapshot");
    expect(disableIdx).toBeGreaterThan(0);
    expect(cmd[disableIdx - 1]).toBe("--disable");
  });

  it("should disable analytics", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    const cmd = spawnCalls[0]!.cmd;
    const idx = cmd.indexOf("analytics.enabled=false");
    expect(idx).toBeGreaterThan(0);
    expect(cmd[idx - 1]).toBe("-c");
  });
});

describe("codex registry", () => {
  it("should have effort variants for gpt-5.4", () => {
    const modelIds = getModelIds("codex");
    expect(modelIds).toContain("gpt-5.4-low");
    expect(modelIds).toContain("gpt-5.4-medium");
    expect(modelIds).toContain("gpt-5.4-high");
  });

  it("should have a recommended model", () => {
    const provider = getProviderById("codex");
    const recommended = provider?.models.find((m) => m.isRecommended);
    expect(recommended).toBeDefined();
  });
});
