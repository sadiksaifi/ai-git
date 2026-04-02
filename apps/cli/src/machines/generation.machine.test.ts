import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { generationMachine } from "./generation.machine.ts";

const mockInput = (overrides: Record<string, unknown> = {}) => {
  const { options: optOverrides, ...rest } = overrides as { options?: Record<string, unknown> };
  return {
    model: "test-model",
    modelName: "Test Model",
    options: {
      commit: false,
      dangerouslyAutoApprove: false,
      dryRun: false,
      hint: undefined as string | undefined,
      ...optOverrides,
    },
    slowWarningThresholdMs: 0,
    ...rest,
  };
};

describe("generationMachine", () => {
  // GN4: valid message → prompt → commit → done (happy path)
  test("GN4: valid message → commit → done", async () => {
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({
          diff: "diff content",
          commits: "recent commits",
          fileList: "M file.ts",
        })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: add login"),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "commit"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "abc1234",
          branch: "main",
          subject: "feat: add login",
          filesChanged: 1,
          insertions: 10,
          deletions: 0,
          files: [],
          isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.committed).toBe(true);
    expect(snap.output!.aborted).toBe(false);
  });

  // GN6: auto-retry on validation failure (up to 3)
  test("GN6: auto-retries up to 3 times on critical validation errors", async () => {
    let callCount = 0;
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({
          diff: "",
          commits: "",
          fileList: "",
        })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => {
          callCount++;
          // Return invalid messages first (no conventional commit type)
          if (callCount <= 3) return "This is not a valid conventional commit message at all";
          return "feat: add login";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "commit"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "abc",
          branch: "main",
          subject: "feat: add login",
          filesChanged: 1,
          insertions: 1,
          deletions: 0,
          files: [],
          isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 10000 });
    expect(callCount).toBe(4); // 3 retries + 1 success
    expect(snap.output!.committed).toBe(true);
  });

  // ** BUG #3 REGRESSION TEST **
  test("Bug #3: AI provider error returns done(aborted) instead of exit", async () => {
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({
          diff: "",
          commits: "",
          fileList: "",
        })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => {
          throw new Error("API rate limit exceeded");
        }),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    // KEY: machine reaches done state (no process.exit)
    expect(snap.output!.aborted).toBe(true);
    expect(snap.output!.committed).toBe(false);
  });

  // GN11: empty AI response → fatal → done(aborted)
  test("Bug #3: empty AI response returns done(aborted)", async () => {
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({
          diff: "",
          commits: "",
          fileList: "",
        })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "```\n```"), // Only code blocks → empty after cleanup
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
  });

  // GN14: dry-run
  test("GN14: dry-run skips AI call and returns done", async () => {
    let aiCalled = false;
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({
          diff: "diff",
          commits: "",
          fileList: "",
        })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => {
          aiCalled = true;
          return "";
        }),
      },
    });
    const actor = createActor(machine, {
      input: mockInput({ options: { commit: false, dangerouslyAutoApprove: false, dryRun: true } }),
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(aiCalled).toBe(false);
    expect(snap.output!.aborted).toBe(false);
    expect(snap.output!.committed).toBe(false);
  });

  // GN22: cancel at menu → abort
  test("GN22: cancel at action menu aborts", async () => {
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: add login"),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "cancel"),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
  });

  // GN15: --commit flag → auto-commit
  test("GN15: auto-commit with --commit flag", async () => {
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: add login"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "abc",
          branch: "main",
          subject: "feat: add login",
          filesChanged: 1,
          insertions: 1,
          deletions: 0,
          files: [],
          isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, {
      input: mockInput({ options: { commit: true, dangerouslyAutoApprove: false, dryRun: false } }),
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.committed).toBe(true);
  });

  // GN24: retry with refinement instructions
  test("GN24: retry with instructions regenerates", async () => {
    let genCount = 0;
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => {
          genCount++;
          return "feat: add login";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => (genCount === 1 ? "retry" : "commit")),
        // @ts-expect-error — XState v5 test mock type inference
        textActor: fromPromise(async () => "Make it shorter"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "abc",
          branch: "main",
          subject: "feat: add login",
          filesChanged: 1,
          insertions: 1,
          deletions: 0,
          files: [],
          isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 10000 });
    expect(genCount).toBe(2);
    expect(snap.output!.committed).toBe(true);
  });

  // GN-ERR: gatherContext failure → aborted
  test("GN-ERR: gatherContext failure → aborted", async () => {
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async (): Promise<string> => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => {
          throw new Error("git failed");
        }),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async (): Promise<string> => ""),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "",
          branch: "",
          subject: "",
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          files: [] as string[],
          isRoot: false,
        })),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async (): Promise<string> => "commit"),
        // @ts-expect-error — XState v5 test mock type inference
        textActor: fromPromise(async (): Promise<string> => ""),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.aborted).toBe(true);
  });

  // dangerouslyAutoApprove auto-commits
  test("dangerouslyAutoApprove auto-commits without prompt", async () => {
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: add login"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "abc",
          branch: "main",
          subject: "feat: add login",
          filesChanged: 1,
          insertions: 1,
          deletions: 0,
          files: [],
          isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, {
      input: mockInput({ options: { commit: false, dangerouslyAutoApprove: true, dryRun: false } }),
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.committed).toBe(true);
  });

  // promptCustomization is forwarded to buildSystemPrompt
  test("promptCustomization is forwarded to invokeAIActor input", async () => {
    let capturedSystem = "";
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async ({ input }: { input: { system: string } }) => {
          capturedSystem = input.system;
          return "feat: add login";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "cancel"),
      },
    });
    const actor = createActor(machine, {
      input: mockInput({
        promptCustomization: {
          context: "This is a React project",
        },
      }),
    });
    actor.start();
    await waitFor(actor, (s) => s.status === "done");
    expect(capturedSystem).toContain("This is a React project");
  });

  // AC-3: commit result display actor is invoked after commit
  test("displayCommitResultActor is invoked after successful commit", async () => {
    let displayCalled = false;
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: add login"),
        // @ts-expect-error — XState v5 test mock type inference
        displayCommitMessageActor: fromPromise(async () => {}),
        // @ts-expect-error — XState v5 test mock type inference
        displayValidationWarningsActor: fromPromise(async () => {}),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "commit"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "abc1234",
          branch: "main",
          subject: "feat: add login",
          filesChanged: 1,
          insertions: 10,
          deletions: 0,
          files: [],
          isRoot: false,
        })),
        // @ts-expect-error — XState v5 test mock type inference
        displayCommitResultActor: fromPromise(async () => {
          displayCalled = true;
        }),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.committed).toBe(true);
    expect(displayCalled).toBe(true);
  });

  // AC-4: validation warnings display actor is invoked
  test("displayValidationWarningsActor is invoked when entering prompt", async () => {
    let warningsCalled = false;
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: add login"),
        // @ts-expect-error — XState v5 test mock type inference
        displayCommitMessageActor: fromPromise(async () => {}),
        // @ts-expect-error — XState v5 test mock type inference
        displayValidationWarningsActor: fromPromise(async () => {
          warningsCalled = true;
        }),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "cancel"),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
    expect(warningsCalled).toBe(true);
  });

  // Edit happy path: select edit → editor returns edited message → commit
  test("edit flow: editor returns edited message, then commit", async () => {
    let menuCount = 0;
    let committedMessage = "";
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: original message"),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => {
          menuCount++;
          return menuCount === 1 ? "edit" : "commit";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        editorActor: fromPromise(async () => "feat: edited message"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async ({ input }: { input: { message: string } }) => {
          committedMessage = input.message;
          return {
            hash: "abc",
            branch: "main",
            subject: input.message,
            filesChanged: 1,
            insertions: 1,
            deletions: 0,
            files: [],
            isRoot: false,
          };
        }),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 10000 });
    expect(snap.output!.committed).toBe(true);
    expect(snap.context.editedManually).toBe(true);
    expect(snap.context.autoRetries).toBe(3);
    expect(committedMessage).toBe("feat: edited message");
  });

  // Empty edit returns to prompt menu (user can pick another option)
  test("edit flow: empty edit returns to prompt, then cancel aborts", async () => {
    let menuCount = 0;
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: original"),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => {
          menuCount++;
          return menuCount === 1 ? "edit" : "cancel";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        editorActor: fromPromise(async () => {
          const { EmptyEditError } = await import("../lib/errors.ts");
          throw new EmptyEditError();
        }),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 10000 });
    expect(snap.output!.aborted).toBe(true);
    expect(menuCount).toBe(2); // Menu shown twice: first "edit", then "cancel"
  });

  // No editor found → validate with original message (AC-6)
  test("edit flow: no editor falls back to validate with original message", async () => {
    let menuCount = 0;
    let committedMessage = "";
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => "feat: original"),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => {
          menuCount++;
          return menuCount === 1 ? "edit" : "commit";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        editorActor: fromPromise(async () => {
          const { NoEditorError } = await import("../lib/errors.ts");
          throw new NoEditorError();
        }),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async ({ input }: { input: { message: string } }) => {
          committedMessage = input.message;
          return {
            hash: "abc",
            branch: "main",
            subject: "feat: original",
            filesChanged: 1,
            insertions: 1,
            deletions: 0,
            files: [],
            isRoot: false,
          };
        }),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 10000 });
    expect(snap.output!.committed).toBe(true);
    expect(snap.context.editedManually).toBe(false); // edit never completed
    expect(committedMessage).toBe("feat: original"); // original message preserved
  });

  // editedManually prevents auto-retry (autoRetries set to 3)
  test("edit flow: edited invalid message skips auto-retry, goes to prompt", async () => {
    let menuCount = 0;
    let aiCallCount = 0;
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => {
          aiCallCount++;
          return "feat: add login";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => {
          menuCount++;
          return menuCount === 1 ? "edit" : "commit";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        editorActor: fromPromise(async () => "not a valid conventional commit"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "abc",
          branch: "main",
          subject: "not valid",
          filesChanged: 1,
          insertions: 1,
          deletions: 0,
          files: [],
          isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 10000 });
    // Should have gone to prompt (not auto-retry) because autoRetries = 3
    expect(snap.output!.committed).toBe(true);
    expect(menuCount).toBe(2); // Menu shown after original + after edit
    expect(aiCallCount).toBe(1); // AI called once (no hidden retries after edit)
  });

  // Bug: user retry after exhausted auto-retries should get fresh auto-retry budget
  test("user retry resets auto-retry budget for next generation cycle", async () => {
    let genCount = 0;
    let autoRetryCount = 0;
    const machine = generationMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getBranchNameActor: fromPromise(async () => "main"),
        // @ts-expect-error — XState v5 test mock type inference
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        // @ts-expect-error — XState v5 test mock type inference
        invokeAIActor: fromPromise(async () => {
          genCount++;
          // First 4 calls: invalid (3 auto-retries + 1 initial = 4 calls before prompt)
          // After user retry: 4 more invalid calls (3 auto-retries + 1 = 4)
          // Then: valid message
          if (genCount <= 8) return "This is not a valid conventional commit message at all";
          return "feat: add login";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        displayCommitMessageActor: fromPromise(async () => {}),
        // @ts-expect-error — XState v5 test mock type inference
        displayValidationWarningsActor: fromPromise(async () => {}),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => {
          // First prompt (after 4 invalid): retry
          // Second prompt (after 4 more invalid): commit
          autoRetryCount++;
          return autoRetryCount === 1 ? "retry" : "commit";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        textActor: fromPromise(async () => "try harder"),
        // @ts-expect-error — XState v5 test mock type inference
        commitActor: fromPromise(async () => ({
          hash: "abc",
          branch: "main",
          subject: "feat: add login",
          filesChanged: 1,
          insertions: 1,
          deletions: 0,
          files: [],
          isRoot: false,
        })),
        // @ts-expect-error — XState v5 test mock type inference
        displayCommitResultActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, { input: mockInput() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 15000 });
    // 4 calls (initial + 3 auto-retries) + 4 calls (retry + 3 auto-retries) = 8
    // Second prompt: user commits with the invalid message (menu allows "commit with warnings")
    expect(genCount).toBe(8);
    expect(snap.output!.committed).toBe(true);
  });
});
