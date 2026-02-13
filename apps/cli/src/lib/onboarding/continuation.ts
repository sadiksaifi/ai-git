// ==============================================================================
// ONBOARDING CONTINUATION DECISION
// ==============================================================================

/**
 * Determine whether the CLI should exit immediately after onboarding.
 * Returning true exits setup flow; false continues into normal execution.
 */
export function shouldExitAfterOnboarding(continueToRun: boolean): boolean {
  return !continueToRun;
}
