import { describe, expect, it } from "bun:test";

describe("formatModelChoiceTitle", () => {
  it("does not mark dynamic CLI choices as recommended", async () => {
    const { formatModelChoiceTitle } = await import("./wizard.ts");

    expect(
      formatModelChoiceTitle("GPT-5.5 Mini", "openai/gpt-5.5-mini#minimal", undefined, false),
    ).toBe("GPT-5.5 Mini");
  });

  it("marks curated static/API recommendations when enabled", async () => {
    const { formatModelChoiceTitle } = await import("./wizard.ts");

    expect(formatModelChoiceTitle("GPT-5", "gpt-5", "gpt-5", true)).toBe("GPT-5 (recommended)");
  });
});
