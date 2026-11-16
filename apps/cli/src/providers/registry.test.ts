import { describe, test, expect } from "bun:test";
import * as path from "node:path";
import { PROVIDERS as PROVIDER_DOCS } from "@ai-git/meta";
import { getAdapter } from "./index.ts";
import { PROVIDERS, sortRecommendedFirst } from "./registry.ts";

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

describe("provider registry", () => {
  test("derives every provider from @ai-git/meta docs", () => {
    expect(PROVIDERS.map((provider) => provider.id)).toEqual(Object.keys(PROVIDER_DOCS));
    for (const provider of PROVIDERS) {
      const doc = PROVIDER_DOCS[provider.id]!;
      expect(provider.name).toBe(doc.name);
      expect(provider.mode).toBe(doc.type);
    }
  });

  test("every provider has an adapter in the same mode", () => {
    for (const provider of PROVIDERS) {
      expect(getAdapter(provider.id)?.mode).toBe(provider.mode);
    }
  });

  test("every CLI provider can list models live", () => {
    for (const provider of PROVIDERS.filter((entry) => entry.mode === "cli")) {
      const adapter = getAdapter(provider.id) as { fetchModels?: unknown } | undefined;
      expect(typeof adapter?.fetchModels).toBe("function");
    }
  });
});

describe("configuration schema parity", () => {
  test("offers Antigravity CLI through the agy binary", () => {
    expect(PROVIDERS.find((provider) => provider.id === "antigravity-cli")).toMatchObject({
      name: "Antigravity CLI",
      mode: "cli",
      binary: "agy",
    });
  });

  test("the schema provider enum matches the runtime registry", async () => {
    const schema = await Bun.file(path.resolve(import.meta.dir, "../../../../schema.json")).json();
    expect(schema.properties.provider.enum).toEqual(PROVIDERS.map((provider) => provider.id));
  });

  test("every provider model is an unrestricted string without static model IDs", async () => {
    const schema = await Bun.file(path.resolve(import.meta.dir, "../../../../schema.json")).json();

    for (const provider of PROVIDERS) {
      const modelSchema = schema.allOf.find(
        (entry: any) => entry.if?.properties?.provider?.const === provider.id,
      )?.then?.properties?.model;
      expect(modelSchema?.type).toBe("string");
      expect(modelSchema?.enum).toBeUndefined();
    }
  });
});
