import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getProviderById } from "../registry.ts";
import { parsePiModelsTable } from "./pi.ts";

const table = `provider        model                 thinking
openai-codex    gpt-5.6-luna          yes
anthropic       claude-haiku-4-5      no
`;

describe("parsePiModelsTable", () => {
  function levelsFor(model: string, provider = "test"): string[] {
    return parsePiModelsTable(`provider  model  thinking\n${provider}  ${model}  yes`)
      .map((entry) => entry.id.split("#")[1])
      .filter((level): level is string => Boolean(level));
  }

  it("combines provider/model rows and expands all supported GPT-5.6 levels", async () => {
    expect(parsePiModelsTable(table)).toEqual([
      { id: "openai-codex/gpt-5.6-luna#off", name: "openai-codex/gpt-5.6-luna (off)" },
      { id: "openai-codex/gpt-5.6-luna#minimal", name: "openai-codex/gpt-5.6-luna (minimal)" },
      { id: "openai-codex/gpt-5.6-luna#low", name: "openai-codex/gpt-5.6-luna (low)" },
      { id: "openai-codex/gpt-5.6-luna#medium", name: "openai-codex/gpt-5.6-luna (medium)" },
      { id: "openai-codex/gpt-5.6-luna#high", name: "openai-codex/gpt-5.6-luna (high)" },
      { id: "openai-codex/gpt-5.6-luna#xhigh", name: "openai-codex/gpt-5.6-luna (xhigh)" },
      { id: "openai-codex/gpt-5.6-luna#max", name: "openai-codex/gpt-5.6-luna (max)" },
      { id: "anthropic/claude-haiku-4-5", name: "anthropic/claude-haiku-4-5" },
    ]);
  });

  it.each(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"])(
    "%s supports xhigh and max",
    (model) => {
      expect(levelsFor(model, "openai-codex")).toEqual([
        "off",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ]);
    },
  );

  it("GPT-5.5 supports xhigh without max", () => {
    expect(levelsFor("gpt-5.5", "openai-codex")).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it.each(["gpt-5.3-codex-spark", "gpt-5.4", "gpt-5.4-mini"])(
    "%s keeps its supported xhigh level",
    (model) => {
      expect(levelsFor(model, "openai-codex")).toEqual([
        "off",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    },
  );

  it("respects OpenCode GPT level exclusions", () => {
    expect(levelsFor("gpt-5.4", "opencode")).toEqual(["low", "medium", "high", "xhigh"]);
    expect(levelsFor("gpt-5.4-pro", "opencode")).toEqual(["medium", "high", "xhigh"]);
  });

  it.each(["claude-opus-5", "claude-sonnet-5", "claude-opus-4-7", "claude-opus-4-8"])(
    "%s supports xhigh and max",
    (model) => {
      expect(levelsFor(model, "anthropic")).toEqual([
        "off",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ]);
    },
  );

  it("Claude Fable 5 supports xhigh and max but cannot disable thinking", () => {
    expect(levelsFor("claude-fable-5", "anthropic")).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it.each(["claude-opus-4-6", "claude-sonnet-4-6"])("%s supports max without xhigh", (model) => {
    expect(levelsFor(model, "anthropic")).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "max",
    ]);
  });

  it("matches region-qualified Claude families without dropping xhigh or max", () => {
    expect(levelsFor("us.anthropic.claude-opus-4-7", "amazon-bedrock")).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("matches nested provider-qualified Claude families", () => {
    expect(levelsFor("anthropic/claude-opus-5", "openrouter")).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("DeepSeek V4 Pro exposes only its effective levels", () => {
    expect(levelsFor("deepseek-v4-pro", "deepseek")).toEqual(["off", "high", "max"]);
  });

  it("DeepSeek V4 Flash exposes only its effective levels", () => {
    expect(levelsFor("deepseek-v4-flash", "deepseek")).toEqual(["off", "low", "high", "max"]);
  });

  it("preserves provider-specific DeepSeek V4 capabilities", () => {
    expect(levelsFor("deepseek-v4-flash", "opencode")).toEqual(["high", "max"]);
    expect(levelsFor("deepseek-v4-pro", "opencode")).toEqual(["high", "max"]);
    expect(levelsFor("deepseek-v4-flash", "opencode-go")).toEqual(["off", "high", "max"]);
    expect(levelsFor("deepseek-v4-pro", "opencode-go")).toEqual(["off", "high", "max"]);
    expect(levelsFor("deepseek/deepseek-v4-pro", "openrouter")).toEqual(["off", "high", "xhigh"]);
  });

  it("ordinary thinking models expose the standard levels without xhigh or max", () => {
    expect(levelsFor("ordinary-reasoning-model")).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
  });
});

describe("piAdapter.invoke", () => {
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
            controller.enqueue(new TextEncoder().encode("feat: pi"));
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

  it("splits # variants into --model and --thinking and disables tools/resources", async () => {
    const { piAdapter } = await import("./pi.ts");

    const result = await piAdapter.invoke({
      model: "openai-codex/gpt-5.6-luna#minimal",
      system: "system rules",
      prompt: "diff context",
    });

    expect(result).toBe("feat: pi");
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]!.cmd).toEqual([
      "pi",
      "--model",
      "openai-codex/gpt-5.6-luna",
      "--thinking",
      "minimal",
      "--system-prompt",
      "system rules",
      "--no-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-session",
      "-p",
      "diff context",
    ]);
  });

  it("reads model listing output from stderr when Pi prints tables there", async () => {
    (Bun as any).spawn = (cmd: string[], opts: unknown) => {
      spawnCalls.push({ cmd, opts });
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(table));
            controller.close();
          },
        }),
        exited: Promise.resolve(0),
      };
    };

    const { piAdapter } = await import("./pi.ts");
    const models = await piAdapter.fetchModels!();

    expect(spawnCalls[0]!.cmd).toEqual(["pi", "--list-models"]);
    expect(models[0]).toEqual({
      id: "openai-codex/gpt-5.6-luna#off",
      name: "openai-codex/gpt-5.6-luna (off)",
    });
  });
});

describe("pi registry", () => {
  it("registers Pi as a live-model CLI provider", () => {
    expect(getProviderById("pi")).toMatchObject({
      id: "pi",
      name: "Pi",
      mode: "cli",
      binary: "pi",
      dynamicModels: true,
    });
  });
});
