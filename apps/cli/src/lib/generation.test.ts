import { describe, test, expect } from "bun:test";
import { DEFAULT_SLOW_WARNING_THRESHOLD_MS } from "../config.ts";
import { createSlowWarningTimer, resolveSlowWarningThreshold, type GenerationContext, type GenerationState } from "./generation.ts";
import { validateCommitMessage } from "./validation.ts";

describe("GenerationContext slow warning", () => {
  test("DEFAULT_SLOW_WARNING_THRESHOLD_MS is a positive number", () => {
    expect(DEFAULT_SLOW_WARNING_THRESHOLD_MS).toBeGreaterThan(0);
    expect(typeof DEFAULT_SLOW_WARNING_THRESHOLD_MS).toBe("number");
  });

  test("slowWarningThresholdMs defaults to DEFAULT_SLOW_WARNING_THRESHOLD_MS when undefined", () => {
    const ctx: Partial<GenerationContext> = {};
    expect(resolveSlowWarningThreshold(ctx as GenerationContext)).toBe(DEFAULT_SLOW_WARNING_THRESHOLD_MS);
  });

  test("slowWarningThresholdMs of 0 disables the warning", () => {
    const ctx: Partial<GenerationContext> = { slowWarningThresholdMs: 0 };
    const threshold = resolveSlowWarningThreshold(ctx as GenerationContext);
    expect(threshold).toBe(0);
  });

  test("custom slowWarningThresholdMs overrides default", () => {
    const ctx: Partial<GenerationContext> = { slowWarningThresholdMs: 10_000 };
    expect(resolveSlowWarningThreshold(ctx as GenerationContext)).toBe(10_000);
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

describe("GenerationState type", () => {
  test("state types are well-formed discriminated union", () => {
    // Type-level test: ensure all state variants compile
    const states: GenerationState[] = [
      { type: "generate" },
      { type: "validate", message: "feat: test" },
      { type: "auto_retry", message: "feat: test", errors: ["too long"] },
      { type: "prompt", message: "feat: test", validationFailed: false, warnings: [] },
      { type: "retry", message: "feat: test" },
      { type: "edit", message: "feat: test" },
      { type: "done", result: { message: "feat: test", committed: true, aborted: false } },
    ];
    expect(states).toHaveLength(7);
  });
});

describe("State machine: validation → state transitions", () => {
  test("valid message should result in valid=true (→ prompt state)", () => {
    const result = validateCommitMessage("feat: add login");
    expect(result.valid).toBe(true);
    expect(result.errors.filter(e => e.severity === "critical")).toHaveLength(0);
  });

  test("invalid message should result in valid=false (→ auto_retry state)", () => {
    const result = validateCommitMessage("This is not a conventional commit");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.severity === "critical")).toBe(true);
  });

  test("message with only non-critical errors should be valid=true (→ prompt with warnings)", () => {
    // Uppercase subject is "important" severity, not critical
    const result = validateCommitMessage("feat: Add login");
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every(e => e.severity !== "critical")).toBe(true);
  });

  test("long header is critical error (→ auto_retry)", () => {
    const result = validateCommitMessage("feat: this is a very long commit message header that exceeds fifty characters");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.rule === "header-length")).toBe(true);
  });
});
