import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { stagingMachine } from "./staging.machine.ts";

// Shared no-op display actor mocks — used in every test
const displayMocks = {
  displayStagedResultActor: fromPromise(async () => {}),
  displayFileSummaryActor: fromPromise(async () => {}),
};

describe("stagingMachine", () => {
  // ST1: files already staged, no unstaged → showResult → done
  test("ST1: proceeds with existing staged files when no unstaged exist", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => ["a.ts", "b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => []),
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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
        ...displayMocks,
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

  // ST-AUTO1: dangerouslyAutoApprove + no files staged + has unstaged → auto-stage
  test("ST-AUTO1: dangerouslyAutoApprove with nothing staged auto-stages all", async () => {
    let staged = false;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => (staged ? ["a.ts", "b.ts"] : [])),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts", "b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          staged = true;
        }),
        ...displayMocks,
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: true, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(staged).toBe(true);
    expect(snap.output!.stagedFiles).toEqual(["a.ts", "b.ts"]);
    expect(snap.output!.aborted).toBe(false);
  });

  // ST-AUTO2: stageAll + some staged + exclude → stages remaining, respects exclude
  test("ST-AUTO2: stageAll with pre-staged files and exclude pattern", async () => {
    let receivedExclude: string[] | undefined;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts", "c.lock"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(
          async ({ input }: { input: { exclude?: string[] } }) => {
            receivedExclude = input.exclude;
          },
        ),
        ...displayMocks,
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: true, dangerouslyAutoApprove: false, exclude: ["*.lock"] },
    });
    actor.start();
    await waitFor(actor, (s) => s.status === "done");
    expect(receivedExclude).toEqual(["*.lock"]);
  });

  // ST-AUTO3: dangerouslyAutoApprove + some staged + exclude → stages remaining, respects exclude
  test("ST-AUTO3: dangerouslyAutoApprove with pre-staged files and exclude", async () => {
    let receivedExclude: string[] | undefined;
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
        stageAllExceptActor: fromPromise(
          async ({ input }: { input: { exclude?: string[] } }) => {
            receivedExclude = input.exclude;
            stageAllCalled = true;
          },
        ),
        ...displayMocks,
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: true, exclude: ["*.env"] },
    });
    actor.start();
    await waitFor(actor, (s) => s.status === "done");
    expect(stageAllCalled).toBe(true);
    expect(receivedExclude).toEqual(["*.env"]);
  });

  // ST-AUTO4: both stageAll + dangerouslyAutoApprove → auto-stages (no double-stage)
  test("ST-AUTO4: both flags together auto-stages once", async () => {
    let stageCallCount = 0;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () =>
          stageCallCount > 0 ? ["a.ts", "b.ts"] : ["a.ts"],
        ),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          stageCallCount++;
        }),
        ...displayMocks,
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: true, dangerouslyAutoApprove: true, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(stageCallCount).toBe(1);
    expect(snap.output!.stagedFiles).toEqual(["a.ts", "b.ts"]);
    expect(snap.output!.aborted).toBe(false);
  });

  // ST-ERR2: stageAllExcept error in hasStaged path → aborted
  test("ST-ERR2: stageAllExcept error in hasStaged path aborts", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          throw new Error("git add failed");
        }),
        ...displayMocks,
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: true, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
  });

  // ST-ERR3: stageAllExcept error in noneStaged auto-stage → aborted
  test("ST-ERR3: stageAllExcept error in noneStaged path aborts", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        stageAllExceptActor: fromPromise(async () => {
          throw new Error("git add failed");
        }),
        ...displayMocks,
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: true, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
  });

  // ST13: multiselect 0 files in hasStaged → proceed with existing staged
  test("ST13: selecting zero files in hasStaged proceeds with existing", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["b.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "select_files"),
        // @ts-expect-error — XState v5 test mock type inference
        multiselectActor: fromPromise(async () => []),
        ...displayMocks,
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

  // ST14: Ctrl+C during multiselect in noneStaged → aborted
  test("ST14: Ctrl+C during multiselect in noneStaged aborts", async () => {
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "select_files"),
        // @ts-expect-error — XState v5 test mock type inference
        multiselectActor: fromPromise(async () => {
          throw new Error("User cancelled");
        }),
        ...displayMocks,
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
  });

  // Display actor tests — verify display actors are invoked
  test("showResult invokes displayStagedResultActor", async () => {
    let displayCalled = false;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        displayStagedResultActor: fromPromise(async () => {
          displayCalled = true;
        }),
        // @ts-expect-error — XState v5 test mock type inference
        displayFileSummaryActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    await waitFor(actor, (s) => s.status === "done");
    expect(displayCalled).toBe(true);
  });

  test("showFileSummary invokes displayFileSummaryActor before prompt", async () => {
    const callOrder: string[] = [];
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        displayFileSummaryActor: fromPromise(async () => {
          callOrder.push("summary");
        }),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => {
          callOrder.push("select");
          return "cancel";
        }),
        // @ts-expect-error — XState v5 test mock type inference
        displayStagedResultActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    await waitFor(actor, (s) => s.status === "done");
    expect(callOrder).toEqual(["summary", "select"]);
  });

  // Negative test: displayStagedResultActor should NOT be called on abort
  test("displayStagedResultActor is not invoked when machine aborts", async () => {
    let displayCalled = false;
    const machine = stagingMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        getStagedFilesActor: fromPromise(async () => []),
        // @ts-expect-error — XState v5 test mock type inference
        getUnstagedFilesActor: fromPromise(async () => ["a.ts"]),
        // @ts-expect-error — XState v5 test mock type inference
        selectActor: fromPromise(async () => "cancel"),
        // @ts-expect-error — XState v5 test mock type inference
        displayStagedResultActor: fromPromise(async () => {
          displayCalled = true;
        }),
        // @ts-expect-error — XState v5 test mock type inference
        displayFileSummaryActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false, exclude: [] },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.aborted).toBe(true);
    expect(displayCalled).toBe(false);
  });
});
