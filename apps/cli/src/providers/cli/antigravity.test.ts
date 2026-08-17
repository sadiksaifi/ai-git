import { afterEach, beforeEach, describe, expect, it } from "bun:test";

function stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

describe("antigravityAdapter.fetchModels", () => {
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: string[][];
  let modelRows: Array<{ id: string; label: string }>;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
    spawnCalls = [];
    modelRows = [
      { id: "gemini-3.7-flash-low", label: "Gemini 3.7 Flash (Low)" },
      { id: "future/vendor:model", label: "Opaque Future Model" },
    ];
    (Bun as any).spawn = (command: string[]) => {
      spawnCalls.push(command);
      if (command[1] === "--version") {
        return {
          stdout: stream("1.1.13\n"),
          stderr: stream(""),
          exited: Promise.resolve(0),
        };
      }
      return {
        stdout: stream(
          JSON.stringify({
            status: "SUCCESS",
            error: null,
            command: {
              data: {
                models: modelRows,
              },
            },
          }),
        ),
        stderr: stream(""),
        exited: Promise.resolve(0),
      };
    };
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
  });

  it("discovers account models with global output flags and preserves opaque metadata", async () => {
    const { antigravityAdapter } = await import("./antigravity.ts");

    await expect(antigravityAdapter.fetchModels!()).resolves.toEqual([
      {
        id: "gemini-3.7-flash-low",
        name: "Gemini 3.7 Flash (Low)",
        isRecommended: true,
      },
      { id: "future/vendor:model", name: "Opaque Future Model" },
    ]);
    expect(spawnCalls).toEqual([
      ["agy", "--version"],
      ["agy", "--output-format", "json", "models"],
    ]);
  });

  it("ranks Gemini families numerically and recommends the newest Flash Low model", async () => {
    modelRows = [
      { id: "future/vendor:model", label: "Opaque Future Model" },
      { id: "gemini-3.9-flash-low", label: "Gemini 3.9 Flash (Low)" },
      { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)" },
      { id: "gemini-3.10-flash-high", label: "Gemini 3.10 Flash (High)" },
      { id: "gemini-4.0-pro-high", label: "Gemini 4.0 Pro (High)" },
      { id: "gemini-3.10-flash-low", label: "Gemini 3.10 Flash (Low)" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
      { id: "gemini-3.10-flash-medium", label: "Gemini 3.10 Flash (Medium)" },
      { id: "gemini-4.0-pro-low", label: "Gemini 4.0 Pro (Low)" },
      { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
    ];
    const { antigravityAdapter } = await import("./antigravity.ts");

    const models = await antigravityAdapter.fetchModels!();

    expect(models.map((model) => model.id)).toEqual([
      "gemini-3.10-flash-low",
      "gemini-3.10-flash-medium",
      "gemini-3.10-flash-high",
      "gemini-3.9-flash-low",
      "gemini-4.0-pro-low",
      "gemini-4.0-pro-high",
      "claude-sonnet-4-6",
      "claude-opus-4-6-thinking",
      "future/vendor:model",
      "gpt-oss-120b-medium",
    ]);
    expect(models.filter((model) => model.isRecommended).map((model) => model.id)).toEqual([
      "gemini-3.10-flash-low",
    ]);
  });
});
