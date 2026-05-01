import { describe, it, expect } from "bun:test";

describe("loadDynamicCLIModelsForSetup", () => {
  it("returns live model rows for dynamic CLI providers", async () => {
    const { loadDynamicCLIModelsForSetup } = await import("./dynamic-cli-models.ts");

    const models = await loadDynamicCLIModelsForSetup("test-provider", {
      providerName: "Test Provider",
      loadCatalog: async () => {
        throw new Error("skip catalog in unit test");
      },
      adapter: {
        providerId: "test-provider",
        mode: "cli",
        binary: "test",
        checkAvailable: async () => true,
        invoke: async () => "",
        fetchModels: async () => [{ id: "vendor/model#low", name: "Vendor Model (low)" }],
      },
    });

    expect(models).toEqual([{ id: "vendor/model#low", name: "Vendor Model (low)" }]);
  });

  it("falls back when catalog loading does not settle", async () => {
    const { loadDynamicCLIModelsForSetup } = await import("./dynamic-cli-models.ts");

    const modelsPromise = loadDynamicCLIModelsForSetup("test-provider", {
      providerName: "Test Provider",
      catalogTimeoutMs: 1,
      loadCatalog: async () => new Promise(() => {}),
      adapter: {
        providerId: "test-provider",
        mode: "cli",
        binary: "test",
        checkAvailable: async () => true,
        invoke: async () => "",
        fetchModels: async () => [
          { id: "openai-codex/gpt-5.4-mini#high", name: "GPT-5.4 Mini (high)" },
          { id: "openai-codex/gpt-5.5-mini#minimal", name: "GPT-5.5 Mini (minimal)" },
        ],
      },
    });

    const models = await Promise.race([
      modelsPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timed out waiting for catalog fallback")), 50);
      }),
    ]);

    expect(models.map((model) => model.id)).toEqual([
      "openai-codex/gpt-5.5-mini#minimal",
      "openai-codex/gpt-5.4-mini#high",
    ]);
  });

  it("fails when a dynamic CLI adapter returns no usable models", async () => {
    const { loadDynamicCLIModelsForSetup } = await import("./dynamic-cli-models.ts");

    await expect(
      loadDynamicCLIModelsForSetup("test-provider", {
        providerName: "Test Provider",
        adapter: {
          providerId: "test-provider",
          mode: "cli",
          binary: "test",
          checkAvailable: async () => true,
          invoke: async () => "",
          fetchModels: async () => [],
        },
      }),
    ).rejects.toThrow("Test Provider returned no usable models");
  });

  it("fails when no live model listing adapter is registered", async () => {
    const { loadDynamicCLIModelsForSetup } = await import("./dynamic-cli-models.ts");

    await expect(
      loadDynamicCLIModelsForSetup("test-provider", {
        providerName: "Test Provider",
        adapter: {
          providerId: "test-provider",
          mode: "cli",
          binary: "test",
          checkAvailable: async () => true,
          invoke: async () => "",
        },
      }),
    ).rejects.toThrow("Test Provider does not support live model listing");
  });
});
