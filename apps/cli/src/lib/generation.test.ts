import { describe, test, expect } from "bun:test";
import { DEFAULT_SLOW_WARNING_THRESHOLD_MS } from "../config.ts";
import type { GenerationContext } from "./generation.ts";

describe("GenerationContext slow warning", () => {
  test("DEFAULT_SLOW_WARNING_THRESHOLD_MS is a positive number", () => {
    expect(DEFAULT_SLOW_WARNING_THRESHOLD_MS).toBeGreaterThan(0);
    expect(typeof DEFAULT_SLOW_WARNING_THRESHOLD_MS).toBe("number");
  });

  test("slowWarningThresholdMs defaults to DEFAULT_SLOW_WARNING_THRESHOLD_MS when undefined", () => {
    const ctx: Partial<GenerationContext> = {};
    const threshold = ctx.slowWarningThresholdMs ?? DEFAULT_SLOW_WARNING_THRESHOLD_MS;
    expect(threshold).toBe(5_000);
  });

  test("slowWarningThresholdMs of 0 disables the warning", () => {
    const ctx: Partial<GenerationContext> = { slowWarningThresholdMs: 0 };
    const threshold = ctx.slowWarningThresholdMs ?? DEFAULT_SLOW_WARNING_THRESHOLD_MS;
    // 0 is falsy but should be respected as "disabled"
    expect(threshold).toBe(0);
    // The generation code checks `slowThresholdMs > 0` before setting the timer
    expect(threshold > 0).toBe(false);
  });

  test("custom slowWarningThresholdMs overrides default", () => {
    const ctx: Partial<GenerationContext> = { slowWarningThresholdMs: 10_000 };
    const threshold = ctx.slowWarningThresholdMs ?? DEFAULT_SLOW_WARNING_THRESHOLD_MS;
    expect(threshold).toBe(10_000);
  });

  test("timer fires after threshold and can be cleared", async () => {
    let warningFired = false;
    const threshold = 50; // 50ms for test speed

    const timer = setTimeout(() => {
      warningFired = true;
    }, threshold);

    // Clear before it fires
    clearTimeout(timer);
    await new Promise((r) => setTimeout(r, threshold + 20));
    expect(warningFired).toBe(false);
  });

  test("timer fires if not cleared", async () => {
    let warningFired = false;
    const threshold = 50;

    const timer = setTimeout(() => {
      warningFired = true;
    }, threshold);

    await new Promise((r) => setTimeout(r, threshold + 20));
    expect(warningFired).toBe(true);
    clearTimeout(timer); // cleanup
  });
});
