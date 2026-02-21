import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { pushMachine } from "./push.machine.ts";
import { UserCancelledError } from "../lib/errors.ts";

describe("pushMachine", () => {
  // PU1: --push flag → auto-push success
  test("PU1: --push flag triggers auto-push", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(true);
    expect(snap.output!.exitCode).toBe(0);
  });

  // PU8: push error
  test("PU8: push error exits gracefully", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {
          throw new Error("auth failed");
        }),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(false);
  });

  // PU2-PU3: missing remote → recovery flow
  test("PU3: missing remote in interactive mode → prompt to add", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {
          throw Object.assign(new Error(), {
            stderr: "No configured push destination",
          });
        }),
        // @ts-expect-error — XState v5 test mock type inference
        confirmActor: fromPromise(async () => true),
        // @ts-expect-error — XState v5 test mock type inference
        textActor: fromPromise(async () => "git@github.com:user/repo.git"),
        // @ts-expect-error — XState v5 test mock type inference
        addRemoteAndPushActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(true);
  });

  // PU2: missing remote in non-interactive mode → skip with log
  test("PU2: missing remote in non-interactive mode → skip", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {
          throw Object.assign(new Error(), {
            stderr: "No configured push destination",
          });
        }),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(false);
  });

  // PU4: add remote and push succeeds (covered in PU3 test above)

  // PU5: add remote and push fails
  test("PU5: add remote and push fails → error output", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {
          throw Object.assign(new Error(), {
            stderr: "No configured push destination",
          });
        }),
        // @ts-expect-error — XState v5 test mock type inference
        confirmActor: fromPromise(async () => true),
        // @ts-expect-error — XState v5 test mock type inference
        textActor: fromPromise(async () => "git@github.com:user/repo.git"),
        // @ts-expect-error — XState v5 test mock type inference
        addRemoteAndPushActor: fromPromise(async () => {
          throw new Error("permission denied");
        }),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(false);
  });

  // PU6: cancel at enter URL prompt
  test("PU6: cancel at enter URL prompt → skip", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {
          throw Object.assign(new Error(), {
            stderr: "No configured push destination",
          });
        }),
        // @ts-expect-error — XState v5 test mock type inference
        confirmActor: fromPromise(async () => true),
        // @ts-expect-error — XState v5 test mock type inference
        textActor: fromPromise(async () => {
          throw new UserCancelledError();
        }),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(false);
  });

  // PU7: decline to add remote
  test("PU7: decline to add remote → skip", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {
          throw Object.assign(new Error(), {
            stderr: "No configured push destination",
          });
        }),
        // @ts-expect-error — XState v5 test mock type inference
        confirmActor: fromPromise(async () => false),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(false);
  });

  // PU9: interactive mode → prompt → Yes
  test("PU9: interactive mode prompts user and pushes on yes", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        confirmActor: fromPromise(async () => true),
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(true);
  });

  // PU10: interactive mode → prompt → No
  test("PU10: interactive mode skips on no", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        confirmActor: fromPromise(async () => false),
      },
    });
    const actor = createActor(machine, {
      input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(false);
  });

  // PU11: non-interactive without --push → skip
  test("PU11: non-interactive without --push skips push", async () => {
    const actor = createActor(pushMachine, {
      input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(false);
  });

  // Cancel handling
  test("user cancel at push prompt → skip gracefully", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        confirmActor: fromPromise(async () => {
          throw new UserCancelledError();
        }),
      },
    });
    const actor = createActor(machine, {
      input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(false);
  });

  // dangerouslyAutoApprove mode → auto-push
  test("dangerouslyAutoApprove → auto-push without prompt", async () => {
    const machine = pushMachine.provide({
      actors: {
        // @ts-expect-error — XState v5 test mock type inference
        pushActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { push: false, dangerouslyAutoApprove: true, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snap.output!.pushed).toBe(true);
  });
});
