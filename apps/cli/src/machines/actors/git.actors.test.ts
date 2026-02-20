import { describe, test, expect } from "bun:test";
import { createActor, waitFor } from "xstate";
import {
  createCheckGitInstalledActor,
  createCheckInsideRepoActor,
  createGetStagedFilesActor,
  createGetUnstagedFilesActor,
  createStageAllExceptActor,
  createStageFilesActor,
  createCommitActor,
  createPushActor,
} from "./git.actors.ts";
import { CLIError } from "../../lib/errors.ts";

describe("createCheckGitInstalledActor", () => {
  test("resolves when checker succeeds", async () => {
    const actor = createCheckGitInstalledActor(async () => {});
    const ref = createActor(actor);
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.status).toBe("done");
  });

  test("rejects with CLIError when checker throws", async () => {
    const actor = createCheckGitInstalledActor(async () => {
      throw new CLIError("git is not installed");
    });
    const ref = createActor(actor);
    ref.start();
    // XState v5 waitFor throws when the actor errors
    try {
      await waitFor(ref, (s) => s.status === "done");
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
    }
  });
});

describe("createCheckInsideRepoActor", () => {
  test("resolves when checker succeeds", async () => {
    const actor = createCheckInsideRepoActor(async () => {});
    const ref = createActor(actor);
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.status).toBe("done");
  });

  test("rejects with CLIError when checker throws", async () => {
    const actor = createCheckInsideRepoActor(async () => {
      throw new CLIError("Not inside a git repository");
    });
    const ref = createActor(actor);
    ref.start();
    try {
      await waitFor(ref, (s) => s.status === "done");
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
    }
  });
});

describe("createGetStagedFilesActor", () => {
  test("returns file list from resolver", async () => {
    const actor = createGetStagedFilesActor(async () => ["a.ts", "b.ts"]);
    const ref = createActor(actor);
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toEqual(["a.ts", "b.ts"]);
  });
});

describe("createGetUnstagedFilesActor", () => {
  test("returns file list from resolver", async () => {
    const actor = createGetUnstagedFilesActor(async () => ["c.ts"]);
    const ref = createActor(actor);
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toEqual(["c.ts"]);
  });
});

describe("createStageFilesActor", () => {
  test("calls resolver with files input", async () => {
    let calledWith: string[] = [];
    const actor = createStageFilesActor(async (files) => {
      calledWith = files;
    });
    const ref = createActor(actor, { input: { files: ["x.ts", "y.ts"] } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.status).toBe("done");
    expect(calledWith).toEqual(["x.ts", "y.ts"]);
  });
});

describe("createStageAllExceptActor", () => {
  test("calls resolver with exclude input", async () => {
    let calledWith: string[] | undefined;
    const actor = createStageAllExceptActor(async (exclude) => {
      calledWith = exclude;
    });
    const ref = createActor(actor, {
      input: { exclude: ["lock.json"] },
    });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.status).toBe("done");
    expect(calledWith).toEqual(["lock.json"]);
  });
});

describe("createCommitActor", () => {
  test("returns commit result from resolver", async () => {
    const mockResult = {
      hash: "abc1234",
      branch: "main",
      subject: "feat: test",
      filesChanged: 1,
      insertions: 5,
      deletions: 0,
      files: [],
      isRoot: false,
    };
    const actor = createCommitActor(async () => mockResult);
    const ref = createActor(actor, { input: { message: "feat: test" } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toEqual(mockResult);
  });
});

describe("createPushActor", () => {
  test("resolves when push succeeds", async () => {
    const actor = createPushActor(async () => {});
    const ref = createActor(actor);
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.status).toBe("done");
  });
});
