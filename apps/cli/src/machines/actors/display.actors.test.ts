import { describe, test, expect } from "bun:test";
import { createActor, waitFor } from "xstate";
import {
  createDisplayStagedResultActor,
  createDisplayFileSummaryActor,
} from "./display.actors.ts";

describe("displayStagedResultActor", () => {
  test("calls resolver and completes without error", async () => {
    let called = false;
    const actor = createDisplayStagedResultActor(async () => {
      called = true;
    });
    const a = createActor(actor);
    a.start();
    await waitFor(a, (s) => s.status === "done");
    expect(called).toBe(true);
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
