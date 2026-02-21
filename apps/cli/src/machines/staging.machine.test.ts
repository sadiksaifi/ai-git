import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { stagingMachine } from "./staging.machine.ts";

describe("stagingMachine", () => {
  // ST1: files already staged, no unstaged → proceed
  test("ST1: proceeds with existing staged files when no unstaged exist", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => ["a.ts", "b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => []),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.stagedFiles).toEqual(["a.ts", "b.ts"]);
    expect(snap.output!.aborted).toBe(false);
  });

  // ** BUG #1 REGRESSION TEST **
  test("ST5: stageAll flag auto-stages remaining unstaged files (Bug #1 fix)", async () => {
    let stageAllCalled = false;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => {
          return stageAllCalled ? ["a.ts", "b.ts", "c.ts"] : ["a.ts"];
        }),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts", "c.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          stageAllCalled = true;
        }),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: true, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(stageAllCalled).toBe(true); // KEY: stageAllExcept MUST be called
    expect(snap.output!.aborted).toBe(false);
  });

  // ST6: dangerouslyAutoApprove also triggers auto-staging
  test("ST6: dangerouslyAutoApprove auto-stages remaining (Bug #1 fix)", async () => {
    let stageAllCalled = false;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () =>
          stageAllCalled ? ["a.ts", "b.ts"] : ["a.ts"],
        ),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          stageAllCalled = true;
        }),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: true, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(stageAllCalled).toBe(true);
  });

  // ST7: nothing staged, nothing unstaged → clean
  test("ST7: clean working directory returns empty with no abort", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => []),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.stagedFiles).toEqual([]);
    expect(snap.output!.aborted).toBe(false);
  });

  // ST8: nothing staged + stageAll → auto-stage all
  test("ST8: stageAll with nothing staged stages everything", async () => {
    let staged = false;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => (staged ? ["a.ts"] : [])),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          staged = true;
        }),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: true, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(staged).toBe(true);
    expect(snap.output!.aborted).toBe(false);
  });

  // ST11: cancel → abort
  test("ST11: cancel in interactive mode aborts", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "cancel"),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
  });

  // ST9: interactive Stage All
  test("ST9: interactive Stage All stages everything", async () => {
    let staged = false;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () =>
          staged ? ["a.ts", "b.ts"] : [],
        ),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts", "b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "stage_all"),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          staged = true;
        }),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(staged).toBe(true);
  });

  // ST10: interactive select files
  test("ST10: interactive select files stages selected", async () => {
    let stagedFiles: string[] = [];
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(
          async () => (stagedFiles.length > 0 ? stagedFiles : []),
        ),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts", "b.ts", "c.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "select_files"),
        // @ts-expect-error — XState v5 test mock type inference
        multiselectActor: fromPromise(async () => ["a.ts", "c.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageFilesActor: fromPromise(
          async ({ input }: { input: { files: string[] } }) => {
            stagedFiles = input.files;
          },
        ),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(stagedFiles).toEqual(["a.ts", "c.ts"]);
  });

  // ST2: has staged + has unstaged, interactive → proceed with staged only
  test("ST2: proceed with staged files ignoring unstaged in interactive mode", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts", "c.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "proceed"),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.stagedFiles).toEqual(["a.ts"]);
    expect(snap.output!.aborted).toBe(false);
  });

  // ST3: has staged + has unstaged, interactive → select more files
  test("ST3: select additional files to stage in hasStaged path", async () => {
    let stagedFiles: string[] = [];
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () =>
          stagedFiles.length > 0 ? ["a.ts", ...stagedFiles] : ["a.ts"],
        ),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts", "c.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "select_files"),
        // @ts-expect-error — XState v5 test mock type inference
        multiselectActor: fromPromise(async () => ["b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageFilesActor: fromPromise(
          async ({ input }: { input: { files: string[] } }) => {
            stagedFiles = input.files;
          },
        ),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(stagedFiles).toEqual(["b.ts"]);
    expect(snap.output!.aborted).toBe(false);
  });

  // ST4: has staged + has unstaged, interactive → stage all
  test("ST4: stage all remaining in hasStaged path", async () => {
    let stageAllCalled = false;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () =>
          stageAllCalled ? ["a.ts", "b.ts", "c.ts"] : ["a.ts"],
        ),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts", "c.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "stage_all"),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          stageAllCalled = true;
        }),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(stageAllCalled).toBe(true);
    expect(snap.output!.aborted).toBe(false);
  });

  // ST12: cancel in hasStaged path
  test("ST12: cancel in hasStaged interactive prompt aborts", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "cancel"),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
  });

  // ST-ERR1: getStagedFiles error → aborted
  test("ST-ERR1: getStagedFiles error → aborted", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => {
          throw new Error("git failed");
        }),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {}),
        // @ts-expect-error — XState v5 test mock type inference
        stageFilesActor: fromPromise(async () => {}),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "proceed"),
        // @ts-expect-error — XState v5 test mock type inference
        multiselectActor: fromPromise(async () => []),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
  });

  // Exclude parameter is passed through to stageAllExcept
  test("exclude parameter is forwarded to stageAllExceptActor", async () => {
    let receivedExclude: string[] | undefined;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts", "b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(
          async ({ input }: { input: { exclude?: string[] } }) => {
            receivedExclude = input.exclude;
          },
        ),
      },
    });
    const actor = createActor(machine, {
      input: {
        stageAll: true,
        dangerouslyAutoApprove: false,
        exclude: ["*.lock"],
      },
    });
    actor.start();
    await waitFor(actor, (s) => s.status === "done");
    expect(receivedExclude).toEqual(["*.lock"]);
  });
});
