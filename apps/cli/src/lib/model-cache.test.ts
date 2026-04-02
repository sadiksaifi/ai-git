import { describe, test, expect, afterEach } from "bun:test";
import { cacheModels, getCachedModels } from "./model-cache.ts";
import { getModelCacheFile } from "./paths.ts";
import { unlink } from "node:fs/promises";

const TEST_PROVIDER = "__test_cache_version__";

describe("model-cache versioning", () => {
  afterEach(async () => {
    try {
      await unlink(getModelCacheFile(TEST_PROVIDER));
    } catch {
      // ignore
    }
  });

  test("saved cache includes version: 1", async () => {
    await cacheModels(TEST_PROVIDER, [{ id: "test/model", name: "Test" }]);

    const raw = await Bun.file(getModelCacheFile(TEST_PROVIDER)).json();
    expect(raw.version).toBe(1);
  });

  test("legacy cache without version loads successfully", async () => {
    // Write a cache file without version field (legacy format)
    const legacy = {
      fetchedAt: new Date().toISOString(),
      provider: TEST_PROVIDER,
      models: [{ id: "legacy/model", name: "Legacy" }],
    };
    await Bun.write(getModelCacheFile(TEST_PROVIDER), JSON.stringify(legacy));

    const models = await getCachedModels(TEST_PROVIDER);
    expect(models).toEqual([{ id: "legacy/model", name: "Legacy" }]);
  });
});
