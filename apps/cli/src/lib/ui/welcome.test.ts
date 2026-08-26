import { describe, expect, test } from "bun:test";
import { freshViewportSequence } from "./welcome.ts";

describe("freshViewportSequence", () => {
  test("scrolls the visible screen into history and returns to the top", () => {
    const sequence = freshViewportSequence(3);

    expect(sequence).toBe("\x1b[3;1H\n\n\n\x1b[H");
    expect(sequence).not.toContain("\x1b[2J");
    expect(sequence).not.toContain("\x1b[3J");
  });

  test("returns no output for invalid terminal heights", () => {
    expect(freshViewportSequence(0)).toBe("");
    expect(freshViewportSequence(-1)).toBe("");
    expect(freshViewportSequence(1.5)).toBe("");
  });
});
