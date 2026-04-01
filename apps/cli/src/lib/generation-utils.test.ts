import { describe, test, expect } from "bun:test";
import { DEFAULT_SLOW_WARNING_THRESHOLD_MS } from "../config.ts";
import { createSlowWarningTimer, resolveSlowWarningThreshold } from "./generation-utils.ts";
import { validateCommitMessage } from "./validation.ts";

describe("resolveSlowWarningThreshold", () => {
  test("DEFAULT_SLOW_WARNING_THRESHOLD_MS is a positive number", () => {
    expect(DEFAULT_SLOW_WARNING_THRESHOLD_MS).toBeGreaterThan(0);
    expect(typeof DEFAULT_SLOW_WARNING_THRESHOLD_MS).toBe("number");
  });

  test("defaults to DEFAULT_SLOW_WARNING_THRESHOLD_MS when undefined", () => {
    expect(resolveSlowWarningThreshold({})).toBe(DEFAULT_SLOW_WARNING_THRESHOLD_MS);
  });

  test("slowWarningThresholdMs of 0 disables the warning", () => {
    expect(resolveSlowWarningThreshold({ slowWarningThresholdMs: 0 })).toBe(0);
  });

  test("custom slowWarningThresholdMs overrides default", () => {
    expect(resolveSlowWarningThreshold({ slowWarningThresholdMs: 10_000 })).toBe(10_000);
  });
});

describe("createSlowWarningTimer", () => {
  test("returns no-op cleanup when threshold is 0", async () => {
    let called = false;
    const cleanup = createSlowWarningTimer(0, () => {
      called = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    cleanup();
    expect(called).toBe(false);
  });

  test("returns no-op cleanup when threshold is negative", async () => {
    let called = false;
    const cleanup = createSlowWarningTimer(-1, () => {
      called = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    cleanup();
    expect(called).toBe(false);
  });

  test("fires callback after threshold elapses", async () => {
    let called = false;
    const cleanup = createSlowWarningTimer(50, () => {
      called = true;
    });
    await new Promise((r) => setTimeout(r, 80));
    expect(called).toBe(true);
    cleanup(); // safe to call after fire
  });

  test("cleanup prevents callback from firing", async () => {
    let called = false;
    const cleanup = createSlowWarningTimer(50, () => {
      called = true;
    });
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

describe("validateCommitMessage: outputs that drive state transitions", () => {
  test("valid message should result in valid=true (→ prompt state)", () => {
    const result = validateCommitMessage("feat: add login");
    expect(result.valid).toBe(true);
    expect(result.errors.filter((e) => e.severity === "critical")).toHaveLength(0);
  });

  test("invalid message should result in valid=false (→ auto_retry state)", () => {
    const result = validateCommitMessage("This is not a conventional commit");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.severity === "critical")).toBe(true);
  });

  test("message with only non-critical errors should be valid=true (→ prompt with warnings)", () => {
    // Uppercase subject is "important" severity, not critical
    const result = validateCommitMessage("feat: Add login");
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.severity !== "critical")).toBe(true);
  });

  test("long header is critical error (→ auto_retry)", () => {
    const result = validateCommitMessage(
      "feat: this is a very long commit message header that exceeds fifty characters",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "header-length")).toBe(true);
  });
});
