import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";

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
  let versionOutput: string;
  let versionExitCode: number;
  let modelOutput: string | undefined;
  let modelError: string;
  let modelExitCode: number;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
    spawnCalls = [];
    versionOutput = "1.1.13\n";
    versionExitCode = 0;
    modelOutput = undefined;
    modelError = "";
    modelExitCode = 0;
    modelRows = [
      { id: "gemini-3.7-flash-low", label: "Gemini 3.7 Flash (Low)" },
      { id: "future/vendor:model", label: "Opaque Future Model" },
    ];
    (Bun as any).spawn = (command: string[]) => {
      spawnCalls.push(command);
      if (command[1] === "--version") {
        return {
          stdout: stream(versionOutput),
          stderr: stream(""),
          exited: Promise.resolve(versionExitCode),
        };
      }
      return {
        stdout: stream(
          modelOutput ??
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
        stderr: stream(modelError),
        exited: Promise.resolve(modelExitCode),
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

  it("prefers Flash Medium before High when no Flash Low model is available", async () => {
    modelRows = [
      { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
      { id: "gemini-3.7-flash-medium", label: "Gemini 3.7 Flash (Medium)" },
      { id: "gemini-4.0-pro-low", label: "Gemini 4.0 Pro (Low)" },
    ];
    const { antigravityAdapter } = await import("./antigravity.ts");

    const models = await antigravityAdapter.fetchModels!();

    expect(models.find((model) => model.isRecommended)?.id).toBe("gemini-3.7-flash-medium");
  });

  it("rejects an unsupported Antigravity version before model discovery", async () => {
    versionOutput = "1.1.12\n";
    const { antigravityAdapter } = await import("./antigravity.ts");

    await expect(antigravityAdapter.fetchModels!()).rejects.toThrow(
      "Antigravity CLI 1.1.13 or newer is required",
    );
    expect(spawnCalls).toEqual([["agy", "--version"]]);
  });

  it.each([
    ["malformed JSON", "not-json", "", 0, "malformed model-list JSON"],
    [
      "provider error",
      JSON.stringify({ status: "ERROR", error: "authentication required" }),
      "",
      0,
      "authentication required",
    ],
    [
      "empty catalog",
      JSON.stringify({ status: "SUCCESS", command: { data: { models: [] } } }),
      "",
      0,
      "returned no usable models",
    ],
    ["non-zero exit", "", "account unavailable", 2, "exit code 2"],
  ])("fails closed for %s", async (_name, stdout, stderr, exitCode, expected) => {
    modelOutput = String(stdout);
    modelError = String(stderr);
    modelExitCode = Number(exitCode);
    const { antigravityAdapter } = await import("./antigravity.ts");

    await expect(antigravityAdapter.fetchModels!()).rejects.toThrow(String(expected));
  });
});

describe("selectAntigravityMigrationModel", () => {
  it("maps every former Gemini CLI model to matching live Flash or Pro intent", async () => {
    const { selectAntigravityMigrationModel } = await import("./antigravity.ts");
    const models = [
      { id: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" },
      { id: "gemini-3.7-pro-low", name: "Gemini 3.7 Pro (Low)" },
    ];

    for (const legacyModel of [
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ]) {
      expect(selectAntigravityMigrationModel(legacyModel, models)).toBe("gemini-3.8-flash-low");
    }
    for (const legacyModel of [
      "gemini-3.1-pro-preview",
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
    ]) {
      expect(selectAntigravityMigrationModel(legacyModel, models)).toBe("gemini-3.7-pro-low");
    }
  });

  it("preserves provider order for the final account-compatible fallback", async () => {
    const { selectAntigravityMigrationModel } = await import("./antigravity.ts");
    const models = [
      { id: "vendor-first", name: "Provider First" },
      { id: "gemini-4.0-pro-high", name: "Gemini 4.0 Pro (High)" },
    ];

    expect(selectAntigravityMigrationModel("gemini-3-flash-preview", models)).toBe("vendor-first");
  });
});

describe("seedAntigravityAuthentication", () => {
  it("links file-backed authentication into the isolated profile without copying it", async () => {
    const home = mkdtempSync(join(tmpdir(), "ai-git-antigravity-auth-home-"));
    const profile = mkdtempSync(join(tmpdir(), "ai-git-antigravity-auth-profile-"));
    const source = join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token");
    mkdirSync(join(home, ".gemini", "antigravity-cli"), { recursive: true });
    writeFileSync(source, "synthetic-test-token", { mode: 0o600 });

    try {
      const { seedAntigravityAuthentication } = await import("./antigravity.ts");
      await seedAntigravityAuthentication(profile, home);

      expect(readlinkSync(join(profile, "antigravity-cli", "antigravity-oauth-token"))).toBe(
        source,
      );
    } finally {
      rmSync(profile, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("isOwnedIsolatedProfilePath", () => {
  it("accepts an owned Windows temporary profile path", async () => {
    const { isOwnedIsolatedProfilePath } = await import("./antigravity.ts");

    expect(
      isOwnedIsolatedProfilePath(
        "C:\\Users\\test\\AppData\\Local\\Temp\\ai-git-antigravity-abc123",
        "C:\\Users\\test\\AppData\\Local\\Temp",
        win32,
      ),
    ).toBe(true);
  });
});

describe("readAntigravityProcessOutput", () => {
  it("waits for a killed Antigravity subprocess to exit before rejecting", async () => {
    let killed = false;
    let closeStdout!: () => void;
    let closeStderr!: () => void;
    let resolveExit!: (exitCode: number) => void;
    const stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        closeStdout = () => controller.close();
      },
    });
    const stderr = new ReadableStream<Uint8Array>({
      start(controller) {
        closeStderr = () => controller.close();
      },
    });
    const process = {
      stdout,
      stderr,
      exited: new Promise<number>((resolve) => {
        resolveExit = resolve;
      }),
      kill: () => {
        killed = true;
        closeStdout();
        closeStderr();
      },
    };
    const { readAntigravityProcessOutput } = await import("./antigravity.ts");
    const result = readAntigravityProcessOutput(process, 1);
    let settled = false;
    void result.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await Bun.sleep(5);
    expect(killed).toBe(true);
    expect(settled).toBe(false);
    resolveExit(143);

    await expect(result).rejects.toThrow("Antigravity CLI timed out");
  });

  it("escalates and returns when a killed subprocess never terminates", async () => {
    const killSignals: Array<string | number | undefined> = [];
    const process = {
      stdout: new ReadableStream<Uint8Array>(),
      stderr: new ReadableStream<Uint8Array>(),
      exited: new Promise<number>(() => {}),
      kill: (signal?: string | number) => {
        killSignals.push(signal);
      },
    };
    const { readAntigravityProcessOutput } = await import("./antigravity.ts");
    const result = readAntigravityProcessOutput(process, 1, 1);
    const outcome = await Promise.race([
      result.then(
        () => "resolved",
        (error) => String(error),
      ),
      Bun.sleep(20).then(() => "still pending"),
    ]);

    expect(outcome).toContain("Antigravity CLI timed out");
    expect(killSignals).toEqual([undefined, "SIGKILL"]);
  });
});

describe("createIsolatedRuntime", () => {
  it("preserves account authentication when an API key is only ambient", async () => {
    const home = mkdtempSync(join(tmpdir(), "ai-git-antigravity-account-home-"));
    const originalHome = process.env.HOME;
    const originalGeminiApiKey = process.env.GEMINI_API_KEY;
    process.env.HOME = home;
    process.env.GEMINI_API_KEY = "ambient-test-key";
    let runtime: { root: string } | undefined;

    try {
      const { createIsolatedRuntime } = await import("./antigravity.ts");
      runtime = await createIsolatedRuntime("system");
      const settings = JSON.parse(
        readFileSync(join(runtime.root, "antigravity-cli", "settings.json"), "utf8"),
      );

      expect(settings).not.toHaveProperty("modelProvider");
    } finally {
      if (runtime) rmSync(runtime.root, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }
  });

  it("removes a partial profile when isolated setup fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-git-antigravity-partial-"));
    const { createIsolatedRuntime } = await import("./antigravity.ts");

    await expect(
      createIsolatedRuntime("system", {
        makeTemporaryDirectory: async () => root,
        seedAuthentication: async () => {
          throw new Error("auth setup failed");
        },
      }),
    ).rejects.toThrow("auth setup failed");
    expect(existsSync(root)).toBe(false);
  });
});

describe("antigravityAdapter.invoke", () => {
  let originalSpawn: typeof Bun.spawn;
  let originalGeminiApiKey: string | undefined;
  let originalHome: string | undefined;
  let temporaryHomes: string[];

  beforeEach(() => {
    originalSpawn = Bun.spawn;
    originalGeminiApiKey = process.env.GEMINI_API_KEY;
    originalHome = process.env.HOME;
    temporaryHomes = [];
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
    if (originalGeminiApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    for (const home of temporaryHomes) rmSync(home, { recursive: true, force: true });
  });

  it("generates inside a sandboxed temporary profile and removes all invocation state", async () => {
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    const home = mkdtempSync(join(tmpdir(), "ai-git-antigravity-api-home-"));
    temporaryHomes.push(home);
    process.env.HOME = home;
    mkdirSync(join(home, ".gemini", "antigravity-cli"), { recursive: true });
    writeFileSync(
      join(home, ".gemini", "antigravity-cli", "settings.json"),
      JSON.stringify({ modelProvider: "gemini" }),
    );
    const spawnCommands: string[][] = [];
    let generationCommand: string[] = [];
    let generationOptions: any;
    let profileRoot = "";
    let settings: any;
    let hooks: any;
    let agent = "";

    (Bun as any).spawn = (command: string[], options: any) => {
      spawnCommands.push(command);
      if (command[1] === "--version") {
        return { stdout: stream("1.1.13\n"), stderr: stream(""), exited: Promise.resolve(0) };
      }

      if (command.at(-1) === "models") {
        const probeRoot = command
          .find((argument) => argument.startsWith("--gemini_dir="))!
          .slice(13);
        const logDir = join(probeRoot, "antigravity-cli", "log");
        mkdirSync(logDir, { recursive: true });
        writeFileSync(
          join(logDir, "cli-probe.log"),
          [
            `CLI app data directory: ${probeRoot}/antigravity-cli`,
            "CLI settings initialized: permissions=&{Allow:[] Deny:[read_file(*) write_file(*) read_url(*) execute_url(*) command(*) mcp(*)] Ask:[]}, toolPermission=strict",
            "loaded 1 named hooks from 1 hooks.json file(s)",
          ].join("\n"),
        );
        return {
          stdout: stream(
            JSON.stringify({
              status: "SUCCESS",
              command: {
                data: {
                  models: [{ id: "gemini-3.7-flash-low", label: "Gemini 3.7 Flash (Low)" }],
                },
              },
            }),
          ),
          stderr: stream(""),
          exited: Promise.resolve(0),
        };
      }

      generationCommand = command;
      generationOptions = options;
      profileRoot = command.find((argument) => argument.startsWith("--gemini_dir="))!.slice(13);
      settings = JSON.parse(readFileSync(`${profileRoot}/antigravity-cli/settings.json`, "utf8"));
      hooks = JSON.parse(readFileSync(`${profileRoot}/config/hooks.json`, "utf8"));
      agent = readFileSync(`${profileRoot}/config/agents/ai-git/agent.md`, "utf8");

      return {
        stdout: stream(
          JSON.stringify({ status: "SUCCESS", response: "feat: isolated generation\n" }),
        ),
        stderr: stream(""),
        exited: Promise.resolve(0),
      };
    };

    const { antigravityAdapter } = await import("./antigravity.ts");
    await expect(
      antigravityAdapter.invoke({
        model: "gemini-3.7-flash-low",
        system: "Follow AI Git's commit-message contract.",
        prompt: "Generate a commit message for this diff.",
      }),
    ).resolves.toBe("feat: isolated generation");

    expect(generationCommand).toEqual([
      "agy",
      expect.stringMatching(/^--gemini_dir=/),
      "--sandbox",
      "--agent",
      "ai-git",
      "--model",
      "gemini-3.7-flash-low",
      "--output-format",
      "json",
      "--disable-slash-commands",
      "--print-timeout",
      "2m",
      "-p",
      "Generate a commit message for this diff.",
    ]);
    expect(spawnCommands[1]).toEqual([
      "agy",
      expect.stringMatching(/^--gemini_dir=/),
      "--output-format",
      "json",
      "models",
    ]);
    expect(generationCommand).not.toContain("--dangerously-skip-permissions");
    expect(generationOptions.cwd).toBe(`${profileRoot}/workspace`);
    expect(generationOptions.env.AGY_CLI_DISABLE_AUTO_UPDATE).toBe("1");
    expect(settings).toMatchObject({
      allowNonWorkspaceAccess: false,
      disableSlashCommands: true,
      enableTerminalSandbox: true,
      modelProvider: "gemini",
      toolPermission: "strict",
      permissions: {
        deny: [
          "read_file(*)",
          "write_file(*)",
          "read_url(*)",
          "execute_url(*)",
          "command(*)",
          "mcp(*)",
        ],
      },
    });
    expect(hooks["ai-git-deny-all"].PreToolUse[0].matcher).toBe("*");
    expect(agent).toContain("tools: []");
    expect(agent).toContain("subagent: false");
    expect(agent).toContain("Follow AI Git's commit-message contract.");
    expect(existsSync(profileRoot)).toBe(false);
  });

  it("rejects a model absent from the account catalog before sending the prompt", async () => {
    let profileRoot = "";
    let generationStarted = false;
    (Bun as any).spawn = (command: string[]) => {
      if (command[1] === "--version") {
        return { stdout: stream("1.1.13\n"), stderr: stream(""), exited: Promise.resolve(0) };
      }
      profileRoot = command.find((argument) => argument.startsWith("--gemini_dir="))!.slice(13);
      if (command.at(-1) === "models") {
        const logDir = join(profileRoot, "antigravity-cli", "log");
        mkdirSync(logDir, { recursive: true });
        writeFileSync(
          join(logDir, "cli-probe.log"),
          [
            `CLI app data directory: ${profileRoot}/antigravity-cli`,
            "CLI settings initialized: permissions=&{Allow:[] Deny:[read_file(*) write_file(*) read_url(*) execute_url(*) command(*) mcp(*)] Ask:[]}, toolPermission=strict",
            "loaded 1 named hooks from 1 hooks.json file(s)",
          ].join("\n"),
        );
        return {
          stdout: stream(
            JSON.stringify({
              status: "SUCCESS",
              command: { data: { models: [{ id: "available-model", label: "Available" }] } },
            }),
          ),
          stderr: stream(""),
          exited: Promise.resolve(0),
        };
      }
      generationStarted = true;
      throw new Error("generation should not start");
    };
    const { antigravityAdapter } = await import("./antigravity.ts");

    await expect(
      antigravityAdapter.invoke({ model: "missing-model", system: "system", prompt: "diff" }),
    ).rejects.toThrow("missing-model' is not available for the signed-in Antigravity account");
    expect(generationStarted).toBe(false);
    expect(existsSync(profileRoot)).toBe(false);
  });

  it.each([
    [JSON.stringify({ status: "CANCELED", response: "" }), "", 0, "CANCELED"],
    [
      JSON.stringify({ status: "ERROR", error: "authentication failed" }),
      "",
      0,
      "authentication failed",
    ],
    [JSON.stringify({ status: "SUCCESS", response: "" }), "", 0, "empty response"],
    ["not-json", "", 0, "malformed generation JSON"],
    ["", "unknown model slug", 2, "unknown model slug"],
  ])(
    "fails closed for terminal generation failures",
    async (generationOutput, generationError, generationExitCode, expected) => {
      let profileRoot = "";
      (Bun as any).spawn = (command: string[]) => {
        if (command[1] === "--version") {
          return { stdout: stream("1.1.13\n"), stderr: stream(""), exited: Promise.resolve(0) };
        }
        profileRoot = command.find((argument) => argument.startsWith("--gemini_dir="))!.slice(13);
        if (command.at(-1) === "models") {
          const logDir = join(profileRoot, "antigravity-cli", "log");
          mkdirSync(logDir, { recursive: true });
          writeFileSync(
            join(logDir, "cli-probe.log"),
            [
              `CLI app data directory: ${profileRoot}/antigravity-cli`,
              "CLI settings initialized: permissions=&{Allow:[] Deny:[read_file(*) write_file(*) read_url(*) execute_url(*) command(*) mcp(*)] Ask:[]}, toolPermission=strict",
              "loaded 1 named hooks from 1 hooks.json file(s)",
            ].join("\n"),
          );
          return {
            stdout: stream(
              JSON.stringify({
                status: "SUCCESS",
                command: { data: { models: [{ id: "model", label: "Model" }] } },
              }),
            ),
            stderr: stream(""),
            exited: Promise.resolve(0),
          };
        }
        return {
          stdout: stream(String(generationOutput)),
          stderr: stream(String(generationError)),
          exited: Promise.resolve(Number(generationExitCode)),
        };
      };
      const { antigravityAdapter } = await import("./antigravity.ts");

      await expect(
        antigravityAdapter.invoke({ model: "model", system: "system", prompt: "prompt" }),
      ).rejects.toThrow(String(expected));
      expect(existsSync(profileRoot)).toBe(false);
    },
  );
});
