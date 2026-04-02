import { describe, test, expect } from "bun:test";
import { DEFAULT_SLOW_WARNING_THRESHOLD_MS, mergePromptConfig } from "./config.ts";
import type { PromptCustomization } from "./config.ts";

describe("DEFAULT_SLOW_WARNING_THRESHOLD_MS", () => {
  test("is exported and equals 5000", () => {
    expect(DEFAULT_SLOW_WARNING_THRESHOLD_MS).toBe(5_000);
  });
});

describe("mergePromptConfig", () => {
  test("project context merges with global style and examples", () => {
    const global: PromptCustomization = {
      style: "Keep it short",
      examples: ["feat: add X"],
    };
    const project: PromptCustomization = {
      context: "React app",
    };

    const merged = mergePromptConfig(global, project);
    expect(merged).toEqual({
      style: "Keep it short",
      examples: ["feat: add X"],
      context: "React app",
    });
  });

  test("examples from both configs are concatenated", () => {
    const global: PromptCustomization = {
      examples: ["feat: add X"],
    };
    const project: PromptCustomization = {
      examples: ["fix: repair Y"],
    };

    const merged = mergePromptConfig(global, project);
    expect(merged.examples).toEqual(["feat: add X", "fix: repair Y"]);
  });

  test("project style overrides global style", () => {
    const global: PromptCustomization = { style: "verbose" };
    const project: PromptCustomization = { style: "concise" };

    const merged = mergePromptConfig(global, project);
    expect(merged.style).toBe("concise");
  });

  test("returns global when project is undefined", () => {
    const global: PromptCustomization = {
      style: "verbose",
      examples: ["feat: add X"],
    };

    const merged = mergePromptConfig(global, undefined);
    expect(merged).toEqual(global);
  });

  test("returns project when global is undefined", () => {
    const project: PromptCustomization = {
      context: "React app",
    };

    const merged = mergePromptConfig(undefined, project);
    expect(merged).toEqual(project);
  });
});
