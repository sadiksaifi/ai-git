import { describe, test, expect } from "bun:test";
import { createActor, waitFor } from "xstate";
import {
  createDisplayStagedResultActor,
  createDisplayFileSummaryActor,
  createDisplayCommitResultActor,
  createDisplayValidationWarningsActor,
} from "./display.actors.ts";

describe("displayStagedResultActor", () => {
  test("calls resolver with input and completes without error", async () => {
    let receivedFiles: string[] = [];
    const actor = createDisplayStagedResultActor(async (input) => {
      receivedFiles = input.stagedFiles;
    });
    const a = createActor(actor, { input: { stagedFiles: ["a.ts", "b.ts"] } });
    a.start();
    await waitFor(a, (s) => s.status === "done");
    expect(receivedFiles).toEqual(["a.ts", "b.ts"]);
  });
});

describe("displayFileSummaryActor", () => {
  test("calls resolver and completes without error", async () => {
    let called = false;
    const actor = createDisplayFileSummaryActor(async () => {
      called = true;
    });
    const a = createActor(actor);
    a.start();
    await waitFor(a, (s) => s.status === "done");
    expect(called).toBe(true);
  });
});

describe("displayCommitResultActor", () => {
  test("calls resolver with commitResult input and completes", async () => {
    let receivedResult: unknown = null;
    const actor = createDisplayCommitResultActor(async (input) => {
      receivedResult = input.commitResult;
    });
    const commitResult = {
      hash: "abc1234",
      branch: "main",
      subject: "feat: add login",
      filesChanged: 2,
      insertions: 10,
      deletions: 3,
      files: [
        { status: "A", path: "src/login.ts" },
        { status: "M", path: "src/index.ts" },
      ],
      isRoot: false,
    };
    const a = createActor(actor, { input: { commitResult } });
    a.start();
    await waitFor(a, (s) => s.status === "done");
    expect(receivedResult).toEqual(commitResult);
  });
});

describe("displayValidationWarningsActor", () => {
  test("calls resolver with validation input and completes", async () => {
    let receivedInput: unknown = null;
    const actor = createDisplayValidationWarningsActor(async (input) => {
      receivedInput = input;
    });
    const input = {
      validationResult: {
        valid: true,
        errors: [{ rule: "lowercase-subject", severity: "important" as const, message: "Subject should be lowercase", suggestion: "Use lowercase" }],
      },
      autoRetries: 0,
      editedManually: false,
    };
    const a = createActor(actor, { input });
    a.start();
    await waitFor(a, (s) => s.status === "done");
    expect(receivedInput).toEqual(input);
  });
});
