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
