import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { upgradeMachine } from "./upgrade.machine.ts";

describe("upgradeMachine", () => {
  // Note: upgradeMachine maps all onDone outcomes to exitCode: 0 because
  // delegation is handled entirely within runUpgrade(). These tests verify
  // the machine completes successfully regardless of the internal path taken.

  // UP1-UP3: package manager delegation
  test("UP1: brew install delegates to brew", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => ({ delegated: true, method: "brew" })),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(0);
  });

  test("UP2: npm install delegates to npm", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => ({ delegated: true, method: "npm" })),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(0);
  });

  test("UP3: source install delegates to git pull", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => ({ delegated: true, method: "source" })),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(0);
  });

  // UP4: already on latest
  test("UP4: already on latest version", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => ({ delegated: false, updated: false })),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(0);
  });

  // UP5: self-update success
  test("UP5: self-update success", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => ({ delegated: false, updated: true })),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(0);
  });

  // UP6: fetch release error
  test("UP6: fetch release error returns exitCode 1", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => {
          throw new Error("Failed to fetch release");
        }),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(1);
  });

  // UP7: download HTTP error
  test("UP7: download HTTP error returns exitCode 1", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => {
          throw new Error("Failed to download binary (HTTP 404)");
        }),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(1);
  });

  // UP8: checksum mismatch
  test("UP8: checksum mismatch returns exitCode 1", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => {
          throw new Error("Checksum verification failed");
        }),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(1);
  });

  // UP9: permission denied
  test("UP9: permission denied returns exitCode 1", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => {
          throw new Error("Permission denied");
        }),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(1);
  });

  // UP10: unsupported platform
  test("UP10: unsupported platform returns exitCode 1", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => {
          throw new Error("Unsupported platform");
        }),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(1);
  });

  // Bug #5: checkBinary - binary not found after extraction
  test("Bug #5: machine handles binary not found error", async () => {
    const machine = upgradeMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        runUpgradeActor: fromPromise(async () => {
          throw new Error("Extracted binary not found");
        }),
      },
    });
    const actor = createActor(machine, { input: { version: "1.0.0" } });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output!.exitCode).toBe(1);
  });

  // Test that version is forwarded to the actor
  test("forwards version to upgrade actor", async () => {
    let receivedInput: any = null;
    const machine = upgradeMachine.provide({
      actors: {
        runUpgradeActor: fromPromise(async ({ input }) => {
          receivedInput = input;
          return { delegated: false, updated: true };
        }),
      },
    });
    const actor = createActor(machine, { input: { version: "2.5.0" } });
    actor.start();
    await waitFor(actor, (s) => s.status === "done");
    expect(receivedInput.version).toBe("2.5.0");
  });
});
