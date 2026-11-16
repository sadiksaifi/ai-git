import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getProviderById } from "../registry.ts";
import { parseCodexModelCatalog, parseModelId } from "./codex.ts";

describe("parseModelId", () => {
  it("splits '<model>#<effort>' on the last #", () => {
    expect(parseModelId("gpt-6.1-sol#high")).toEqual({ model: "gpt-6.1-sol", effort: "high" });
  });

  it("passes through effort names it does not know", () => {
    expect(parseModelId("gpt-7-nova#turbo")).toEqual({ model: "gpt-7-nova", effort: "turbo" });
  });

  it.each(["low", "medium", "high", "xhigh", "max"] as const)(
    "parses legacy '-%s' suffixes from older configs",
    (effort) => {
      expect(parseModelId(`gpt-5.6-codex-family-${effort}`)).toEqual({
        model: "gpt-5.6-codex-family",
        effort,
      });
    },
  );

  it("leaves IDs without an effort to the model default", () => {
    expect(parseModelId("gpt-5.6-sol-ultra")).toEqual({ model: "gpt-5.6-sol-ultra" });
    expect(parseModelId("gpt-6.1-sol")).toEqual({ model: "gpt-6.1-sol" });
  });
});

describe("parseCodexModelCatalog", () => {
  const catalog = JSON.stringify({
    models: [
      {
        slug: "gpt-6-luna",
        display_name: "GPT-6-Luna",
        visibility: "list",
        priority: 3,
        supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }],
      },
      {
        slug: "codex-auto-review",
        display_name: "Codex Auto Review",
        visibility: "hide",
        priority: 2,
        supported_reasoning_levels: [{ effort: "low" }],
      },
      {
        slug: "gpt-6.1-sol",
        display_name: "GPT-6.1-Sol",
        visibility: "list",
        priority: 1,
        supported_reasoning_levels: [{ effort: "low" }, { effort: "max" }, { effort: "ultra" }],
      },
      { slug: "gpt-plain", display_name: "GPT Plain", visibility: "list", priority: 4 },
    ],
  });

  it("lists visible models in priority order with one option per effort", () => {
    expect(parseCodexModelCatalog(catalog)).toEqual([
      { id: "gpt-6.1-sol#low", name: "GPT-6.1-Sol (low)", isRecommended: true },
      { id: "gpt-6.1-sol#max", name: "GPT-6.1-Sol (max)" },
      { id: "gpt-6-luna#low", name: "GPT-6-Luna (low)" },
      { id: "gpt-6-luna#high", name: "GPT-6-Luna (high)" },
      { id: "gpt-plain", name: "GPT Plain" },
    ]);
  });

  it("returns no models for invalid output", () => {
    expect(parseCodexModelCatalog("not json")).toEqual([]);
    expect(parseCodexModelCatalog(JSON.stringify({ models: "nope" }))).toEqual([]);
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

  it("omits the reasoning effort override when the model ID has none", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-6.1-sol",
      system: "test system",
      prompt: "test prompt",
    });

    const cmd = spawnCalls[0]!.cmd;
    expect(cmd[cmd.indexOf("--model") + 1]).toBe("gpt-6.1-sol");
    expect(cmd.some((arg) => arg.startsWith("model_reasoning_effort="))).toBe(false);
  });

  it("passes the # effort as the reasoning effort", async () => {
    const { codexAdapter } = await import("./codex.ts");
    await codexAdapter.invoke({
      model: "gpt-6.1-sol#high",
      system: "test system",
      prompt: "test prompt",
    });

    const cmd = spawnCalls[0]!.cmd;
    expect(cmd[cmd.indexOf("--model") + 1]).toBe("gpt-6.1-sol");
    expect(cmd).toContain("model_reasoning_effort=high");
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

describe("codexAdapter.fetchModels", () => {
  let spawnCalls: string[][] = [];
  let originalSpawn: typeof Bun.spawn;

  function processResult(stdout: string, exitCode: number, stderr = "") {
    const stream = (text: string) =>
      new ReadableStream({
        start(controller) {
          if (text) controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    return { stdout: stream(stdout), stderr: stream(stderr), exited: Promise.resolve(exitCode) };
  }

  const listing = JSON.stringify({
    models: [
      {
        slug: "gpt-6-luna",
        display_name: "GPT-6-Luna",
        visibility: "list",
        supported_reasoning_levels: [{ effort: "low" }],
      },
    ],
  });

  beforeEach(() => {
    spawnCalls = [];
    originalSpawn = Bun.spawn;
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
  });

  it("reads the live catalog from `codex debug models`", async () => {
    (Bun as any).spawn = (cmd: string[]) => {
      spawnCalls.push(cmd);
      return processResult(listing, 0);
    };

    const { codexAdapter } = await import("./codex.ts");
    const models = await codexAdapter.fetchModels!();

    expect(spawnCalls).toEqual([["codex", "debug", "models"]]);
    expect(models).toEqual([
      { id: "gpt-6-luna#low", name: "GPT-6-Luna (low)", isRecommended: true },
    ]);
  });

  it("falls back to the bundled catalog when the refresh fails", async () => {
    (Bun as any).spawn = (cmd: string[]) => {
      spawnCalls.push(cmd);
      return cmd.includes("--bundled")
        ? processResult(listing, 0)
        : processResult("", 1, "offline");
    };

    const { codexAdapter } = await import("./codex.ts");
    const models = await codexAdapter.fetchModels!();

    expect(spawnCalls).toEqual([
      ["codex", "debug", "models"],
      ["codex", "debug", "models", "--bundled"],
    ]);
    expect(models.map((model) => model.id)).toEqual(["gpt-6-luna#low"]);
  });

  it("reports the CLI error when both listings fail", async () => {
    (Bun as any).spawn = (cmd: string[]) => {
      spawnCalls.push(cmd);
      return processResult("", 2, "unrecognized subcommand 'debug'");
    };

    const { codexAdapter } = await import("./codex.ts");
    await expect(codexAdapter.fetchModels!()).rejects.toThrow("unrecognized subcommand 'debug'");
  });
});

describe("codex registry", () => {
  it("keeps Codex as a recommended provider", () => {
    expect(getProviderById("codex")?.isRecommended).toBe(true);
  });
});
