import { describe, test, expect } from "bun:test";
import { normalizeAICommitMessage } from "./ai-response.ts";

describe("normalizeAICommitMessage", () => {
  test("strips markdown fences around a commit message", () => {
    const raw = "```text\nfeat: add login\n```";

    expect(normalizeAICommitMessage(raw)).toBe("feat: add login");
  });

  test("keeps the explicit final block from channel-tagged output", () => {
    const raw =
      "<|channel|>analysis<|message|>need a shorter header<|end|>\n" +
      "<|channel|>final<|message|>fix(cli): trim retry prompt context<|end|>";

    expect(normalizeAICommitMessage(raw)).toBe("fix(cli): trim retry prompt context");
  });

  test("removes a leading explanatory preamble", () => {
    const raw = "Here is your commit message:\n\nfeat: add login";

    expect(normalizeAICommitMessage(raw)).toBe("feat: add login");
  });

  test("does not over-extract from arbitrary prose", () => {
    const raw = "I think feat: add login would work, but please double-check the scope.";

    expect(normalizeAICommitMessage(raw)).toBe(raw);
  });
});
