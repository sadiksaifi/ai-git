import { describe, test, expect } from "bun:test";
import { createActor, waitFor } from "xstate";
import { createInvokeAIActor } from "./ai.actors.ts";

describe("createInvokeAIActor", () => {
  test("returns raw message from AI adapter", async () => {
    const actor = createInvokeAIActor(async () => "feat: add login");
    const ref = createActor(actor, {
      input: {
        model: "test",
        system: "system prompt",
        prompt: "user prompt",
        modelName: "Test Model",
        slowThresholdMs: 0,
      },
    });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe("feat: add login");
  });

  test("propagates AI errors", async () => {
    const actor = createInvokeAIActor(async () => {
      throw new Error("API rate limit exceeded");
    });
    const ref = createActor(actor, {
      input: {
        model: "test",
        system: "",
        prompt: "",
        modelName: "Test",
        slowThresholdMs: 0,
      },
    });
    ref.start();
    // XState v5: waitFor throws when actor errors
    try {
      await waitFor(ref, (s) => s.status === "done");
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect((e as Error).message).toBe("API rate limit exceeded");
    }
  });
});
