import { DEFAULT_SLOW_WARNING_THRESHOLD_MS } from "../config.ts";

/**
 * Create a timer that fires a warning callback after `thresholdMs`.
 * Returns a cleanup function that cancels the timer.
 * If thresholdMs <= 0, no timer is created and cleanup is a no-op.
 */
export function createSlowWarningTimer(thresholdMs: number, onSlow: () => void): () => void {
  if (thresholdMs <= 0) return () => {};
  const timer = setTimeout(onSlow, thresholdMs);
  return () => clearTimeout(timer);
}

/**
 * Resolve the slow-warning threshold, falling back to
 * DEFAULT_SLOW_WARNING_THRESHOLD_MS.
 */
export function resolveSlowWarningThreshold(ctx: { slowWarningThresholdMs?: number }): number {
  return ctx.slowWarningThresholdMs ?? DEFAULT_SLOW_WARNING_THRESHOLD_MS;
}
