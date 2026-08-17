import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getProviderById, getModelIds } from "../registry.ts";
import { parseModelId } from "./codex.ts";

describe("parseModelId", () => {
  it.each(["low", "medium", "high", "xhigh", "max"] as const)(
    "splits a valid trailing %s effort from a hyphenated base model",
    (effort) => {
      expect(parseModelId(`gpt-5.6-codex-family-${effort}`)).toEqual({
        model: "gpt-5.6-codex-family",
        effort,
      });
    },
  );

  it("keeps an invalid trailing effort as part of the model ID", () => {
    expect(parseModelId("gpt-5.6-sol-ultra")).toEqual({
      model: "gpt-5.6-sol-ultra",
      effort: "medium",
    });
  });
});

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
      model: "gpt-5.6-terra-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    const idx = cmd.indexOf("check_for_update_on_startup=false");
    expect(idx).toBeGreaterThan(0);
    expect(cmd[idx - 1]).toBe("-c");
  });

  it("should disable shell_snapshot feature", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.6-terra-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    const disableIdx = cmd.indexOf("shell_snapshot");
    expect(disableIdx).toBeGreaterThan(0);
    expect(cmd[disableIdx - 1]).toBe("--disable");
  });

  it("should disable analytics", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.6-terra-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    const idx = cmd.indexOf("analytics.enabled=false");
    expect(idx).toBeGreaterThan(0);
    expect(cmd[idx - 1]).toBe("-c");
  });

  it("should run Codex in a stripped-down headless mode", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.6-terra-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;

    for (const feature of [
      "shell_tool",
      "shell_snapshot",
      "apps",
      "codex_hooks",
      "multi_agent",
      "personality",
      "plugins",
    ]) {
      const idx = cmd.indexOf(feature);
      expect(idx).toBeGreaterThan(0);
      expect(cmd[idx - 1]).toBe("--disable");
    }

    for (const config of ['history.persistence="none"', "mcp_servers={}"]) {
      const idx = cmd.indexOf(config);
      expect(idx).toBeGreaterThan(0);
      expect(cmd[idx - 1]).toBe("-c");
    }

    const execIdx = cmd.indexOf("exec");
    expect(execIdx).toBeGreaterThan(0);
    expect(cmd.slice(execIdx)).toEqual([
      "exec",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "test prompt",
    ]);
  });

  it("passes max as the selected base model reasoning effort", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.6-sol-max",
      system: "test system",
      prompt: "test prompt",
    });

    const cmd = spawnCalls[0]!.cmd;
    expect(cmd[cmd.indexOf("--model") + 1]).toBe("gpt-5.6-sol");
    expect(cmd).toContain("model_reasoning_effort=max");
    expect(cmd).not.toContain("ultra");
  });
});

describe("codex registry", () => {
  it("offers exactly the current supported model and effort variants", () => {
    expect(getModelIds("codex")).toEqual([
      "gpt-5.6-luna-low",
      "gpt-5.6-luna-medium",
      "gpt-5.6-luna-high",
      "gpt-5.6-luna-xhigh",
      "gpt-5.6-luna-max",
      "gpt-5.6-terra-low",
      "gpt-5.6-terra-medium",
      "gpt-5.6-terra-high",
      "gpt-5.6-terra-xhigh",
      "gpt-5.6-terra-max",
      "gpt-5.6-sol-low",
      "gpt-5.6-sol-medium",
      "gpt-5.6-sol-high",
      "gpt-5.6-sol-xhigh",
      "gpt-5.6-sol-max",
      "gpt-5.5-low",
      "gpt-5.5-medium",
      "gpt-5.5-high",
      "gpt-5.5-xhigh",
      "gpt-5.3-codex-spark-low",
      "gpt-5.3-codex-spark-medium",
      "gpt-5.3-codex-spark-high",
      "gpt-5.3-codex-spark-xhigh",
    ]);
  });

  it("keeps Codex recommended with Luna Low as its sole recommended model", () => {
    const provider = getProviderById("codex");
    expect(provider?.isRecommended).toBe(true);
    expect(
      provider?.models.filter((model) => model.isRecommended).map((model) => model.id),
    ).toEqual(["gpt-5.6-luna-low"]);
  });
});
