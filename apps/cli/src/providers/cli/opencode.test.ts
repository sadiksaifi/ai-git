import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getProviderById } from "../registry.ts";

const verboseModels = `opencode/gpt-5-nano
{
  "name": "GPT-5 Nano",
  "variants": {
    "minimal": {},
    "high": {}
  }
}
anthropic/claude-haiku
{
  "name": "Claude Haiku",
  "variants": {}
}
`;

describe("parseOpenCodeModelsVerbose", () => {
  it("flattens runtime variants using # and keeps base models without variants", async () => {
    const { parseOpenCodeModelsVerbose } = await import("./opencode.ts");

    expect(parseOpenCodeModelsVerbose(verboseModels)).toEqual([
      { id: "opencode/gpt-5-nano#minimal", name: "GPT-5 Nano (minimal)" },
      { id: "opencode/gpt-5-nano#high", name: "GPT-5 Nano (high)" },
      { id: "anthropic/claude-haiku", name: "Claude Haiku" },
    ]);
  });
});

describe("parseOpenCodeJsonText", () => {
  it("concatenates text events and ignores non-text events", async () => {
    const { parseOpenCodeJsonText } = await import("./opencode.ts");
    const output = [
      JSON.stringify({ type: "start" }),
      JSON.stringify({ type: "text", part: { text: "feat: add" } }),
      JSON.stringify({ type: "text", part: { text: " provider" } }),
    ].join("\n");

    expect(parseOpenCodeJsonText(output)).toBe("feat: add provider");
  });
});

describe("opencodeAdapter.invoke", () => {
  let spawnCalls: { cmd: string[]; opts: { env?: Record<string, string> } }[] = [];
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    spawnCalls = [];
    originalSpawn = Bun.spawn;
    (Bun as any).spawn = (cmd: string[], opts: { env?: Record<string, string> }) => {
      spawnCalls.push({ cmd, opts });
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ type: "text", part: { text: "feat: opencode" } }),
              ),
            );
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

  it("splits # variants into --model and --variant and denies permissions", async () => {
    const { opencodeAdapter } = await import("./opencode.ts");

    const result = await opencodeAdapter.invoke({
      model: "opencode/gpt-5-nano#minimal",
      system: "system rules",
      prompt: "diff context",
    });

    expect(result).toBe("feat: opencode");
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]!.cmd).toEqual([
      "opencode",
      "run",
      "--pure",
      "--model",
      "opencode/gpt-5-nano",
      "--variant",
      "minimal",
      "--agent",
      "ai-git",
      "--format",
      "json",
      "diff context",
    ]);

    const config = JSON.parse(spawnCalls[0]!.opts.env!.OPENCODE_CONFIG_CONTENT!);
    expect(config.default_agent).toBe("ai-git");
    expect(config.agent["ai-git"].prompt).toBe("system rules");
    expect(config.agent["ai-git"].permission).toEqual({ "*": "deny" });
  });
});

describe("opencode registry", () => {
  it("registers OpenCode as a live-model CLI provider", () => {
    expect(getProviderById("opencode")).toMatchObject({
      id: "opencode",
      name: "OpenCode",
      mode: "cli",
      binary: "opencode",
      dynamicModels: true,
    });
  });
});
