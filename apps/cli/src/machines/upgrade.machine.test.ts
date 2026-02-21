import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { upgradeMachine } from "./upgrade.machine.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function makeMockActors(overrides: Record<string, unknown> = {}) {
  return {
    detectInstallMethodActor: fromPromise(async () => "curl"),
    fetchReleaseActor: fromPromise(async () => ({
      latestVersion: "2.0.0",
      tag: "v2.0.0",
    })),
    detectPlatformActor: fromPromise(async () => ({
      os: "darwin",
      arch: "arm64",
      archiveName: "ai-git-darwin-arm64.tar.gz",
    })),
    downloadReleaseActor: fromPromise(async () => ({
      tarballPath: "/tmp/ai-git/ai-git-darwin-arm64.tar.gz",
      checksumsContent: "abc  ai-git-darwin-arm64.tar.gz",
      tmpDir: "/tmp/ai-git",
    })),
    verifyChecksumActor: fromPromise(async () => {}),
    extractBinaryActor: fromPromise(async () => "/tmp/ai-git/ai-git"),
    installBinaryActor: fromPromise(async () => {}),
    cleanupActor: fromPromise(async () => {}),
    ...overrides,
  };
}

function runMachine(overrides: Record<string, unknown> = {}, version = "1.0.0") {
  const machine = upgradeMachine.provide({
    // @ts-expect-error — XState v5 test mock type inference
    actors: makeMockActors(overrides),
  });
  const actor = createActor(machine, { input: { version } });
  actor.start();
  return waitFor(actor, (s) => s.status === "done");
}

// ── Tests ────────────────────────────────────────────────────────────

describe("upgradeMachine", () => {
  // UP1: brew → delegated → done
  test("UP1: brew install delegates to Homebrew", async () => {
    const snap = await runMachine({
      detectInstallMethodActor: fromPromise(async () => "brew"),
    });
    expect(snap.output!.exitCode).toBe(0);
    expect(snap.output!.message).toContain("Homebrew");
  });

  // UP2: npm → delegated → done
  test("UP2: npm install delegates to npm", async () => {
    const snap = await runMachine({
      detectInstallMethodActor: fromPromise(async () => "npm"),
    });
    expect(snap.output!.exitCode).toBe(0);
    expect(snap.output!.message).toContain("npm");
  });

  // UP3: source → delegated → done
  test("UP3: source install delegates to source", async () => {
    const snap = await runMachine({
      detectInstallMethodActor: fromPromise(async () => "source"),
    });
    expect(snap.output!.exitCode).toBe(0);
    expect(snap.output!.message).toContain("source");
  });

  // UP4: already on latest version
  test("UP4: already on latest version", async () => {
    const snap = await runMachine({
      fetchReleaseActor: fromPromise(async () => null),
    });
    expect(snap.output!.exitCode).toBe(0);
    expect(snap.output!.message).toContain("Already");
  });

  // UP5: full success path
  test("UP5: full self-update success", async () => {
    const snap = await runMachine();
    expect(snap.output!.exitCode).toBe(0);
    expect(snap.output!.message).toContain("Upgraded");
    expect(snap.output!.message).toContain("2.0.0");
  });

  // UP6: fetchRelease fails → error → done
  test("UP6: fetch release error returns exitCode 1", async () => {
    const snap = await runMachine({
      fetchReleaseActor: fromPromise(async () => {
        throw new Error("Failed to fetch release");
      }),
    });
    expect(snap.output!.exitCode).toBe(1);
    expect(snap.output!.errorMessage).toContain("Failed to fetch release");
  });

  // UP7: download HTTP error → error → done
  test("UP7: download HTTP error returns exitCode 1", async () => {
    const snap = await runMachine({
      downloadReleaseActor: fromPromise(async () => {
        throw new Error("Failed to download binary (HTTP 404)");
      }),
    });
    expect(snap.output!.exitCode).toBe(1);
    expect(snap.output!.errorMessage).toContain("Failed to download");
  });

  // UP8: checksum mismatch → error → done
  test("UP8: checksum mismatch returns exitCode 1", async () => {
    const snap = await runMachine({
      verifyChecksumActor: fromPromise(async () => {
        throw new Error("Checksum verification failed");
      }),
    });
    expect(snap.output!.exitCode).toBe(1);
    expect(snap.output!.errorMessage).toContain("Checksum");
  });

  // UP9: permission denied → error → done
  test("UP9: permission denied returns exitCode 1", async () => {
    const snap = await runMachine({
      installBinaryActor: fromPromise(async () => {
        throw new Error("Permission denied");
      }),
    });
    expect(snap.output!.exitCode).toBe(1);
    expect(snap.output!.errorMessage).toContain("Permission denied");
  });

  // UP10: unsupported platform → error → done
  test("UP10: unsupported platform returns exitCode 1", async () => {
    const snap = await runMachine({
      detectPlatformActor: fromPromise(async () => {
        throw new Error("Unsupported platform");
      }),
    });
    expect(snap.output!.exitCode).toBe(1);
    expect(snap.output!.errorMessage).toContain("Unsupported platform");
  });

  // UP11: binary not found after extraction → error → done
  test("UP11: binary not found returns exitCode 1", async () => {
    const snap = await runMachine({
      extractBinaryActor: fromPromise(async () => {
        throw new Error("Extracted binary not found");
      }),
    });
    expect(snap.output!.exitCode).toBe(1);
    expect(snap.output!.errorMessage).toContain("binary not found");
  });

  // Version forwarding
  test("forwards version to fetchRelease actor", async () => {
    let receivedVersion = "";
    const snap = await runMachine({
      fetchReleaseActor: fromPromise(async ({ input }: { input: { version: string } }) => {
        receivedVersion = input.version;
        return { latestVersion: "2.0.0", tag: "v2.0.0" };
      }),
    }, "2.5.0");
    expect(receivedVersion).toBe("2.5.0");
    expect(snap.output!.exitCode).toBe(0);
  });

  // Cleanup runs on success path
  test("cleanup runs on success path", async () => {
    let cleanupCalled = false;
    await runMachine({
      cleanupActor: fromPromise(async () => {
        cleanupCalled = true;
      }),
    });
    expect(cleanupCalled).toBe(true);
  });

  // Cleanup runs on error path
  test("cleanup runs on error path", async () => {
    let cleanupCalled = false;
    await runMachine({
      downloadReleaseActor: fromPromise(async () => ({
        tarballPath: "/tmp/ai-git/test.tar.gz",
        checksumsContent: "abc  test.tar.gz",
        tmpDir: "/tmp/ai-git",
      })),
      verifyChecksumActor: fromPromise(async () => {
        throw new Error("Checksum failed");
      }),
      cleanupActor: fromPromise(async () => {
        cleanupCalled = true;
      }),
    });
    expect(cleanupCalled).toBe(true);
  });

  // Cleanup failure doesn't block success
  test("cleanup failure does not block success", async () => {
    const snap = await runMachine({
      cleanupActor: fromPromise(async () => {
        throw new Error("cleanup failed");
      }),
    });
    expect(snap.output!.exitCode).toBe(0);
    expect(snap.output!.message).toContain("Upgraded");
  });
});
