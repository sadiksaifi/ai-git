import { describe, test, expect } from "bun:test";
import { createActor, waitFor } from "xstate";
import { createDisplayStagedResultActor, createDisplayFileSummaryActor } from "./display.actors.ts";

describe("displayStagedResultActor", () => {
  test("calls resolver with input and completes without error", async () => {
    let receivedFiles: string[] = [];
    const actor = createDisplayStagedResultActor(async (input) => {
      receivedFiles = input.stagedFiles;
    });
    const a = createActor(actor, { input: { stagedFiles: ["a.ts", "b.ts"] } });
    a.start();
    await waitFor(a, (s) => s.status === "done");
    expect(receivedFiles).toEqual(["a.ts", "b.ts"]);
  });
});

describe("displayFileSummaryActor", () => {
  test("calls resolver and completes without error", async () => {
    let called = false;
    const actor = createDisplayFileSummaryActor(async () => {
      called = true;
    });
    const a = createActor(actor);
    a.start();
    await waitFor(a, (s) => s.status === "done");
    expect(called).toBe(true);
  });
});
