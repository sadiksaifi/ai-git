import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { parseClaudeModelId } from "./claude-code.ts";
import { getProviderById, getModelIds } from "../registry.ts";

describe("parseClaudeModelId", () => {
  it("should parse sonnet-low", () => {
    expect(parseClaudeModelId("sonnet-low")).toEqual({
      model: "sonnet",
      effort: "low",
    });
  });

  it("should parse sonnet-medium", () => {
    expect(parseClaudeModelId("sonnet-medium")).toEqual({
      model: "sonnet",
      effort: "medium",
    });
  });

  it("should parse sonnet-high", () => {
    expect(parseClaudeModelId("sonnet-high")).toEqual({
      model: "sonnet",
      effort: "high",
    });
  });

  it("should parse opus-low", () => {
    expect(parseClaudeModelId("opus-low")).toEqual({
      model: "opus",
      effort: "low",
    });
  });

  it("should parse opus-high", () => {
    expect(parseClaudeModelId("opus-high")).toEqual({
      model: "opus",
      effort: "high",
    });
  });

  it.each(["xhigh", "max"] as const)("parses Fable %s effort", (effort) => {
    expect(parseClaudeModelId(`fable-${effort}`)).toEqual({ model: "fable", effort });
  });

  it.each(["sonnet", "opus"] as const)("parses %s max effort", (model) => {
    expect(parseClaudeModelId(`${model}-max`)).toEqual({ model, effort: "max" });
  });

  it("should return plain model without effort for sonnet", () => {
    expect(parseClaudeModelId("sonnet")).toEqual({
      model: "sonnet",
    });
  });

  it("should return plain model without effort for haiku", () => {
    expect(parseClaudeModelId("haiku")).toEqual({
      model: "haiku",
    });
  });

  it("should return plain model without effort for opus", () => {
    expect(parseClaudeModelId("opus")).toEqual({
      model: "opus",
    });
  });
});

describe("claudeCodeAdapter.invoke", () => {
  let spawnCalls: { cmd: string[]; opts: unknown }[] = [];
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    spawnCalls = [];
    originalSpawn = Bun.spawn;

    // Mock Bun.spawn to capture arguments
    (Bun as any).spawn = (cmd: string[], opts: unknown) => {
      spawnCalls.push({ cmd, opts });
      // Return a mock process
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

  it("should pass --effort flag for effort-based model IDs", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "sonnet-high",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    expect(cmd).toContain("--effort");
    expect(cmd).toContain("high");
    // Base model should be "sonnet", not "sonnet-high"
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("sonnet");
  });

  it("should NOT pass --effort flag for plain model IDs", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "sonnet",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    expect(cmd).not.toContain("--effort");
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("sonnet");
  });

  it("should NOT pass --effort flag for haiku", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "haiku",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    expect(cmd).not.toContain("--effort");
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("haiku");
  });

  it("passes xhigh and max effort selections to Claude Code", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");

    await claudeCodeAdapter.invoke({
      model: "fable-xhigh",
      system: "test system",
      prompt: "test prompt",
    });
    await claudeCodeAdapter.invoke({
      model: "opus-max",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls[0]!.cmd).toContain("xhigh");
    expect(spawnCalls[0]!.cmd[spawnCalls[0]!.cmd.indexOf("--model") + 1]).toBe("fable");
    expect(spawnCalls[1]!.cmd).toContain("max");
    expect(spawnCalls[1]!.cmd[spawnCalls[1]!.cmd.indexOf("--model") + 1]).toBe("opus");
  });
});

describe("claude-code registry", () => {
  it("offers exactly the documented rolling aliases and effort variants", () => {
    expect(getModelIds("claude-code")).toEqual([
      "haiku",
      "fable-low",
      "fable-medium",
      "fable-high",
      "fable-xhigh",
      "fable-max",
      "sonnet-low",
      "sonnet-medium",
      "sonnet-high",
      "sonnet-xhigh",
      "sonnet-max",
      "opus-low",
      "opus-medium",
      "opus-high",
      "opus-xhigh",
      "opus-max",
    ]);
  });

  it("should include effort variants for sonnet", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).toContain("sonnet-low");
    expect(modelIds).toContain("sonnet-medium");
    expect(modelIds).toContain("sonnet-high");
  });

  it("should include effort variants for opus", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).toContain("opus-low");
    expect(modelIds).toContain("opus-medium");
    expect(modelIds).toContain("opus-high");
  });

  it("should include haiku (no effort levels)", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).toContain("haiku");
  });

  it("should NOT include plain sonnet/opus model IDs", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).not.toContain("sonnet");
    expect(modelIds).not.toContain("opus");
  });

  it("should NOT include effort variants for haiku", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).not.toContain("haiku-low");
    expect(modelIds).not.toContain("haiku-medium");
    expect(modelIds).not.toContain("haiku-high");
  });

  it("should have haiku as the recommended model", () => {
    const provider = getProviderById("claude-code");
    const recommendedModel = provider?.models.find((m) => m.isRecommended);
    expect(recommendedModel?.id).toBe("haiku");
  });
});
