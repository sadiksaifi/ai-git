import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { clearModelCatalogForTests, getModelCatalog } from "./index.ts";
import { getModelsDevCacheFilePath } from "../../../lib/paths.ts";
import { createCatalogFromRaw } from "./models-dev-client.ts";
import { MODEL_CATALOG_SNAPSHOT } from "./snapshot.ts";

const originalFetch = globalThis.fetch;
const originalCacheFile = process.env.AI_GIT_MODELS_DEV_CACHE_FILE;

const tempDirs: string[] = [];

function createTempCacheFile(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-git-model-catalog-cache-"));
  tempDirs.push(tempDir);
  const cacheFile = path.join(tempDir, "models-dev-catalog.json");
  process.env.AI_GIT_MODELS_DEV_CACHE_FILE = cacheFile;
  return cacheFile;
}

function rawCatalogFixture() {
  return {
    anthropic: {
      models: {
        "claude-3-7-sonnet-latest": {
          name: "Claude 3.7 Sonnet",
          last_updated: "2025-02-19",
          release_date: "2025-02-19",
          reasoning: true,
          tool_call: true,
        },
      },
    },
    openai: {
      models: {
        "gpt-5": {
          name: "GPT-5",
          last_updated: "2025-08-07",
          release_date: "2025-08-07",
          reasoning: true,
          tool_call: true,
        },
      },
    },
    google: {
      models: {
        "gemini-2.5-pro": {
          name: "Gemini 2.5 Pro",
          last_updated: "2025-06-05",
          release_date: "2025-03-20",
          reasoning: true,
          tool_call: true,
        },
      },
    },
  };
}

beforeEach(() => {
  clearModelCatalogForTests();
});

afterEach(() => {
  clearModelCatalogForTests();
  globalThis.fetch = originalFetch;

  if (originalCacheFile === undefined) {
    delete process.env.AI_GIT_MODELS_DEV_CACHE_FILE;
  } else {
    process.env.AI_GIT_MODELS_DEV_CACHE_FILE = originalCacheFile;
  }

  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (!tempDir) continue;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("models-dev catalog client", () => {
  it("fetch success populates cache", async () => {
    createTempCacheFile();

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify(rawCatalogFixture()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const catalog = await getModelCatalog({ forceRefresh: true });
    expect(catalog.source).toBe("network");
    expect(catalog.providers.openai.models["gpt-5"]?.name).toBe("GPT-5");

    const cacheFile = getModelsDevCacheFilePath();
    expect(fs.existsSync(cacheFile)).toBe(true);
  });

  it("network failure falls back to stale cache", async () => {
    const cacheFile = createTempCacheFile();

    const stale = createCatalogFromRaw(rawCatalogFixture(), "cache");
    stale.fetchedAt = "2020-01-01T00:00:00.000Z";

    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(stale, null, 2));

    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const catalog = await getModelCatalog({ forceRefresh: true });
    expect(catalog.source).toBe("cache");
    expect(catalog.providers.anthropic.models["claude-3-7-sonnet-latest"]?.name).toBe(
      "Claude 3.7 Sonnet",
    );
  });

  it("cache miss + network failure falls back to snapshot", async () => {
    createTempCacheFile();

    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const catalog = await getModelCatalog({ forceRefresh: true });

    expect(catalog.source).toBe("snapshot");
    for (const providerId of ["anthropic", "openai", "google"] as const) {
      expect(Object.keys(catalog.providers[providerId].models)).toEqual(
        Object.keys(MODEL_CATALOG_SNAPSHOT[providerId].models),
      );
      expect(Object.keys(catalog.providers[providerId].models).length).toBeGreaterThan(0);
    }
    expect(catalog.providers.anthropic.models["claude-fable-5"]).toBeDefined();
    expect(catalog.providers.openai.models["gpt-5.6-luna"]).toBeDefined();
    expect(catalog.providers.google.models["gemini-3.7-flash"]).toBeDefined();
    expect(catalog.providers.anthropic.models["claude-3-7-sonnet-latest"]).toBeUndefined();
  });
});

describe("createCatalogFromRaw", () => {
  it("keeps family, effort values, and cost from models.dev", () => {
    const catalog = createCatalogFromRaw(
      {
        anthropic: {
          models: {
            "claude-haiku-5-5": {
              name: "Claude Haiku 5.5",
              family: "claude-haiku",
              reasoning_options: [
                { type: "toggle" },
                { type: "effort", values: ["low", "medium", "high"] },
              ],
              cost: { input: 0.1, output: 0.5, cache_read: 0.01 },
            },
            "claude-haiku-4-5": {
              name: "Claude Haiku 4.5",
              reasoning_options: [{ type: "budget_tokens", min: 1024 }],
            },
          },
        },
      },
      "network",
    );

    expect(catalog.providers.anthropic.models["claude-haiku-5-5"]).toMatchObject({
      family: "claude-haiku",
      reasoningEfforts: ["low", "medium", "high"],
      cost: { input: 0.1, output: 0.5 },
    });
    const older = catalog.providers.anthropic.models["claude-haiku-4-5"]!;
    expect(older.reasoningEfforts).toBeUndefined();
    expect(older.family).toBeUndefined();
    expect(older.cost).toBeUndefined();
  });
});
