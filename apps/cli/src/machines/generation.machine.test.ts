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
});
