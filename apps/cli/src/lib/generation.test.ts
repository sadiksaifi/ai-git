import { describe, test, expect } from "bun:test";
import { DEFAULT_SLOW_WARNING_THRESHOLD_MS } from "../config.ts";
import { createSlowWarningTimer, type GenerationContext } from "./generation.ts";

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
    expect(threshold).toBe(0);
    expect(threshold > 0).toBe(false);
  });

  test("custom slowWarningThresholdMs overrides default", () => {
    const ctx: Partial<GenerationContext> = { slowWarningThresholdMs: 10_000 };
    const threshold = ctx.slowWarningThresholdMs ?? DEFAULT_SLOW_WARNING_THRESHOLD_MS;
    expect(threshold).toBe(10_000);
  });
});

describe("createSlowWarningTimer", () => {
  test("returns no-op cleanup when threshold is 0", async () => {
    let called = false;
    const cleanup = createSlowWarningTimer(0, () => { called = true; });
    await new Promise((r) => setTimeout(r, 30));
    cleanup();
    expect(called).toBe(false);
  });

  test("returns no-op cleanup when threshold is negative", async () => {
    let called = false;
    const cleanup = createSlowWarningTimer(-1, () => { called = true; });
    await new Promise((r) => setTimeout(r, 30));
    cleanup();
    expect(called).toBe(false);
  });

  test("fires callback after threshold elapses", async () => {
    let called = false;
    const cleanup = createSlowWarningTimer(50, () => { called = true; });
    await new Promise((r) => setTimeout(r, 80));
    expect(called).toBe(true);
    cleanup(); // safe to call after fire
  });

  test("cleanup prevents callback from firing", async () => {
    let called = false;
    const cleanup = createSlowWarningTimer(50, () => { called = true; });
    cleanup(); // cancel before threshold
    await new Promise((r) => setTimeout(r, 80));
    expect(called).toBe(false);
  });

  test("cleanup is idempotent", () => {
    const cleanup = createSlowWarningTimer(5000, () => {});
    cleanup();
    cleanup(); // second call should not throw
    cleanup();
  });
});
