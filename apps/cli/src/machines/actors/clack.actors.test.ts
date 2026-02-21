import { describe, test, expect } from "bun:test";
import { createActor, waitFor } from "xstate";
import { UserCancelledError } from "../../lib/errors.ts";
import {
  createSelectActor,
  createConfirmActor,
  createTextActor,
  createMultiselectActor,
} from "./clack.actors.ts";

// We test the actor factory functions, not the actual @clack/prompts calls.
// The factories accept a resolver function so we can inject mocks.

describe("createSelectActor", () => {
  test("returns user selection on success", async () => {
    const actor = createSelectActor(async (opts) => "commit");
    const ref = createActor(actor, { input: { message: "Action", options: [] } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe("commit");
  });

  test("throws UserCancelledError when resolver returns cancel symbol", async () => {
    const actor = createSelectActor(async () => Symbol.for("cancel"));
    const ref = createActor(actor, { input: { message: "Action", options: [] } });
    ref.start();
    try {
      await waitFor(ref, (s) => s.status === "done");
      // If we get here, the test should fail
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(UserCancelledError);
    }
  });
});

describe("createConfirmActor", () => {
  test("returns boolean on success", async () => {
    const actor = createConfirmActor(async () => true);
    const ref = createActor(actor, { input: { message: "Continue?" } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe(true);
  });
});

describe("createTextActor", () => {
  test("returns trimmed text on success", async () => {
    const actor = createTextActor(async () => "  hello  ");
    const ref = createActor(actor, { input: { message: "Enter text" } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe("hello");
  });
});

describe("createMultiselectActor", () => {
  test("returns selected array on success", async () => {
    const actor = createMultiselectActor(async () => ["a.ts", "b.ts"]);
    const ref = createActor(actor, { input: { message: "Select files", options: [] } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toEqual(["a.ts", "b.ts"]);
  });
});
