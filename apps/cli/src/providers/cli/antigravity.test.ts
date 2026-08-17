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

  beforeEach(() => {
    originalSpawn = Bun.spawn;
    spawnCalls = [];
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
                models: [
                  { id: "gemini-3.7-flash-low", label: "Gemini 3.7 Flash (Low)" },
                  { id: "future/vendor:model", label: "Opaque Future Model" },
                ],
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
});
