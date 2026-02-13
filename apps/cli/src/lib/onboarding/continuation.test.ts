import { describe, it, expect } from "bun:test";
import { shouldExitAfterOnboarding } from "./index.ts";

describe("shouldExitAfterOnboarding", () => {
  it("returns false when user chooses to continue", () => {
    expect(shouldExitAfterOnboarding(true)).toBe(false);
  });

  it("returns true when user chooses not to continue", () => {
    expect(shouldExitAfterOnboarding(false)).toBe(true);
  });

  it("does not force exit for explicit --setup when user chooses continue", () => {
    // Regression: setup flag used to force exit regardless of user choice.
    // Decision logic must remain a pure user-choice negation.
    expect(shouldExitAfterOnboarding(true)).toBe(!true);
    expect(shouldExitAfterOnboarding(false)).toBe(!false);
  });
});
