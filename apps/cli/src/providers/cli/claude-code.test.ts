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
    const cmd = spawnCalls[0].cmd;
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
    const cmd = spawnCalls[0].cmd;
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
    const cmd = spawnCalls[0].cmd;
    expect(cmd).not.toContain("--effort");
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("haiku");
  });
});

describe("claude-code registry", () => {
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

  it("should keep backward-compatible plain model IDs", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).toContain("sonnet");
    expect(modelIds).toContain("haiku");
    expect(modelIds).toContain("opus");
  });

  it("should NOT include effort variants for haiku", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).not.toContain("haiku-low");
    expect(modelIds).not.toContain("haiku-medium");
    expect(modelIds).not.toContain("haiku-high");
  });

  it("should have sonnet-low as the default model", () => {
    const provider = getProviderById("claude-code");
    const defaultModel = provider?.models.find((m) => m.isDefault);
    expect(defaultModel?.id).toBe("sonnet-low");
  });
});
