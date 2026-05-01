import { describe, it, expect } from "bun:test";

describe("loadDynamicCLIModelsForSetup", () => {
  it("returns live model rows for dynamic CLI providers", async () => {
    const { loadDynamicCLIModelsForSetup } = await import("./dynamic-cli-models.ts");

    const models = await loadDynamicCLIModelsForSetup("test-provider", {
      providerName: "Test Provider",
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
