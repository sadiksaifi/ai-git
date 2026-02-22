import { describe, expect, it } from "bun:test";
import type { APIModelDefinition } from "../../types.ts";
import { createCatalogFromRaw } from "./models-dev-client.ts";
import { dedupeProviderModels, rankProviderModels, findRecommendedModel } from "./ranking.ts";

function testCatalog() {
  return createCatalogFromRaw(
    {
      anthropic: {
        models: {
          "claude-sonnet-4-5": {
            name: "Claude Sonnet 4.5",
            last_updated: "2025-09-29",
            release_date: "2025-09-29",
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
          "gpt-5-mini": {
            name: "GPT-5 Mini",
            last_updated: "2025-08-07",
            release_date: "2025-08-07",
            reasoning: true,
            tool_call: true,
          },
          o3: {
            name: "o3",
            last_updated: "2025-04-16",
            release_date: "2025-04-16",
            reasoning: true,
            tool_call: true,
          },
          "gpt-4": {
            name: "GPT-4",
            last_updated: "2023-03-14",
            release_date: "2023-03-14",
            reasoning: false,
            tool_call: true,
          },
          "gpt-3.5-turbo": {
            name: "GPT-3.5 Turbo",
            status: "deprecated",
            last_updated: "2023-11-06",
            release_date: "2023-11-06",
            reasoning: false,
            tool_call: true,
          },
          "gpt-4o": {
            name: "GPT-4o",
            last_updated: "2024-05-13",
            release_date: "2024-05-13",
            reasoning: false,
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
    },
    "snapshot",
  );
}

describe("provider model ranking", () => {
  it("filters deprecated models", () => {
    const catalog = testCatalog();
    const models: APIModelDefinition[] = [
      { id: "gpt-5", name: "GPT-5" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ];

    const ranked = rankProviderModels("openai", models, catalog);

    expect(ranked.map((m) => m.id)).toEqual(["gpt-5"]);
  });

  it("uses deterministic tier ordering", () => {
    const catalog = testCatalog();
    const models: APIModelDefinition[] = [
      { id: "o3", name: "o3" },
      { id: "gpt-4", name: "GPT-4" },
      { id: "gpt-5-mini", name: "GPT-5 Mini" },
      { id: "gpt-5", name: "GPT-5" },
    ];

    const ranked = rankProviderModels("openai", models, catalog);

    expect(ranked.map((m) => m.id)).toEqual(["gpt-5", "gpt-5-mini", "o3", "gpt-4"]);
  });

  it("appends unknown models alphabetically after known models", () => {
    const catalog = testCatalog();
    const models: APIModelDefinition[] = [
      { id: "gpt-5", name: "GPT-5" },
      { id: "gpt-experimental-z", name: "GPT Experimental Z" },
      { id: "gpt-experimental-a", name: "GPT Experimental A" },
    ];

    const ranked = rankProviderModels("openai", models, catalog);

    expect(ranked.map((m) => m.id)).toEqual(["gpt-5", "gpt-experimental-a", "gpt-experimental-z"]);
  });

  it("dedupe keeps the highest-ranked canonical variant", () => {
    const catalog = testCatalog();
    const models: APIModelDefinition[] = [
      { id: "gpt-4o-2024-11-20", name: "GPT-4o (Dated)" },
      { id: "gpt-4o", name: "GPT-4o" },
    ];

    const ranked = rankProviderModels("openai", models, catalog);
    const deduped = dedupeProviderModels("openai", ranked);

    expect(deduped.map((m) => m.id)).toEqual(["gpt-4o"]);
  });

  it("finds a balanced recommended model", () => {
    const catalog = testCatalog();
    const models: APIModelDefinition[] = [
      { id: "o3", name: "o3" },
      { id: "gpt-5-mini", name: "GPT-5 Mini" },
      { id: "gpt-5", name: "GPT-5" },
    ];

    const recommended = findRecommendedModel("openai", models, catalog, "balanced");
    expect(recommended).toBe("gpt-5");
  });
});
