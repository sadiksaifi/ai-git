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

  it("classifies current Anthropic families into useful recommendation tiers", () => {
    const catalog = createCatalogFromRaw(
      {
        anthropic: {
          models: {
            "claude-fable-5": {
              name: "Claude Fable 5",
              last_updated: "2026-06-09",
              release_date: "2026-06-07",
              reasoning: true,
              tool_call: true,
            },
            "claude-sonnet-5": {
              name: "Claude Sonnet 5",
              last_updated: "2026-06-30",
              release_date: "2026-06-29",
              reasoning: true,
              tool_call: true,
            },
            "claude-opus-5": {
              name: "Claude Opus 5",
              last_updated: "2026-07-24",
              release_date: "2026-07-24",
              reasoning: true,
              tool_call: true,
            },
            "claude-haiku-4-5": {
              name: "Claude Haiku 4.5",
              last_updated: "2025-10-15",
              release_date: "2025-10-15",
              reasoning: true,
              tool_call: true,
            },
          },
        },
      },
      "snapshot",
    );
    const models = ["claude-fable-5", "claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"].map(
      (id) => ({ id, name: id }),
    );

    expect(findRecommendedModel("anthropic", models, catalog, "balanced")).toBe("claude-sonnet-5");
    expect(findRecommendedModel("anthropic", models, catalog, "speed")).toBe("claude-haiku-4-5");
    expect(
      findRecommendedModel(
        "anthropic",
        models.filter((model) => model.id !== "claude-opus-5"),
        catalog,
        "capability",
      ),
    ).toBe("claude-fable-5");
  });

  it("selects Luna as the newest fast OpenAI family before broad GPT rules", () => {
    const catalog = createCatalogFromRaw(
      {
        openai: {
          models: {
            "gpt-5.6-sol": {
              name: "GPT-5.6 Sol",
              last_updated: "2026-08-18",
              release_date: "2026-08-18",
              reasoning: true,
              tool_call: true,
            },
            "gpt-5.6-luna": {
              name: "GPT-5.6 Luna",
              last_updated: "2026-08-17",
              release_date: "2026-08-17",
              reasoning: true,
              tool_call: true,
            },
            "gpt-5.4-nano": {
              name: "GPT-5.4 Nano",
              last_updated: "2026-03-19",
              release_date: "2026-03-19",
              reasoning: true,
              tool_call: true,
            },
            "gpt-5.3-codex-spark": {
              name: "GPT-5.3 Codex Spark",
              last_updated: "2026-02-12",
              release_date: "2026-02-12",
              reasoning: true,
              tool_call: true,
            },
          },
        },
      },
      "snapshot",
    );
    const models = ["gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.4-nano", "gpt-5.3-codex-spark"].map(
      (id) => ({ id, name: id }),
    );

    expect(findRecommendedModel("openai", models, catalog, "speed")).toBe("gpt-5.6-luna");
  });

  it("selects the newest Google Flash family for speed", () => {
    const catalog = createCatalogFromRaw(
      {
        google: {
          models: Object.fromEntries(
            [
              "gemini-3.1-flash-lite",
              "gemini-3.5-flash",
              "gemini-3.6-flash",
              "gemini-3.7-flash",
            ].map((id, index) => [
              id,
              {
                name: id,
                last_updated: `2026-0${index + 4}-01`,
                release_date: `2026-0${index + 4}-01`,
                reasoning: true,
                tool_call: true,
              },
            ]),
          ),
        },
      },
      "snapshot",
    );
    const models = [
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
    ].map((id) => ({ id, name: id }));

    expect(findRecommendedModel("google-ai-studio", models, catalog, "speed")).toBe(
      "gemini-3.7-flash",
    );
  });
});
