import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { getProviderById } from "../registry.ts";
import {
  buildOpenCodeConfig,
  isSupportedOpenCodeVersion,
  opencodeAdapter,
  parseOpenCodeModelList,
  parseOpenCodeRunEvents,
  parseOpenCodeVersion,
} from "./opencode.ts";

/** Trimmed `opencode api model.list` output from OpenCode 2.3.0. */
const modelList = JSON.stringify({
  location: { directory: "/tmp/x" },
  data: [
    {
      id: "inkling-2-small-free",
      providerID: "opencode",
      name: "Inkling 2 Small Free",
      status: "active",
      enabled: true,
      capabilities: { output: ["text"] },
      variants: [
        { id: "none", settings: { reasoningEffort: "none" } },
        { id: "low", settings: { reasoningEffort: "low" } },
      ],
    },
    {
      id: "big-pickle",
      providerID: "opencode",
      name: "Big Pickle",
      status: "active",
      enabled: true,
      capabilities: { output: ["text"] },
      variants: [],
    },
    {
      id: "qwen3.8-27b",
      providerID: "local",
      capabilities: { output: ["text"] },
    },
    { id: "old", providerID: "opencode", status: "deprecated", variants: [] },
    { id: "off", providerID: "opencode", enabled: false, variants: [] },
    {
      id: "painter",
      providerID: "opencode",
      capabilities: { output: ["image"] },
      variants: [],
    },
  ],
});

describe("parseOpenCodeModelList", () => {
  it("expands variants with # and keeps models without variants as provider/model", () => {
    expect(parseOpenCodeModelList(modelList)).toEqual([
      { id: "opencode/inkling-2-small-free#none", name: "Inkling 2 Small Free (none)" },
      { id: "opencode/inkling-2-small-free#low", name: "Inkling 2 Small Free (low)" },
      { id: "opencode/big-pickle", name: "Big Pickle" },
      { id: "local/qwen3.8-27b", name: "local/qwen3.8-27b" },
    ]);
  });

  it("returns an empty list for output that is not the model list", () => {
    expect(parseOpenCodeModelList("HTTP 404 Not Found")).toEqual([]);
    expect(parseOpenCodeModelList(JSON.stringify({ error: "x" }))).toEqual([]);
  });
});

describe("parseOpenCodeRunEvents", () => {
  it("joins text events and ignores step and tool events", () => {
    const output = [
      JSON.stringify({ type: "step_start", part: { type: "step-start" } }),
      JSON.stringify({ type: "text", part: { type: "text", text: "feat: add" } }),
      JSON.stringify({ type: "tool_use", part: { type: "tool", tool: "shell" } }),
      JSON.stringify({ type: "text", part: { type: "text", text: " provider" } }),
      "not json",
    ].join("\n");

    expect(parseOpenCodeRunEvents(output)).toEqual({ text: "feat: add provider", errors: [] });
  });

  it("collects error event messages", () => {
    const output = JSON.stringify({
      type: "error",
      error: { type: "provider.free-limit", message: "Free usage limit reached." },
    });

    expect(parseOpenCodeRunEvents(output)).toEqual({
      text: "",
      errors: ["Free usage limit reached."],
    });
  });
});

describe("OpenCode version gate", () => {
  it("parses `opencode --version` output", () => {
    expect(parseOpenCodeVersion("opencode v2.3.0\n")).toEqual([2, 3, 0]);
    expect(parseOpenCodeVersion("1.19.5")).toEqual([1, 19, 5]);
    expect(parseOpenCodeVersion("unknown")).toBeNull();
  });

  it("requires 2.2.6, the first release with `opencode run --archived`", () => {
    expect(isSupportedOpenCodeVersion([1, 19, 5])).toBe(false);
    expect(isSupportedOpenCodeVersion([2, 2, 5])).toBe(false);
    expect(isSupportedOpenCodeVersion([2, 2, 6])).toBe(true);
    expect(isSupportedOpenCodeVersion([2, 3, 0])).toBe(true);
  });
});

describe("buildOpenCodeConfig", () => {
  it("turns off user plugins and instruction files and denies every tool", () => {
    expect(buildOpenCodeConfig("system rules")).toEqual({
      plugins: ["-*", "opencode.*", "-opencode.config.instruction"],
      agents: {
        "ai-git": {
          system: "system rules",
          mode: "primary",
          hidden: true,
          permissions: [{ action: "*", resource: "*", effect: "deny" }],
        },
      },
    });
  });

  it("omits the agent when only listing models", () => {
    expect(buildOpenCodeConfig()).toEqual({
      plugins: ["-*", "opencode.*", "-opencode.config.instruction"],
    });
  });
});

interface SpawnCall {
  cmd: string[];
  opts: { cwd?: string; stdin?: unknown; env?: Record<string, string> };
}

function stream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text) controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function mockProcess(stdout: string, exitCode = 0, stderr = "") {
  return { stdout: stream(stdout), stderr: stream(stderr), exited: Promise.resolve(exitCode) };
}

describe("opencodeAdapter", () => {
  let spawnCalls: SpawnCall[] = [];
  let originalSpawn: typeof Bun.spawn;
  let version = "opencode v2.3.0\n";
  let runOutput = "";
  let runExitCode = 0;
  let cwdExistedDuringRun = false;

  beforeEach(() => {
    spawnCalls = [];
    version = "opencode v2.3.0\n";
    runOutput = JSON.stringify({ type: "text", part: { text: "feat: opencode" } });
    runExitCode = 0;
    cwdExistedDuringRun = false;
    originalSpawn = Bun.spawn;
    (Bun as any).spawn = (cmd: string[], opts: SpawnCall["opts"]) => {
      spawnCalls.push({ cmd, opts });
      if (cmd.includes("--version")) return mockProcess(version);
      if (cmd[1] === "api") return mockProcess(modelList);
      cwdExistedDuringRun = !!opts.cwd && existsSync(opts.cwd);
      return mockProcess(runOutput, runExitCode);
    };
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
  });

  it("runs a standalone, archived session with the prompt on stdin", async () => {
    const result = await opencodeAdapter.invoke({
      model: "opencode/inkling-2-small-free#low",
      system: "system rules",
      prompt: "--diff context",
    });

    expect(result).toBe("feat: opencode");
    expect(spawnCalls.map((call) => call.cmd[1])).toEqual(["--version", "run"]);

    const run = spawnCalls[1]!;
    expect(run.cmd).toEqual([
      "opencode",
      "run",
      "--standalone",
      "--archived",
      "--title",
      "ai-git",
      "--model",
      "opencode/inkling-2-small-free#low",
      "--agent",
      "ai-git",
      "--format",
      "json",
    ]);
    expect(await new Response(run.opts.stdin as Blob).text()).toBe("--diff context");
    expect(JSON.parse(run.opts.env!.OPENCODE_CONFIG_CONTENT!)).toEqual(
      buildOpenCodeConfig("system rules"),
    );
    expect(run.opts.env!.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("1");
  });

  it("runs in an empty temporary directory, with PWD set to it, that is removed afterwards", async () => {
    await opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" });

    const cwd = spawnCalls[1]!.opts.cwd!;
    expect(cwd).not.toBe(process.cwd());
    // OpenCode reads its working directory from PWD, so an inherited PWD would
    // put the session in the user's repository.
    expect(spawnCalls[1]!.opts.env!.PWD).toBe(cwd);
    expect(cwdExistedDuringRun).toBe(true);
    expect(existsSync(cwd)).toBe(false);
  });

  it("reports OpenCode error events even when the exit code is 0", async () => {
    runOutput = JSON.stringify({ type: "error", error: { message: "Free usage limit reached." } });

    await expect(
      opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" }),
    ).rejects.toThrow("OpenCode CLI error (exit code 0):\nFree usage limit reached.");
  });

  it("refuses to run OpenCode 1.x, which ignores the deny-all agent config", async () => {
    version = "1.19.5\n";

    await expect(
      opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" }),
    ).rejects.toThrow("OpenCode 2.2.6 or newer is required. Found 1.19.5.");
    expect(spawnCalls).toHaveLength(1);
  });

  it("lists models through the API with the same isolation as generation", async () => {
    const models = await opencodeAdapter.fetchModels!();

    const list = spawnCalls[1]!;
    expect(list.cmd).toEqual(["opencode", "api", "model.list", "--standalone"]);
    expect(list.opts.env!.PWD).toBe(list.opts.cwd);
    expect(JSON.parse(list.opts.env!.OPENCODE_CONFIG_CONTENT!)).toEqual(buildOpenCodeConfig());
    expect(list.opts.env!.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("1");
    expect(models[0]).toEqual({
      id: "opencode/inkling-2-small-free#none",
      name: "Inkling 2 Small Free (none)",
    });
  });
});

describe("opencode registry", () => {
  it("registers OpenCode as a CLI provider", () => {
    expect(getProviderById("opencode")).toMatchObject({
      id: "opencode",
      name: "OpenCode",
      mode: "cli",
      binary: "opencode",
    });
  });
});
