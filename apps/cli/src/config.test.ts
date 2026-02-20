import { describe, test, expect } from "bun:test";
import { DEFAULT_SLOW_WARNING_THRESHOLD_MS } from "./config.ts";

describe("DEFAULT_SLOW_WARNING_THRESHOLD_MS", () => {
  test("is exported and equals 5000", () => {
    expect(DEFAULT_SLOW_WARNING_THRESHOLD_MS).toBe(5_000);
  });
});
