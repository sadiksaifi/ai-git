import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildClaudeCodeModels,
  parseClaudeEffortLevels,
  parseClaudeModelId,
  selectAnthropicCatalogModels,
} from "./claude-code.ts";
import { clearModelCatalogForTests } from "../api/models/index.ts";
import { createCatalogFromRaw } from "../api/models/models-dev-client.ts";
import { MODEL_CATALOG_SNAPSHOT } from "../api/models/snapshot.ts";
import type { CatalogModelDefinition } from "../api/models/types.ts";

describe("parseClaudeModelId", () => {
  it("splits '<alias>#<effort>' on the last #", () => {
    expect(parseClaudeModelId("haiku#low")).toEqual({ model: "haiku", effort: "low" });
    expect(parseClaudeModelId("claude-opus-5-5#max")).toEqual({
      model: "claude-opus-5-5",
      effort: "max",
    });
  });

  it("should parse sonnet-low", () => {
    expect(parseClaudeModelId("sonnet-low")).toEqual({
      model: "sonnet",
      effort: "low",
    });
  });

  it("should parse sonnet-medium", () => {
    expect(parseClaudeModelId("sonnet-medium")).toEqual({
      model: "sonnet",
      effort: "medium",
    });
  });

  it("should parse sonnet-high", () => {
    expect(parseClaudeModelId("sonnet-high")).toEqual({
      model: "sonnet",
      effort: "high",
    });
  });

  it("should parse opus-low", () => {
    expect(parseClaudeModelId("opus-low")).toEqual({
      model: "opus",
      effort: "low",
    });
  });

  it("should parse opus-high", () => {
    expect(parseClaudeModelId("opus-high")).toEqual({
      model: "opus",
      effort: "high",
    });
  });

  it.each(["xhigh", "max"] as const)("parses Fable %s effort", (effort) => {
    expect(parseClaudeModelId(`fable-${effort}`)).toEqual({ model: "fable", effort });
  });

  it.each(["sonnet", "opus"] as const)("parses %s max effort", (model) => {
    expect(parseClaudeModelId(`${model}-max`)).toEqual({ model, effort: "max" });
  });

  it("should return plain model without effort for sonnet", () => {
    expect(parseClaudeModelId("sonnet")).toEqual({
      model: "sonnet",
    });
  });

  it("should return plain model without effort for haiku", () => {
    expect(parseClaudeModelId("haiku")).toEqual({
      model: "haiku",
    });
  });

  it("should return plain model without effort for opus", () => {
    expect(parseClaudeModelId("opus")).toEqual({
      model: "opus",
    });
  });
});

describe("claudeCodeAdapter.invoke", () => {
  let spawnCalls: { cmd: string[]; opts: unknown }[] = [];
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    spawnCalls = [];
    originalSpawn = Bun.spawn;

    // Mock Bun.spawn to capture arguments
    (Bun as any).spawn = (cmd: string[], opts: unknown) => {
      spawnCalls.push({ cmd, opts });
      // Return a mock process
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

  it("should pass --effort flag for effort-based model IDs", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "sonnet-high",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    expect(cmd).toContain("--effort");
    expect(cmd).toContain("high");
    // Base model should be "sonnet", not "sonnet-high"
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("sonnet");
  });

  it("should NOT pass --effort flag for plain model IDs", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "sonnet",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    expect(cmd).not.toContain("--effort");
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("sonnet");
  });

  it("should NOT pass --effort flag for haiku", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "haiku",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0]!.cmd;
    expect(cmd).not.toContain("--effort");
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("haiku");
  });

  it("passes xhigh and max effort selections to Claude Code", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");

    await claudeCodeAdapter.invoke({
      model: "fable-xhigh",
      system: "test system",
      prompt: "test prompt",
    });
    await claudeCodeAdapter.invoke({
      model: "opus-max",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls[0]!.cmd).toContain("xhigh");
    expect(spawnCalls[0]!.cmd[spawnCalls[0]!.cmd.indexOf("--model") + 1]).toBe("fable");
    expect(spawnCalls[1]!.cmd).toContain("max");
    expect(spawnCalls[1]!.cmd[spawnCalls[1]!.cmd.indexOf("--model") + 1]).toBe("opus");
  });
});

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

function model(
  id: string,
  fields: Partial<CatalogModelDefinition> = {},
): [string, CatalogModelDefinition] {
  return [id, { id, name: id, reasoning: true, toolCall: true, ...fields }];
}

describe("parseClaudeEffortLevels", () => {
  it("reads the parenthesized list under --effort", () => {
    const help = [
      "  --disable-slash-commands              Disable all skills and commands",
      "  --effort <level>                      Effort level for the current session",
      "                                        (low, medium, high, xhigh, max)",
      "  --environment <environment_id>        Create a new cloud session",
    ].join("\n");
    expect(parseClaudeEffortLevels(help)).toEqual(EFFORTS);
  });

  it("returns null when --effort is missing or has no list", () => {
    expect(parseClaudeEffortLevels("  --model <model>  Model for the session")).toBeNull();
    expect(parseClaudeEffortLevels("  --effort <level>  Effort level\n  --foo  bar")).toBeNull();
  });
});

describe("buildClaudeCodeModels", () => {
  const catalog = Object.fromEntries([
    model("claude-haiku-5-5", {
      family: "claude-haiku",
      releaseDate: "2026-10-07",
      reasoningEfforts: EFFORTS,
      cost: { input: 0.1, output: 0.5 },
    }),
    model("claude-haiku-4-5", {
      family: "claude-haiku",
      releaseDate: "2025-10-15",
      cost: { input: 1, output: 5 },
    }),
    model("claude-opus-5-5", {
      family: "claude-opus",
      releaseDate: "2026-09-22",
      reasoningEfforts: EFFORTS,
      cost: { input: 4, output: 20 },
    }),
    model("claude-sonnet-5-5", {
      family: "claude-sonnet",
      releaseDate: "2026-09-28",
      reasoningEfforts: ["low", "high"],
      cost: { input: 2, output: 10 },
    }),
    model("claude-sonnet-4-5", {
      family: "claude-sonnet",
      status: "deprecated",
      releaseDate: "2026-11-01",
      cost: { input: 0.01, output: 0.01 },
    }),
    model("claude-instant-1-2", {
      family: "claude-instant",
      releaseDate: "2023-08-09",
      cost: { input: 0.01, output: 0.01 },
    }),
  ]);

  it("offers one option per current family and effort, cheapest family first", () => {
    expect(buildClaudeCodeModels(catalog, null).map((option) => option.id)).toEqual([
      ...EFFORTS.map((effort) => `haiku#${effort}`),
      "sonnet#low",
      "sonnet#high",
      ...EFFORTS.map((effort) => `opus#${effort}`),
    ]);
  });

  it("recommends the cheapest family at its lowest effort", () => {
    const options = buildClaudeCodeModels(catalog, null);
    expect(options.filter((option) => option.isRecommended)).toEqual([
      { id: "haiku#low", name: "Claude Haiku (low)", isRecommended: true },
    ]);
  });

  it("limits efforts to the levels the installed CLI accepts", () => {
    const options = buildClaudeCodeModels(catalog, ["low", "medium", "high"]);
    expect(options.filter((option) => option.id.startsWith("opus")).map((o) => o.id)).toEqual([
      "opus#low",
      "opus#medium",
      "opus#high",
    ]);
  });

  it("offers the bare alias when the newest family model has no effort option", () => {
    const options = buildClaudeCodeModels(
      Object.fromEntries([
        model("claude-haiku-4-5", { family: "claude-haiku", releaseDate: "2025-10-15" }),
      ]),
      EFFORTS,
    );
    expect(options).toEqual([{ id: "haiku", name: "Claude Haiku", isRecommended: true }]);
  });

  it("derives the family from the model ID when models.dev omits it", () => {
    const options = buildClaudeCodeModels(
      Object.fromEntries([model("claude-3-5-haiku-20241022", { releaseDate: "2024-10-22" })]),
      null,
    );
    expect(options.map((option) => option.id)).toEqual(["haiku"]);
  });

  it("builds Claude Code options from the bundled snapshot", () => {
    const options = buildClaudeCodeModels(MODEL_CATALOG_SNAPSHOT.anthropic.models, EFFORTS);
    expect(options.length).toBeGreaterThan(0);
    expect(options.filter((option) => option.isRecommended)).toHaveLength(1);
  });
});

describe("selectAnthropicCatalogModels", () => {
  it("uses the snapshot when the catalog predates family data", () => {
    const stale = createCatalogFromRaw(
      { anthropic: { models: { "claude-haiku-4-5": { name: "Claude Haiku 4.5" } } } },
      "cache",
    );
    expect(selectAnthropicCatalogModels(stale)).toBe(MODEL_CATALOG_SNAPSHOT.anthropic.models);
    expect(selectAnthropicCatalogModels(null)).toBe(MODEL_CATALOG_SNAPSHOT.anthropic.models);
  });

  it("uses the live catalog when it has family data", () => {
    const live = createCatalogFromRaw(
      { anthropic: { models: { "claude-haiku-5-5": { family: "claude-haiku" } } } },
      "network",
    );
    expect(Object.keys(selectAnthropicCatalogModels(live))).toEqual(["claude-haiku-5-5"]);
  });
});

describe("claudeCodeAdapter.fetchModels", () => {
  let originalSpawn: typeof Bun.spawn;
  const originalOverride = process.env.AI_GIT_MODEL_CATALOG_OVERRIDE;
  let tempDir: string;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-git-claude-models-"));
    const overrideFile = path.join(tempDir, "catalog.json");
    fs.writeFileSync(
      overrideFile,
      JSON.stringify({
        anthropic: {
          models: {
            "claude-haiku-5-5": {
              family: "claude-haiku",
              release_date: "2026-10-07",
              reasoning_options: [{ type: "effort", values: ["low", "medium", "ultra"] }],
            },
          },
        },
        openai: { models: {} },
        google: { models: {} },
      }),
    );
    process.env.AI_GIT_MODEL_CATALOG_OVERRIDE = overrideFile;
    clearModelCatalogForTests();
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
    clearModelCatalogForTests();
    if (originalOverride === undefined) delete process.env.AI_GIT_MODEL_CATALOG_OVERRIDE;
    else process.env.AI_GIT_MODEL_CATALOG_OVERRIDE = originalOverride;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("combines catalog families with the efforts from `claude --help`", async () => {
    const spawnCalls: string[][] = [];
    (Bun as any).spawn = (cmd: string[]) => {
      spawnCalls.push(cmd);
      const help = "  --effort <level>  Effort level\n      (low, medium, high)\n";
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(help));
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

    const { claudeCodeAdapter } = await import("./claude-code.ts");
    const models = await claudeCodeAdapter.fetchModels!();

    expect(spawnCalls).toEqual([["claude", "--help"]]);
    expect(models).toEqual([
      { id: "haiku#low", name: "Claude Haiku (low)", isRecommended: true },
      { id: "haiku#medium", name: "Claude Haiku (medium)" },
    ]);
  });
});
