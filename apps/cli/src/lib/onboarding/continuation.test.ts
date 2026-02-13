import { describe, it, expect } from "bun:test";
import { shouldExitAfterOnboarding } from "./continuation.ts";

describe("shouldExitAfterOnboarding", () => {
  it("returns false when user chooses to continue", () => {
    expect(shouldExitAfterOnboarding(true)).toBe(false);
  });

  it("returns true when user chooses not to continue", () => {
    expect(shouldExitAfterOnboarding(false)).toBe(true);
  });
});
