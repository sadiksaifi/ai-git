import { describe, test, expect } from "bun:test";
import * as path from "node:path";
import { PROVIDERS, getModelIds, sortRecommendedFirst } from "./registry.ts";

type Item = { id: string; isRecommended?: boolean };

describe("sortRecommendedFirst", () => {
  test("moves recommended items to front", () => {
    const items: Item[] = [{ id: "a" }, { id: "b", isRecommended: true }, { id: "c" }];
    const sorted = sortRecommendedFirst(items);
    expect(sorted.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  test("preserves order among recommended items", () => {
    const items: Item[] = [
      { id: "a", isRecommended: true },
      { id: "b" },
      { id: "c", isRecommended: true },
    ];
    const sorted = sortRecommendedFirst(items);
    expect(sorted.map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  test("preserves order when no items are recommended", () => {
    const items: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const sorted = sortRecommendedFirst(items);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  test("does not mutate original array", () => {
    const items: Item[] = [{ id: "a" }, { id: "b", isRecommended: true }];
    const sorted = sortRecommendedFirst(items);
    expect(sorted).not.toBe(items);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("configuration schema parity", () => {
  test("keeps the Gemini CLI catalog and default unchanged", () => {
    expect(getModelIds("gemini-cli")).toEqual([
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
      "gemini-3-pro-preview",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ]);
    expect(
      PROVIDERS.find((provider) => provider.id === "gemini-cli")?.models.find(
        (model) => model.isRecommended,
      )?.id,
    ).toBe("gemini-3-flash-preview");
  });

  test("every static CLI provider enum exactly matches the runtime registry", async () => {
    const schema = await Bun.file(path.resolve(import.meta.dir, "../../../../schema.json")).json();

    for (const provider of PROVIDERS.filter(
      (entry) => entry.mode === "cli" && !entry.dynamicModels,
    )) {
      const providerSchema = schema.allOf.find(
        (entry: any) => entry.if?.properties?.provider?.const === provider.id,
      );
      expect(providerSchema?.then?.properties?.model?.enum).toEqual(
        provider.models.map((model) => model.id),
      );
    }
  });

  test("dynamic providers remain unrestricted strings without static model IDs", async () => {
    const schema = await Bun.file(path.resolve(import.meta.dir, "../../../../schema.json")).json();

    for (const provider of PROVIDERS.filter((entry) => entry.dynamicModels)) {
      const modelSchema = schema.allOf.find(
        (entry: any) => entry.if?.properties?.provider?.const === provider.id,
      )?.then?.properties?.model;
      expect(modelSchema?.type).toBe("string");
      expect(modelSchema?.enum).toBeUndefined();
    }
  });
});
