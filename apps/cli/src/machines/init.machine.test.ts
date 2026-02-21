import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { initMachine } from "./init.machine.ts";
import { UserCancelledError } from "../lib/errors.ts";

describe("initMachine", () => {
  // IN1: global config exists, copy to project
  test("IN1: copies global config to project", async () => {
    let savedConfig: any = null;
    const machine = initMachine.provide({
      actors: {
        loadProjectConfigActor: fromPromise(async () => null), // no existing project config
        loadGlobalConfigActor: fromPromise(async () => ({ provider: "claude-code", model: "claude-sonnet-4-5-20250514" })),
        selectActor: fromPromise(async () => "copy"),
        saveProjectConfigActor: fromPromise(async ({ input }: any) => { savedConfig = input.config; }),
        confirmActor: fromPromise(async () => true), // "try now?" → yes
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(savedConfig?.provider).toBe("claude-code");
    expect(snap.output.continue).toBe(true);
  });

  // IN2: global config exists, run wizard
  test("IN2: runs wizard when user chooses wizard", async () => {
    const machine = initMachine.provide({
      actors: {
        loadProjectConfigActor: fromPromise(async () => null),
        loadGlobalConfigActor: fromPromise(async () => ({ provider: "claude-code", model: "claude-sonnet-4-5-20250514" })),
        selectActor: fromPromise(async () => "wizard"),
        setupWizardMachine: fromPromise(async () => ({
          completed: true,
          config: { provider: "openai", model: "gpt-4o" },
        })),
        confirmActor: fromPromise(async () => false), // "try now?" → no
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.continue).toBe(false);
    expect(snap.output.exitCode).toBe(0);
  });

  // IN3: no global config, proceed to wizard
  test("IN3: no global config → wizard", async () => {
    const machine = initMachine.provide({
      actors: {
        loadProjectConfigActor: fromPromise(async () => null),
        loadGlobalConfigActor: fromPromise(async () => null), // no global
        confirmActor: fromPromise(async () => true), // proceed to wizard → yes
        setupWizardMachine: fromPromise(async () => ({
          completed: true,
          config: { provider: "claude-code", model: "claude-sonnet-4-5-20250514" },
        })),
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.continue).toBe(true);
  });

  // IN4: no global config, decline setup
  test("IN4: no global config, decline → exit", async () => {
    const machine = initMachine.provide({
      actors: {
        loadProjectConfigActor: fromPromise(async () => null),
        loadGlobalConfigActor: fromPromise(async () => null),
        confirmActor: fromPromise(async () => false), // decline
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.continue).toBe(false);
    expect(snap.output.exitCode).toBe(0);
  });

  // IN5: project config exists, overwrite confirmed
  test("IN5: existing project config, overwrite → continue", async () => {
    let confirmCount = 0;
    const machine = initMachine.provide({
      actors: {
        loadProjectConfigActor: fromPromise(async () => ({ provider: "old", model: "old" })),
        confirmActor: fromPromise(async () => {
          confirmCount++;
          return true; // overwrite=yes, tryNow=yes
        }),
        loadGlobalConfigActor: fromPromise(async () => ({ provider: "claude-code", model: "claude-sonnet-4-5-20250514" })),
        selectActor: fromPromise(async () => "copy"),
        saveProjectConfigActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.continue).toBe(true);
  });

  // IN6/IN7: decline overwrite → exit
  test("IN6: decline overwrite → exit ok", async () => {
    const machine = initMachine.provide({
      actors: {
        loadProjectConfigActor: fromPromise(async () => ({ provider: "old", model: "old" })),
        confirmActor: fromPromise(async () => false), // don't overwrite
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.continue).toBe(false);
    expect(snap.output.exitCode).toBe(0);
  });

  // IN8: cancel at init choice → exit error
  test("IN8: cancel at init choice → exit error", async () => {
    const machine = initMachine.provide({
      actors: {
        loadProjectConfigActor: fromPromise(async () => null),
        loadGlobalConfigActor: fromPromise(async () => ({ provider: "claude-code", model: "claude-sonnet-4-5-20250514" })),
        selectActor: fromPromise(async () => { throw new UserCancelledError(); }),
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.exitCode).toBe(1);
  });

  // Bug #4: wizard fails → exit error (no process.exit!)
  test("Bug #4: wizard fails → exit error without process.exit", async () => {
    const machine = initMachine.provide({
      actors: {
        loadProjectConfigActor: fromPromise(async () => null),
        loadGlobalConfigActor: fromPromise(async () => null),
        confirmActor: fromPromise(async () => true),
        setupWizardMachine: fromPromise(async () => ({
          completed: false,
          config: null,
        })),
      },
    });
    const actor = createActor(machine, { input: {} });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.exitCode).toBe(1);
    expect(snap.output.continue).toBe(false);
  });
});
