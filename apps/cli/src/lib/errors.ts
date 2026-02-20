/**
 * Thrown when a user cancels a @clack/prompts interaction (Ctrl+C or cancel).
 * Used uniformly across all fromPromise() prompt actors.
 */
export class UserCancelledError extends Error {
  override name = "UserCancelledError" as const;
  constructor() {
    super("User cancelled");
  }
}

/**
 * Typed CLI error with exit code and optional user-facing suggestion.
 * Replaces scattered process.exit() calls throughout the codebase.
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1,
    public suggestion?: string,
  ) {
    super(message);
  }
}

/**
 * Extract a human-readable error message from any thrown value.
 * Handles: Error instances, shell errors with stderr, strings, and unknown types.
 * Replaces 5+ different error extraction patterns across the codebase.
 */
export function extractErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return "Unknown error";

  // Shell errors from Bun.$ have a stderr property
  if (typeof error === "object" && "stderr" in error) {
    const stderr = (error as { stderr: unknown }).stderr;
    const str = stderr instanceof Buffer ? stderr.toString() : String(stderr);
    return str.trim() || "Unknown error";
  }

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  return String(error);
}
