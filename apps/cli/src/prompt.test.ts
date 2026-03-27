import { describe, test, expect } from "bun:test";
import { buildSystemPrompt } from "./prompt.ts";

describe("buildSystemPrompt", () => {
  test("includes header budgeting instructions and cli examples", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("<header-budgeting>");
    expect(prompt).toContain("Generate the header as a constrained formatting task:");
    expect(prompt).toContain(
      "Do not output a header you have not checked against the 50 character limit",
    );
    expect(prompt).toContain("fix(cli): trim retry prompt context");
    expect(prompt).toContain("feat(cli)!: migrate flags to config");
  });

  test("preserves prompt customization alongside the default instructions", () => {
    const prompt = buildSystemPrompt({
      context: "AI Git generates commit messages for a CLI tool.",
      style: "Prefer direct subjects and terse bodies.",
    });

    expect(prompt).toContain("<project-context>");
    expect(prompt).toContain("About: AI Git generates commit messages for a CLI tool.");
    expect(prompt).toContain("Style: Prefer direct subjects and terse bodies.");
    expect(prompt).toContain("<header-budgeting>");
  });
});
