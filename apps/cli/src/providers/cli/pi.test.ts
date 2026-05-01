import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getProviderById } from "../registry.ts";

const table = `provider        model                 thinking
openai-codex    gpt-5.4-mini          yes
anthropic       claude-haiku-4-5       no
openai-codex    gpt-5.2-codex         yes
`;

describe("parsePiModelsTable", () => {
  it("combines provider/model rows and expands thinking variants", async () => {
    const { parsePiModelsTable } = await import("./pi.ts");

    expect(parsePiModelsTable(table)).toEqual([
      { id: "openai-codex/gpt-5.4-mini#minimal", name: "openai-codex/gpt-5.4-mini (minimal)" },
      { id: "openai-codex/gpt-5.4-mini#low", name: "openai-codex/gpt-5.4-mini (low)" },
      { id: "openai-codex/gpt-5.4-mini#medium", name: "openai-codex/gpt-5.4-mini (medium)" },
      { id: "openai-codex/gpt-5.4-mini#high", name: "openai-codex/gpt-5.4-mini (high)" },
      { id: "openai-codex/gpt-5.4-mini#xhigh", name: "openai-codex/gpt-5.4-mini (xhigh)" },
      { id: "anthropic/claude-haiku-4-5", name: "anthropic/claude-haiku-4-5" },
      { id: "openai-codex/gpt-5.2-codex#minimal", name: "openai-codex/gpt-5.2-codex (minimal)" },
      { id: "openai-codex/gpt-5.2-codex#low", name: "openai-codex/gpt-5.2-codex (low)" },
      { id: "openai-codex/gpt-5.2-codex#medium", name: "openai-codex/gpt-5.2-codex (medium)" },
      { id: "openai-codex/gpt-5.2-codex#high", name: "openai-codex/gpt-5.2-codex (high)" },
      { id: "openai-codex/gpt-5.2-codex#xhigh", name: "openai-codex/gpt-5.2-codex (xhigh)" },
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
      model: "openai-codex/gpt-5.4-mini#minimal",
      system: "system rules",
      prompt: "diff context",
    });

    expect(result).toBe("feat: pi");
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]!.cmd).toEqual([
      "pi",
      "--model",
      "openai-codex/gpt-5.4-mini",
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
      id: "openai-codex/gpt-5.4-mini#minimal",
      name: "openai-codex/gpt-5.4-mini (minimal)",
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
