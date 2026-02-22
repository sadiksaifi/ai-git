import { describe, test, expect } from "bun:test";
import { sortRecommendedFirst } from "./registry.ts";

type Item = { id: string; isRecommended?: boolean };

describe("sortRecommendedFirst", () => {
  test("moves recommended items to front", () => {
    const items: Item[] = [
      { id: "a" },
      { id: "b", isRecommended: true },
      { id: "c" },
    ];
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
