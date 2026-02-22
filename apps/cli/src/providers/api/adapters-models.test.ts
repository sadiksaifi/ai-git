import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { anthropicAdapter } from "./anthropic.ts";
import { openAIAdapter } from "./openai.ts";
import { googleAiStudioAdapter } from "./google-ai-studio.ts";
import { openRouterAdapter } from "./openrouter.ts";
import { cerebrasAdapter } from "./cerebras.ts";
import { clearModelCatalogForTests } from "./models/index.ts";

const originalFetch = globalThis.fetch;
const originalCatalogOverride = process.env.AI_GIT_MODEL_CATALOG_OVERRIDE;

const tempPaths: string[] = [];

function createTempPath(prefix: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempPaths.push(tempDir);
  return tempDir;
}

function writeCatalogOverride(): string {
  const tempDir = createTempPath("ai-git-catalog-override-");
  const file = path.join(tempDir, "catalog.json");

  const raw = {
    anthropic: {
      models: {
        "claude-sonnet-4-5": {
          name: "Claude Sonnet 4.5",
          reasoning: true,
          tool_call: true,
          last_updated: "2025-09-29",
          release_date: "2025-09-29",
        },
        "claude-3-opus-20240229": {
          name: "Claude Opus 3",
          status: "deprecated",
          reasoning: false,
          tool_call: true,
          last_updated: "2024-02-29",
          release_date: "2024-02-29",
        },
      },
    },
    openai: {
      models: {
        "gpt-5": {
          name: "GPT-5",
          reasoning: true,
          tool_call: true,
          last_updated: "2025-08-07",
          release_date: "2025-08-07",
        },
        "gpt-5-mini": {
          name: "GPT-5 Mini",
          reasoning: true,
          tool_call: true,
          last_updated: "2025-08-07",
          release_date: "2025-08-07",
        },
        "gpt-4o": {
          name: "GPT-4o",
          reasoning: false,
          tool_call: true,
          last_updated: "2024-05-13",
          release_date: "2024-05-13",
        },
        "gpt-3.5-turbo": {
          name: "GPT-3.5 Turbo",
          status: "deprecated",
          reasoning: false,
          tool_call: true,
          last_updated: "2023-11-06",
          release_date: "2023-11-06",
        },
      },
    },
    google: {
      models: {
        "gemini-2.5-pro": {
          name: "Gemini 2.5 Pro",
          reasoning: true,
          tool_call: true,
          last_updated: "2025-06-05",
          release_date: "2025-03-20",
        },
        "gemini-2.5-flash": {
          name: "Gemini 2.5 Flash",
          reasoning: true,
          tool_call: true,
          last_updated: "2025-06-05",
          release_date: "2025-03-20",
        },
      },
    },
  };

  fs.writeFileSync(file, JSON.stringify(raw, null, 2));
  return file;
}

beforeEach(() => {
  clearModelCatalogForTests();
  process.env.AI_GIT_MODEL_CATALOG_OVERRIDE = writeCatalogOverride();
});

afterEach(() => {
  clearModelCatalogForTests();
  globalThis.fetch = originalFetch;

  if (originalCatalogOverride === undefined) {
    delete process.env.AI_GIT_MODEL_CATALOG_OVERRIDE;
  } else {
    process.env.AI_GIT_MODEL_CATALOG_OVERRIDE = originalCatalogOverride;
  }

  while (tempPaths.length > 0) {
    const temp = tempPaths.pop();
    if (!temp) continue;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

describe("API adapters use shared model ranking", () => {
  it("openai adapter ranks, dedupes, and removes deprecated models", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [
            { id: "gpt-3.5-turbo", object: "model", created: 1, owned_by: "openai" },
            { id: "gpt-4o-2024-11-20", object: "model", created: 1, owned_by: "openai" },
            { id: "gpt-4o", object: "model", created: 1, owned_by: "openai" },
            { id: "gpt-5-mini", object: "model", created: 1, owned_by: "openai" },
            { id: "gpt-5", object: "model", created: 1, owned_by: "openai" },
            { id: "gpt-audio", object: "model", created: 1, owned_by: "openai" },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const models = await openAIAdapter.fetchModels("test-key");

    expect(models.map((m) => m.id)).toEqual(["gpt-5", "gpt-4o", "gpt-5-mini"]);
  });

  it("anthropic adapter removes deprecated models and orders defaults first", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [
            { id: "claude-3-opus-20240229", display_name: "Claude Opus 3", type: "model" },
            { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5", type: "model" },
          ],
          has_more: false,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const models = await anthropicAdapter.fetchModels("test-key");
    expect(models.map((m) => m.id)).toEqual(["claude-sonnet-4-5"]);
  });

  it("google adapter filters non-chat models and ranks via shared pipeline", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-2.5-pro",
              displayName: "Gemini 2.5 Pro",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-2.5-flash",
              displayName: "Gemini 2.5 Flash",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-embedding-001",
              displayName: "Gemini Embedding",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const models = await googleAiStudioAdapter.fetchModels("test-key");
    expect(models.map((m) => m.id)).toEqual(["gemini-2.5-pro", "gemini-2.5-flash"]);
  });

  it("openrouter adapter uses provider ordering and shared dedupe", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [
            { id: "openai/gpt-4o-2024-11-20", name: "GPT-4o dated" },
            { id: "openai/gpt-4o", name: "GPT-4o" },
            { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
            { id: "openai/gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
            { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const models = await openRouterAdapter.fetchModels("test-key");

    expect(models.map((m) => m.id)).toEqual([
      "anthropic/claude-sonnet-4-5",
      "openai/gpt-4o",
      "google/gemini-2.5-pro",
    ]);
  });

  it("cerebras adapter ranks and dedupes models", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [
            { id: "llama-3.3-70b", object: "model", created: 1, owned_by: "cerebras" },
            { id: "llama3.1-8b", object: "model", created: 1, owned_by: "cerebras" },
            {
              id: "qwen-3-235b-a22b-thinking-2507",
              object: "model",
              created: 1,
              owned_by: "cerebras",
            },
            {
              id: "qwen-3-235b-a22b-instruct-2507",
              object: "model",
              created: 1,
              owned_by: "cerebras",
            },
            { id: "qwen-3-32b", object: "model", created: 1, owned_by: "cerebras" },
            { id: "some-embedding-model", object: "model", created: 1, owned_by: "cerebras" },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const models = await cerebrasAdapter.fetchModels("test-key");
    const ids = models.map((m) => m.id);

    // embedding excluded by include patterns (doesn't match llama/qwen/gpt-oss/zai-glm)
    expect(ids).not.toContain("some-embedding-model");

    // thinking/instruct deduped to one entry (same dedupeKey)
    const qwen235 = ids.filter((id) => id.includes("235b"));
    expect(qwen235).toHaveLength(1);

    // tier ordering: default (70b, 32b, 235b-*) > fast (8b)
    const idx70b = ids.indexOf("llama-3.3-70b");
    const idx8b = ids.indexOf("llama3.1-8b");
    expect(idx70b).toBeLessThan(idx8b);

    // qwen-3-32b is default tier (not "other")
    const idx32b = ids.indexOf("qwen-3-32b");
    expect(idx32b).toBeLessThan(idx8b);
  });

  it("no adapter keeps local MODEL_PRIORITY maps", () => {
    const files = [
      "anthropic.ts",
      "openai.ts",
      "google-ai-studio.ts",
      "openrouter.ts",
      "cerebras.ts",
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.resolve(import.meta.dir, file), "utf8");
      expect(content.includes("MODEL_PRIORITY")).toBe(false);
    }
  });
});
