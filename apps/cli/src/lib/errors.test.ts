import { describe, test, expect } from "bun:test";
import { UserCancelledError, CLIError } from "./errors.ts";

describe("UserCancelledError", () => {
  test("is an instance of Error", () => {
    const err = new UserCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UserCancelledError");
    expect(err.message).toBe("User cancelled");
  });
});

describe("CLIError", () => {
  test("has default exit code 1", () => {
    const err = new CLIError("something failed");
    expect(err).toBeInstanceOf(Error);
    expect(err.exitCode).toBe(1);
    expect(err.message).toBe("something failed");
  });

  test("accepts custom exit code", () => {
    const err = new CLIError("interrupted", 130);
    expect(err.exitCode).toBe(130);
  });

  test("accepts optional suggestion", () => {
    const err = new CLIError("not found", 1, "Run ai-git --setup");
    expect(err.suggestion).toBe("Run ai-git --setup");
  });
});
