// @ts-nocheck — XState v5 strict generic inference doesn't match test mock types
import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { setupWizardMachine } from "./setup-wizard.machine.ts";

describe("setupWizardMachine", () => {
  // SW1: CLI happy path
  test("SW1: wizard completes successfully with CLI provider", async () => {
    const machine = setupWizardMachine.provide({
      actors: {
        runWizardActor: fromPromise(async () => ({
          completed: true,
          config: { provider: "claude-code", model: "claude-sonnet-4-5-20250514" },
        })),
      },
    });
    const actor = createActor(machine, {
      input: { target: "global" as const, defaults: undefined },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.completed).toBe(true);
    expect(snap.output.config?.provider).toBe("claude-code");
  });

  // SW12-SW15: cancel paths
  test("SW12: wizard cancelled returns completed=false", async () => {
    const machine = setupWizardMachine.provide({
      actors: {
        runWizardActor: fromPromise(async () => ({
          completed: false,
          config: null,
        })),
      },
    });
    const actor = createActor(machine, {
      input: { target: "global" as const, defaults: undefined },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.completed).toBe(false);
    expect(snap.output.config).toBeNull();
  });

  // SW4-SW11: API happy path
  test("SW4: wizard completes with API provider", async () => {
    const machine = setupWizardMachine.provide({
      actors: {
        runWizardActor: fromPromise(async () => ({
          completed: true,
          config: { provider: "openai", model: "gpt-4o" },
        })),
      },
    });
    const actor = createActor(machine, {
      input: { target: "project" as const, defaults: undefined },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.completed).toBe(true);
    expect(snap.output.config?.provider).toBe("openai");
  });

  // Wizard error
  test("wizard error returns completed=false", async () => {
    const machine = setupWizardMachine.provide({
      actors: {
        runWizardActor: fromPromise(async () => {
          throw new Error("unexpected error");
        }),
      },
    });
    const actor = createActor(machine, {
      input: { target: "global" as const, defaults: undefined },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.completed).toBe(false);
    expect(snap.output.config).toBeNull();
  });

  // Test that defaults are forwarded
  test("forwards defaults to wizard", async () => {
    let receivedInput: any = null;
    const machine = setupWizardMachine.provide({
      actors: {
        runWizardActor: fromPromise(async ({ input }) => {
          receivedInput = input;
          return { completed: true, config: { provider: "openai", model: "gpt-4o" } };
        }),
      },
    });
    const actor = createActor(machine, {
      input: { target: "global" as const, defaults: { provider: "openai" } },
    });
    actor.start();
    await waitFor(actor, (s) => s.status === "done");
    expect(receivedInput.defaults?.provider).toBe("openai");
  });
});
