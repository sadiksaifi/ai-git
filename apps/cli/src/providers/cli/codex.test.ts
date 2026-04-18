import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getProviderById, getModelIds } from "../registry.ts";

describe("codexAdapter.invoke", () => {
  let spawnCalls: { cmd: string[]; opts: unknown }[] = [];
  let originalSpawn: typeof Bun.spawn;
  let originalFile: typeof Bun.file;
  let mockCodexConfig: string | null = null;
  let mockCodexConfigError = false;

  beforeEach(() => {
    spawnCalls = [];
    mockCodexConfig = null;
    mockCodexConfigError = false;
    originalSpawn = Bun.spawn;
    originalFile = Bun.file;

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

    (Bun as any).file = () => ({
      exists: async () => mockCodexConfig !== null || mockCodexConfigError,
      text: async () => {
        if (mockCodexConfigError) throw new Error("read failed");
        return mockCodexConfig ?? "";
      },
    });
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
    (Bun as any).file = originalFile;
  });

  it("should disable update check on startup", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    const idx = cmd.indexOf("check_for_update_on_startup=false");
    expect(idx).toBeGreaterThan(0);
    expect(cmd[idx - 1]).toBe("-c");
  });

  it("should disable codex hooks and persistence-related features", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;

    expect(cmd).toContain("codex_hooks");
    expect(cmd[cmd.indexOf("codex_hooks") - 1]).toBe("--disable");

    for (const override of [
      "history.persistence=none",
      "memories.generate_memories=false",
      "memories.use_memories=false",
      "project_doc_max_bytes=0",
      "include_permissions_instructions=false",
      "include_apps_instructions=false",
      "include_environment_context=false",
    ]) {
      const idx = cmd.indexOf(override);
      expect(idx).toBeGreaterThan(0);
      expect(cmd[idx - 1]).toBe("-c");
    }
  });

  it("should disable shell_snapshot feature", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
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
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    const idx = cmd.indexOf("analytics.enabled=false");
    expect(idx).toBeGreaterThan(0);
    expect(cmd[idx - 1]).toBe("-c");
  });

  it("should disable configured MCP servers", async () => {
    mockCodexConfig = `
[mcp_servers.sentry]
command = "bunx"

[mcp_servers."server-name"]
command = "bunx"
`;

    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;

    for (const override of [
      "mcp_servers.sentry.enabled=false",
      "mcp_servers.server-name.enabled=false",
    ]) {
      const idx = cmd.indexOf(override);
      expect(idx).toBeGreaterThan(0);
      expect(cmd[idx - 1]).toBe("-c");
    }
  });

  it("should skip MCP server ids that cannot be safely overridden", async () => {
    mockCodexConfig = `
[mcp_servers."docs.api"]
command = "bunx"
`;

    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    expect(cmd).not.toContain("mcp_servers.docs.api.enabled=false");
  });

  it("should ignore unreadable Codex config files", async () => {
    mockCodexConfigError = true;

    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    expect(cmd.some((arg) => arg.startsWith("mcp_servers."))).toBe(false);
  });

  it("should place all config overrides before exec", async () => {
    mockCodexConfig = `
[mcp_servers.sentry]
command = "bunx"
`;

    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-5.4-medium",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    const execIdx = cmd.indexOf("exec");
    expect(execIdx).toBeGreaterThan(0);

    for (const override of [
      "check_for_update_on_startup=false",
      "analytics.enabled=false",
      "history.persistence=none",
      "memories.generate_memories=false",
      "memories.use_memories=false",
      "project_doc_max_bytes=0",
      "include_permissions_instructions=false",
      "include_apps_instructions=false",
      "include_environment_context=false",
      "mcp_servers.sentry.enabled=false",
      'web_search="disabled"',
    ]) {
      expect(cmd.indexOf(override)).toBeLessThan(execIdx);
    }
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
