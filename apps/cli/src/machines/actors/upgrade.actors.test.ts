import { describe, test, expect } from "bun:test";
import { createActor, waitFor } from "xstate";
import {
  createDetectInstallMethodActor,
  createFetchReleaseActor,
  createDetectPlatformActor,
  createDownloadReleaseActor,
  createVerifyChecksumActor,
  createExtractBinaryActor,
  createInstallBinaryActor,
  createCleanupActor,
} from "./upgrade.actors.ts";
import { CLIError } from "../../lib/errors.ts";

describe("createDetectInstallMethodActor", () => {
  test("returns install method from resolver", async () => {
    const actor = createDetectInstallMethodActor(() => "brew");
    const ref = createActor(actor);
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe("brew");
  });
});

describe("createFetchReleaseActor", () => {
  test("returns version info when update available", async () => {
    const actor = createFetchReleaseActor(async () => ({
      latestVersion: "2.0.0",
      tag: "v2.0.0",
    }));
    const ref = createActor(actor, { input: { version: "1.0.0" } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toEqual({ latestVersion: "2.0.0", tag: "v2.0.0" });
  });

  test("returns null when already on latest", async () => {
    const actor = createFetchReleaseActor(async () => null);
    const ref = createActor(actor, { input: { version: "2.0.0" } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBeNull();
  });

  test("throws CLIError when fetch fails", async () => {
    const actor = createFetchReleaseActor(async () => {
      throw new CLIError("Failed to fetch latest release from GitHub.");
    });
    const ref = createActor(actor, { input: { version: "1.0.0" } });
    ref.start();
    try {
      await waitFor(ref, (s) => s.status === "done");
      throw new Error("Expected actor to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
    }
  });
});

describe("createDetectPlatformActor", () => {
  test("returns PlatformInfo when supported", async () => {
    const actor = createDetectPlatformActor(() => ({
      os: "darwin",
      arch: "arm64",
      archiveName: "ai-git-darwin-arm64.tar.gz",
    }));
    const ref = createActor(actor);
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toEqual({
      os: "darwin",
      arch: "arm64",
      archiveName: "ai-git-darwin-arm64.tar.gz",
    });
  });

  test("throws CLIError when platform is null", async () => {
    const actor = createDetectPlatformActor(() => null);
    const ref = createActor(actor);
    ref.start();
    try {
      await waitFor(ref, (s) => s.status === "done");
      throw new Error("Expected actor to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
    }
  });
});

describe("createDownloadReleaseActor", () => {
  test("returns download result", async () => {
    const result = {
      tarballPath: "/tmp/test/ai-git-darwin-arm64.tar.gz",
      checksumsContent: "abc123  ai-git-darwin-arm64.tar.gz",
      tmpDir: "/tmp/test",
    };
    const actor = createDownloadReleaseActor(async () => result);
    const ref = createActor(actor, {
      input: {
        tag: "v2.0.0",
        platform: { os: "darwin", arch: "arm64", archiveName: "ai-git-darwin-arm64.tar.gz" },
      },
    });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toEqual(result);
  });
});

describe("createVerifyChecksumActor", () => {
  test("resolves on valid checksum", async () => {
    const actor = createVerifyChecksumActor(async () => true);
    const ref = createActor(actor, {
      input: {
        tarballPath: "/tmp/test.tar.gz",
        checksumsContent: "abc  test.tar.gz",
        archiveName: "test.tar.gz",
      },
    });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.status).toBe("done");
  });

  test("throws CLIError on invalid checksum", async () => {
    const actor = createVerifyChecksumActor(async () => false);
    const ref = createActor(actor, {
      input: {
        tarballPath: "/tmp/test.tar.gz",
        checksumsContent: "abc  test.tar.gz",
        archiveName: "test.tar.gz",
      },
    });
    ref.start();
    try {
      await waitFor(ref, (s) => s.status === "done");
      throw new Error("Expected actor to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
    }
  });
});

describe("createExtractBinaryActor", () => {
  test("returns extracted path", async () => {
    const actor = createExtractBinaryActor(async () => "/tmp/test/ai-git");
    const ref = createActor(actor, {
      input: { tarballPath: "/tmp/test.tar.gz", tmpDir: "/tmp/test" },
    });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe("/tmp/test/ai-git");
  });
});

describe("createInstallBinaryActor", () => {
  test("resolves on success", async () => {
    const actor = createInstallBinaryActor(() => {});
    const ref = createActor(actor, {
      input: { extractedBinPath: "/tmp/test/ai-git" },
    });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.status).toBe("done");
  });

  test("throws CLIError on permission denied", async () => {
    const actor = createInstallBinaryActor(() => {
      throw new CLIError("Permission denied: cannot write to /usr/local/bin.");
    });
    const ref = createActor(actor, {
      input: { extractedBinPath: "/tmp/test/ai-git" },
    });
    ref.start();
    try {
      await waitFor(ref, (s) => s.status === "done");
      throw new Error("Expected actor to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CLIError);
    }
  });
});

describe("createCleanupActor", () => {
  test("resolves and calls resolver", async () => {
    let calledWith = "";
    const actor = createCleanupActor((dir) => {
      calledWith = dir;
    });
    const ref = createActor(actor, { input: { tmpDir: "/tmp/test" } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.status).toBe("done");
    expect(calledWith).toBe("/tmp/test");
  });
});
