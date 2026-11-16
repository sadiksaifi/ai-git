import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getProviderById } from "../registry.ts";
import { getPiSupportedThinkingLevels, parsePiModelsTable, parsePiRpcModels } from "./pi.ts";

const table = `provider        model                 thinking
openai-codex    gpt-5.6-luna          yes
anthropic       claude-haiku-4-5      no
`;

const STANDARD_LEVELS = ["off", "minimal", "low", "medium", "high"];
const ALL_LEVELS = [...STANDARD_LEVELS, "xhigh", "max"];

function rpcResponse(models: unknown[]): string {
  return `${JSON.stringify({
    id: "ai-git-models",
    type: "response",
    command: "get_available_models",
    success: true,
    data: { models },
  })}\n`;
}

describe("getPiSupportedThinkingLevels", () => {
  it("returns only off for non-reasoning models", () => {
    expect(getPiSupportedThinkingLevels({ reasoning: false })).toEqual(["off"]);
  });

  it("returns the standard levels when the model has no level map", () => {
    expect(getPiSupportedThinkingLevels({ reasoning: true })).toEqual(STANDARD_LEVELS);
  });

  it("adds xhigh and max only when the map defines them", () => {
    expect(
      getPiSupportedThinkingLevels({
        reasoning: true,
        thinkingLevelMap: { xhigh: "xhigh", max: "max", minimal: "low" },
      }),
    ).toEqual(ALL_LEVELS);
  });

  it("drops levels mapped to null", () => {
    expect(
      getPiSupportedThinkingLevels({
        reasoning: true,
        thinkingLevelMap: { off: null, xhigh: "xhigh", max: null },
      }),
    ).toEqual(["minimal", "low", "medium", "high", "xhigh"]);
  });
});

describe("parsePiRpcModels", () => {
  it("expands each model into its supported thinking levels", () => {
    const output = [
      "startup notice",
      rpcResponse([
        {
          provider: "openai-codex",
          id: "gpt-6.1-sol",
          reasoning: true,
          thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
        },
        { provider: "anthropic", id: "claude-haiku-4-5", reasoning: false },
      ]),
    ].join("\n");

    expect(parsePiRpcModels(output)).toEqual([
      { id: "openai-codex/gpt-6.1-sol#minimal", name: "openai-codex/gpt-6.1-sol (minimal)" },
      { id: "openai-codex/gpt-6.1-sol#low", name: "openai-codex/gpt-6.1-sol (low)" },
      { id: "openai-codex/gpt-6.1-sol#medium", name: "openai-codex/gpt-6.1-sol (medium)" },
      { id: "openai-codex/gpt-6.1-sol#high", name: "openai-codex/gpt-6.1-sol (high)" },
      { id: "openai-codex/gpt-6.1-sol#xhigh", name: "openai-codex/gpt-6.1-sol (xhigh)" },
      { id: "openai-codex/gpt-6.1-sol#max", name: "openai-codex/gpt-6.1-sol (max)" },
      { id: "anthropic/claude-haiku-4-5", name: "anthropic/claude-haiku-4-5" },
    ]);
  });

  it("returns null without a successful response", () => {
    expect(parsePiRpcModels("")).toBeNull();
    expect(
      parsePiRpcModels(
        JSON.stringify({ type: "response", command: "get_available_models", success: false }),
      ),
    ).toBeNull();
  });
});

describe("parsePiModelsTable", () => {
  it("offers the standard levels for thinking models and none otherwise", () => {
    expect(parsePiModelsTable(table)).toEqual([
      ...STANDARD_LEVELS.map((level) => ({
        id: `openai-codex/gpt-5.6-luna#${level}`,
        name: `openai-codex/gpt-5.6-luna (${level})`,
      })),
      { id: "anthropic/claude-haiku-4-5", name: "anthropic/claude-haiku-4-5" },
    ]);
  });

  it("parses box-drawn tables", () => {
    const boxed = `│ provider │ model │ thinking │\n├──┼──┼──┤\n│ openai │ gpt-6-luna │ no │`;
    expect(parsePiModelsTable(boxed)).toEqual([
      { id: "openai/gpt-6-luna", name: "openai/gpt-6-luna" },
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
        kill() {},
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

  function mockProcess(stdout: string, stderr = "") {
    const stream = (text: string) =>
      new ReadableStream({
        start(controller) {
          if (text) controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    const stdinWrites: string[] = [];
    return {
      stdinWrites,
      process: {
        stdin: {
          write: (chunk: string) => stdinWrites.push(chunk),
          flush: async () => {},
          end: async () => {},
        },
        stdout: stream(stdout),
        stderr: stream(stderr),
        exited: Promise.resolve(0),
        kill() {},
      },
    };
  }

  it("lists models through RPC mode with the generation isolation flags", async () => {
    const rpc = mockProcess(
      rpcResponse([
        {
          provider: "openai-codex",
          id: "gpt-6-luna",
          reasoning: true,
          thinkingLevelMap: { xhigh: "xhigh" },
        },
      ]),
    );
    (Bun as any).spawn = (cmd: string[], opts: unknown) => {
      spawnCalls.push({ cmd, opts });
      return rpc.process;
    };

    const { piAdapter } = await import("./pi.ts");
    const models = await piAdapter.fetchModels!();

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]!.cmd).toEqual([
      "pi",
      "--mode",
      "rpc",
      "--no-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-session",
    ]);
    expect(JSON.parse(rpc.stdinWrites[0]!)).toEqual({
      id: "ai-git-models",
      type: "get_available_models",
    });
    expect(models.map((model) => model.id)).toEqual([
      ...STANDARD_LEVELS.map((level) => `openai-codex/gpt-6-luna#${level}`),
      "openai-codex/gpt-6-luna#xhigh",
    ]);
  });

  it("falls back to the --list-models table, read from stderr, when RPC fails", async () => {
    (Bun as any).spawn = (cmd: string[], opts: unknown) => {
      spawnCalls.push({ cmd, opts });
      return cmd.includes("rpc") ? mockProcess("").process : mockProcess("", table).process;
    };

    const { piAdapter } = await import("./pi.ts");
    const models = await piAdapter.fetchModels!();

    expect(spawnCalls[1]!.cmd).toEqual(["pi", "--list-models"]);
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
    });
  });
});
