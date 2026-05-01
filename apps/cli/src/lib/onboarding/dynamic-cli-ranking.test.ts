import { describe, expect, it } from "bun:test";
import { createCatalogFromRaw } from "../../providers/api/models/models-dev-client.ts";
import type { CachedModel } from "../model-cache.ts";

function dynamicCatalog() {
  return createCatalogFromRaw(
    {
      anthropic: {
        models: {
          "claude-haiku-4-5": {
            name: "Claude Haiku 4.5",
            family: "claude-haiku",
            release_date: "2025-10-16",
            last_updated: "2025-10-16",
            reasoning: true,
            tool_call: true,
          },
        },
      },
      openai: {
        models: {
          "gpt-5.4": {
            name: "GPT-5.4",
            family: "gpt",
            release_date: "2026-03-05",
            last_updated: "2026-03-05",
            reasoning: true,
            tool_call: true,
          },
          "gpt-5.4-mini": {
            name: "GPT-5.4 Mini",
            family: "gpt-mini",
            release_date: "2026-03-19",
            last_updated: "2026-03-19",
            reasoning: true,
            tool_call: true,
          },
        },
      },
      google: {
        models: {
          "gemini-3-flash-preview": {
            name: "Gemini 3 Flash Preview",
            family: "gemini-flash",
            release_date: "2025-12-18",
            last_updated: "2025-12-18",
            reasoning: false,
            tool_call: true,
          },
        },
      },
    },
    "snapshot",
  );
}

describe("rankDynamicCLIModels", () => {
  it("uses provider priority before catalog-enriched model freshness", async () => {
    const { rankDynamicCLIModels } = await import("./dynamic-cli-ranking.ts");
    const models: CachedModel[] = [
      { id: "opencode/big-pickle", name: "Big Pickle" },
      { id: "anthropic/claude-haiku-4-5#minimal", name: "Claude Haiku 4.5 (minimal)" },
      { id: "openai/gpt-5.4-mini#minimal", name: "GPT-5.4 Mini (minimal)" },
      { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
    ];

    expect(rankDynamicCLIModels(models, dynamicCatalog()).map((model) => model.id)).toEqual([
      "openai/gpt-5.4-mini#minimal",
      "anthropic/claude-haiku-4-5#minimal",
      "google/gemini-3-flash-preview",
      "opencode/big-pickle",
    ]);
  });

  it("prefers latest fast variants and lowest thinking effort within a provider", async () => {
    const { rankDynamicCLIModels } = await import("./dynamic-cli-ranking.ts");
    const models: CachedModel[] = [
      { id: "openai-codex/gpt-5.4#high", name: "GPT-5.4 (high)" },
      { id: "openai-codex/gpt-5.5-pro#minimal", name: "GPT-5.5 Pro (minimal)" },
      { id: "openai-codex/gpt-5.5-mini#high", name: "GPT-5.5 Mini (high)" },
      { id: "openai-codex/gpt-5.5-mini#minimal", name: "GPT-5.5 Mini (minimal)" },
      { id: "openai-codex/gpt-5.5#low", name: "GPT-5.5 (low)" },
    ];

    expect(rankDynamicCLIModels(models, null).map((model) => model.id)).toEqual([
      "openai-codex/gpt-5.5-mini#minimal",
      "openai-codex/gpt-5.5-mini#high",
      "openai-codex/gpt-5.5#low",
      "openai-codex/gpt-5.5-pro#minimal",
      "openai-codex/gpt-5.4#high",
    ]);
  });

  it("keeps unknown ties in original CLI order", async () => {
    const { rankDynamicCLIModels } = await import("./dynamic-cli-ranking.ts");
    const models: CachedModel[] = [
      { id: "local/vendor-z", name: "Vendor Z" },
      { id: "local/vendor-a", name: "Vendor A" },
    ];

    expect(rankDynamicCLIModels(models, null).map((model) => model.id)).toEqual([
      "local/vendor-z",
      "local/vendor-a",
    ]);
  });

  it("falls back to heuristic ranking when models.dev loading fails", async () => {
    const { loadDynamicCLIModelsForSetup } = await import("./dynamic-cli-models.ts");

    const models = await loadDynamicCLIModelsForSetup("test-provider", {
      providerName: "Test Provider",
      loadCatalog: async () => {
        throw new Error("models.dev unavailable");
      },
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

    expect(models.map((model) => model.id)).toEqual([
      "openai-codex/gpt-5.5-mini#minimal",
      "openai-codex/gpt-5.4-mini#high",
    ]);
  });
});
