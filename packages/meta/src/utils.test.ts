import { describe, test, expect } from "bun:test";
import { getRandomTip, getFlagsByCategory } from "./utils.ts";
import { FLAGS, FLAG_CATEGORIES } from "./flags.ts";

describe("getRandomTip", () => {
  test("returns an object with flag and description", () => {
    const tip = getRandomTip();
    expect(tip).toHaveProperty("flag");
    expect(tip).toHaveProperty("description");
    expect(tip.flag.startsWith("--")).toBe(true);
    expect(tip.description.length).toBeGreaterThan(0);
  });

  test("does not return info flags", () => {
    // Info flags are excluded by the filter, so this is deterministic
    const tip = getRandomTip();
    expect(tip.flag).not.toBe("--version");
    expect(tip.flag).not.toBe("--help");
  });
});

describe("getFlagsByCategory", () => {
  test("returns all categories in order", () => {
    const grouped = getFlagsByCategory();
    expect(grouped).toHaveLength(FLAG_CATEGORIES.length);
    expect(grouped[0]!.category.key).toBe("model");
    expect(grouped[1]!.category.key).toBe("workflow");
    expect(grouped[2]!.category.key).toBe("info");
  });

  test("every flag is included in exactly one category", () => {
    const grouped = getFlagsByCategory();
    const allGroupedFlags = grouped.flatMap((g) => g.flags);
    const allFlags = Object.values(FLAGS);
    expect(allGroupedFlags).toHaveLength(allFlags.length);
  });

  test("model category contains provider and model flags", () => {
    const grouped = getFlagsByCategory();
    const modelFlags = grouped.find((g) => g.category.key === "model")!.flags;
    const longForms = modelFlags.map((f) => f.long);
    expect(longForms).toContain("--provider");
    expect(longForms).toContain("--model");
  });

  test("workflow category contains stage-all, commit, push, etc.", () => {
    const grouped = getFlagsByCategory();
    const workflowFlags = grouped.find((g) => g.category.key === "workflow")!.flags;
    const longForms = workflowFlags.map((f) => f.long);
    expect(longForms).toContain("--stage-all");
    expect(longForms).toContain("--commit");
    expect(longForms).toContain("--push");
    expect(longForms).toContain("--hint");
    expect(longForms).toContain("--exclude");
    expect(longForms).toContain("--dangerously-auto-approve");
    expect(longForms).toContain("--dry-run");
  });

  test("info category contains version and help", () => {
    const grouped = getFlagsByCategory();
    const infoFlags = grouped.find((g) => g.category.key === "info")!.flags;
    const longForms = infoFlags.map((f) => f.long);
    expect(longForms).toContain("--version");
    expect(longForms).toContain("--help");
  });
});
