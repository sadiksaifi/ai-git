import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getProviderById } from "../registry.ts";
import {
  buildOpenCodeConfig,
  buildOpenCodeConfigContent,
  findStaleOpenCodeSessions,
  getOpenCodeWorkDirectory,
  isSupportedOpenCodeVersion,
  opencodeAdapter,
  parseOpenCodeAssistantText,
  parseOpenCodeIdle,
  parseOpenCodeModelList,
  parseOpenCodeVersion,
  toOpenCodeSessionModel,
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

describe("parseOpenCodeIdle", () => {
  it("is null while the run is still going", () => {
    expect(parseOpenCodeIdle({ data: [] })).toBeNull();
  });

  it("reports success and failure", () => {
    expect(parseOpenCodeIdle({ data: [{ type: "idle", outcome: "succeeded" }] })).toEqual({});
    expect(
      parseOpenCodeIdle({
        data: [
          {
            type: "idle",
            outcome: "failed",
            error: { type: "provider.no-route", message: "Model unavailable: mock/nope" },
          },
        ],
      }),
    ).toEqual({ error: "Model unavailable: mock/nope" });
  });
});

describe("parseOpenCodeAssistantText", () => {
  it("joins the text parts of the newest assistant message", () => {
    const response = {
      data: [
        {
          type: "assistant",
          content: [
            { type: "reasoning", text: "thinking" },
            { type: "text", text: "feat: add" },
            { type: "text", text: " provider" },
          ],
        },
      ],
    };

    expect(parseOpenCodeAssistantText(response)).toBe("feat: add provider");
    expect(parseOpenCodeAssistantText({ data: [] })).toBe("");
  });
});

describe("findStaleOpenCodeSessions", () => {
  const directory = "/home/u/.cache/ai-git/opencode-workdir";
  const now = 1_000_000_000;
  const session = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    title: "ai-git",
    agent: "ai-git",
    location: { directory },
    time: { created: now - 11 * 60_000 },
    ...overrides,
  });

  it("returns ai-git sessions in the work directory older than ten minutes", () => {
    const response = {
      data: [
        session("ses_old"),
        session("ses_running", { time: { created: now - 60_000 } }),
        session("ses_user", { agent: "build" }),
        session("ses_titled", { title: "Greeting" }),
        session("ses_elsewhere", { location: { directory: "/home/u/project" } }),
      ],
    };

    expect(findStaleOpenCodeSessions(response, directory, now)).toEqual(["ses_old"]);
  });
});

describe("toOpenCodeSessionModel", () => {
  it("splits provider, model, and variant", () => {
    expect(toOpenCodeSessionModel("openai/gpt-6-luna#low")).toEqual({
      providerID: "openai",
      id: "gpt-6-luna",
      variant: "low",
    });
    expect(toOpenCodeSessionModel("openrouter/anthropic/claude-haiku")).toEqual({
      providerID: "openrouter",
      id: "anthropic/claude-haiku",
    });
  });

  it("rejects IDs without a provider", () => {
    expect(() => toOpenCodeSessionModel("gpt-6-luna")).toThrow("provider/model");
  });
});

describe("OpenCode version gate", () => {
  it("parses `opencode --version` output", () => {
    expect(parseOpenCodeVersion("opencode v2.3.0\n")).toEqual([2, 3, 0]);
    expect(parseOpenCodeVersion("1.19.5")).toEqual([1, 19, 5]);
    expect(parseOpenCodeVersion("unknown")).toBeNull();
  });

  it("requires 2.2.6, the oldest release verified with the adapter", () => {
    expect(isSupportedOpenCodeVersion([1, 19, 5])).toBe(false);
    expect(isSupportedOpenCodeVersion([2, 2, 5])).toBe(false);
    expect(isSupportedOpenCodeVersion([2, 2, 6])).toBe(true);
    expect(isSupportedOpenCodeVersion([2, 3, 0])).toBe(true);
  });
});

describe("buildOpenCodeConfig", () => {
  it("blocks user plugins, MCP servers, skills, and instruction files and denies every tool", () => {
    expect(buildOpenCodeConfig("system rules")).toEqual({
      policies: [
        { action: "plugin.use", resource: "*", effect: "deny" },
        { action: "mcp.use", resource: "*", effect: "deny" },
        { action: "skill.use", resource: "*", effect: "deny" },
      ],
      plugins: [
        "-opencode.config.instruction",
        "-opencode.config.reference",
        "-opencode.config.mcp",
      ],
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
      policies: [
        { action: "plugin.use", resource: "*", effect: "deny" },
        { action: "mcp.use", resource: "*", effect: "deny" },
        { action: "skill.use", resource: "*", effect: "deny" },
      ],
      plugins: [
        "-opencode.config.instruction",
        "-opencode.config.reference",
        "-opencode.config.mcp",
      ],
    });
  });
});

describe("buildOpenCodeConfigContent", () => {
  it("keeps {file:...} and {env:...} in the system prompt literal", () => {
    const system = "Use {file:~/.ssh/id_ed25519} and {env:HOME} as context";
    const content = buildOpenCodeConfigContent(system, undefined);

    // OpenCode substitutes these patterns in the raw text before parsing.
    expect(content).not.toContain("{file:");
    expect(content).not.toContain("{env:");
    expect(JSON.parse(content)).toEqual(buildOpenCodeConfig(system));
  });

  it("keeps the user's OPENCODE_CONFIG_CONTENT rules and puts ai-git's last", () => {
    const providerLimit = { action: "provider.use", resource: "work", effect: "deny" };
    const pluginAllow = { action: "plugin.use", resource: "*", effect: "allow" };
    // JSONC, which OpenCode accepts.
    const user = `{
      // local models
      "providers": { "local": { "name": "local" } },
      "policies": [${JSON.stringify(providerLimit)}, ${JSON.stringify(pluginAllow)}],
      "plugins": ["acme.reviewer"],
      "agents": { "reviewer": { "system": "review" } },
    }`;
    const config = JSON.parse(buildOpenCodeConfigContent("rules", user));

    expect(config.providers).toEqual({ local: { name: "local" } });
    // Within one document the last matching policy wins.
    expect(config.policies).toEqual([
      providerLimit,
      pluginAllow,
      ...(buildOpenCodeConfig().policies as unknown[]),
    ]);
    expect(config.plugins).toEqual([
      "acme.reviewer",
      ...(buildOpenCodeConfig().plugins as unknown[]),
    ]);
    expect(Object.keys(config.agents)).toEqual(["reviewer", "ai-git"]);
  });

  it("ignores user content that is not a JSON object", () => {
    expect(JSON.parse(buildOpenCodeConfigContent(undefined, "{ // jsonc"))).toEqual(
      buildOpenCodeConfig(),
    );
  });
});

interface SpawnCall {
  cmd: string[];
  opts: { cwd?: string; env?: Record<string, string> };
}

interface ApiRequest {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
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

/** A process that prints its first stdout line and runs until stdin closes. */
function mockServerProcess(firstLine: string) {
  let resolveExit: (code: number) => void = () => {};
  const exited = new Promise<number>((resolve) => (resolveExit = resolve));
  let stdoutController: ReadableStreamDefaultController<Uint8Array>;
  const process = {
    stdinEnded: false,
    stdin: {
      end: async () => {
        process.stdinEnded = true;
        stdoutController.close();
        resolveExit(0);
      },
    },
    stdout: new ReadableStream<Uint8Array>({
      start(controller) {
        stdoutController = controller;
        controller.enqueue(new TextEncoder().encode(`${firstLine}\n`));
      },
    }),
    stderr: stream(""),
    exited,
    kill(_signal?: string) {
      resolveExit(1);
    },
  };
  return process;
}

describe("opencodeAdapter", () => {
  let spawnCalls: SpawnCall[] = [];
  let apiRequests: ApiRequest[] = [];
  let originalSpawn: typeof Bun.spawn;
  let originalCacheHome: string | undefined;
  let cacheHome: string;
  let api: ReturnType<typeof Bun.serve>;
  let serverProcess: ReturnType<typeof mockServerProcess> | undefined;
  let version = "opencode v2.3.0\n";
  let idle: Record<string, unknown> = { type: "idle", outcome: "succeeded" };
  let pollsBeforeIdle = 0;
  let sessionList: Record<string, unknown>[] = [];

  beforeEach(() => {
    spawnCalls = [];
    apiRequests = [];
    serverProcess = undefined;
    version = "opencode v2.3.0\n";
    idle = { type: "idle", outcome: "succeeded" };
    pollsBeforeIdle = 1;
    sessionList = [];
    originalCacheHome = process.env.XDG_CACHE_HOME;
    cacheHome = mkdtempSync(join(tmpdir(), "ai-git-opencode-test-"));
    process.env.XDG_CACHE_HOME = cacheHome;

    api = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        const url = new URL(request.url);
        const text = await request.text();
        apiRequests.push({
          method: request.method,
          path: url.pathname + url.search,
          headers: request.headers,
          body: text ? JSON.parse(text) : undefined,
        });
        if (request.method === "POST" && url.pathname === "/api/session") {
          return Response.json({ data: { id: "ses_test" } });
        }
        if (request.method === "GET" && url.pathname === "/api/session") {
          const archived = url.searchParams.get("archived") === "true";
          return Response.json({
            data: sessionList.filter(
              (session) => ((session as { archived?: boolean }).archived ?? true) === archived,
            ),
          });
        }
        if (request.method === "GET" && url.searchParams.get("type") === "idle") {
          if (pollsBeforeIdle > 0) {
            pollsBeforeIdle -= 1;
            return Response.json({ data: [] });
          }
          return Response.json({ data: [idle] });
        }
        if (request.method === "GET" && url.searchParams.get("type") === "assistant") {
          return Response.json({
            data: [{ type: "assistant", content: [{ type: "text", text: "feat: opencode" }] }],
          });
        }
        return new Response(null, { status: 204 });
      },
    });

    originalSpawn = Bun.spawn;
    (Bun as any).spawn = (cmd: string[], opts: SpawnCall["opts"]) => {
      spawnCalls.push({ cmd, opts });
      if (cmd.includes("--version")) return mockProcess(version);
      if (cmd[1] === "api") return mockProcess(modelList);
      serverProcess = mockServerProcess(JSON.stringify({ url: api.url.href }));
      return serverProcess;
    };
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
    api.stop(true);
    if (originalCacheHome === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = originalCacheHome;
    rmSync(cacheHome, { recursive: true, force: true });
  });

  it("starts a private server in the ai-git work directory", async () => {
    await opencodeAdapter.invoke({ model: "openai/gpt-6-luna#low", system: "rules", prompt: "p" });

    const serve = spawnCalls[1]!;
    expect(serve.cmd).toEqual([
      "opencode",
      "serve",
      "--stdio",
      "--port",
      "0",
      "--hostname",
      "127.0.0.1",
      "--log-level",
      "error",
    ]);
    const directory = getOpenCodeWorkDirectory();
    expect(directory).toBe(join(cacheHome, "ai-git", "opencode-workdir"));
    expect(serve.opts.cwd).toBe(directory);
    // OpenCode reads its working directory from PWD.
    expect(serve.opts.env!.PWD).toBe(directory);
    expect(serve.opts.env!.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("1");
    expect(JSON.parse(serve.opts.env!.OPENCODE_CONFIG_CONTENT!)).toEqual(
      buildOpenCodeConfig("rules"),
    );
    expect(serve.opts.env!.OPENCODE_PASSWORD!.length).toBeGreaterThan(20);
    // Its own process group, so Ctrl-C reaches ai-git first and the session gets deleted.
    expect((serve.opts as { detached?: boolean }).detached).toBe(process.platform !== "win32");
    expect(serverProcess!.stdinEnded).toBe(true);
  });

  it("runs the prompt in a deny-all session and deletes the session", async () => {
    const result = await opencodeAdapter.invoke({
      model: "openai/gpt-6-luna#low",
      system: "rules",
      prompt: "--diff context",
    });

    expect(result).toBe("feat: opencode");
    const directory = getOpenCodeWorkDirectory();
    expect(apiRequests.map((request) => `${request.method} ${request.path}`)).toEqual([
      `GET /api/session?archived=true&limit=50&directory=${encodeURIComponent(directory)}`,
      `GET /api/session?archived=false&limit=50&directory=${encodeURIComponent(directory)}`,
      "POST /api/session",
      "PATCH /api/session/ses_test",
      "POST /api/session/ses_test/prompt",
      "GET /api/session/ses_test/message?type=idle&order=desc&limit=1",
      "GET /api/session/ses_test/message?type=idle&order=desc&limit=1",
      "GET /api/session/ses_test/message?type=assistant&order=desc&limit=1",
      "DELETE /api/session/ses_test",
    ]);
    expect(apiRequests[2]!.body).toEqual({
      title: "ai-git",
      agent: "ai-git",
      model: { providerID: "openai", id: "gpt-6-luna", variant: "low" },
      permissions: [{ action: "*", resource: "*", effect: "deny" }],
      location: { directory },
    });
    expect(apiRequests[3]!.body).toEqual({ archived: true });
    expect(apiRequests[4]!.body).toEqual({ text: "--diff context", delivery: "steer" });

    const password = spawnCalls[1]!.opts.env!.OPENCODE_PASSWORD!;
    for (const request of apiRequests) {
      expect(request.headers.get("authorization")).toBe(
        `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
      );
      expect(request.headers.get("x-opencode-directory")).toBe(encodeURIComponent(directory));
    }
  });

  it("deletes sessions left by a killed run before starting a new one", async () => {
    const directory = getOpenCodeWorkDirectory();
    sessionList = [
      {
        id: "ses_left",
        title: "ai-git",
        agent: "ai-git",
        location: { directory },
        time: { created: Date.now() - 60 * 60_000 },
      },
      {
        // Killed between creating and archiving the session.
        id: "ses_unarchived",
        archived: false,
        title: "ai-git",
        agent: "ai-git",
        location: { directory },
        time: { created: Date.now() - 60 * 60_000 },
      },
      {
        id: "ses_other_terminal",
        title: "ai-git",
        agent: "ai-git",
        location: { directory },
        time: { created: Date.now() - 30_000 },
      },
    ];

    await opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" });

    const deletes = apiRequests.filter((request) => request.method === "DELETE");
    expect(deletes.map((request) => request.path)).toEqual([
      "/api/session/ses_left",
      "/api/session/ses_unarchived",
      "/api/session/ses_test",
    ]);
  });

  it("bypasses HTTP_PROXY for requests to the private server", async () => {
    const saved = { HTTP_PROXY: process.env.HTTP_PROXY, http_proxy: process.env.http_proxy };
    process.env.HTTP_PROXY = "http://127.0.0.1:9";
    process.env.http_proxy = "http://127.0.0.1:9";
    try {
      expect(
        await opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" }),
      ).toBe("feat: opencode");
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("removes its Ctrl-C handlers when generation ends", async () => {
    const before = process.listenerCount("SIGINT");
    await opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" });
    expect(process.listenerCount("SIGINT")).toBe(before);
  });

  it("reports a failed run and still deletes the session", async () => {
    idle = { type: "idle", outcome: "failed", error: { message: "Free usage limit reached." } };

    await expect(
      opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" }),
    ).rejects.toThrow("OpenCode CLI error:\nFree usage limit reached.");
    expect(apiRequests.at(-1)).toMatchObject({ method: "DELETE", path: "/api/session/ses_test" });
    expect(serverProcess!.stdinEnded).toBe(true);
  });

  it("explains the failure when OpenCode's background service takes over the session", async () => {
    idle = { type: "idle", outcome: "failed", error: { message: 'Agent not found: "ai-git"' } };

    await expect(
      opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" }),
    ).rejects.toThrow("OpenCode's background service started during generation");
  });

  it("restores process.exit when generation ends", async () => {
    const exit = process.exit;
    await opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" });
    expect(process.exit).toBe(exit);
  });

  it("rejects a model ID without a provider before starting a server", async () => {
    await expect(
      opencodeAdapter.invoke({ model: "gpt-6-luna", system: "s", prompt: "p" }),
    ).rejects.toThrow("provider/model");
    expect(spawnCalls.map((call) => call.cmd[1])).toEqual(["--version"]);
  });

  it("reports the server's stderr when it exits before printing its URL", async () => {
    (Bun as any).spawn = (cmd: string[], opts: SpawnCall["opts"]) => {
      spawnCalls.push({ cmd, opts });
      if (cmd.includes("--version")) return mockProcess(version);
      return {
        ...mockProcess("", 1, "Unrecognized flag: --stdio"),
        stdin: { end: async () => {} },
      };
    };

    await expect(
      opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" }),
    ).rejects.toThrow(
      "`opencode serve` exited (exit code 1) before it started: Unrecognized flag: --stdio",
    );
  });

  it("refuses to run OpenCode 1.x, which ignores the deny-all agent config", async () => {
    version = "1.19.5\n";

    await expect(
      opencodeAdapter.invoke({ model: "opencode/big-pickle", system: "s", prompt: "p" }),
    ).rejects.toThrow("OpenCode 2.2.6 or newer is required. Found 1.19.5.");
    expect(spawnCalls).toHaveLength(1);
  });

  it("lists models from the same work directory as generation", async () => {
    const models = await opencodeAdapter.fetchModels!();

    const list = spawnCalls[1]!;
    expect(list.cmd).toEqual(["opencode", "api", "model.list", "--standalone"]);
    expect(list.opts.cwd).toBe(getOpenCodeWorkDirectory());
    expect(list.opts.env!.PWD).toBe(getOpenCodeWorkDirectory());
    expect(JSON.parse(list.opts.env!.OPENCODE_CONFIG_CONTENT!)).toEqual(buildOpenCodeConfig());
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
