import { fromPromise } from "xstate";
import {
  detectPlatform,
  fetchAndCheckVersion,
  downloadRelease,
  verifyChecksum,
  extractBinary,
  installBinary,
  cleanupTmpDir,
  type PlatformInfo,
} from "../../lib/upgrade.ts";
import { detectInstallMethod, type InstallMethod } from "../../lib/install-method.ts";
import { CLIError } from "../../lib/errors.ts";

// ── Actor Factories ──────────────────────────────────────────────────

export function createDetectInstallMethodActor(
  resolver: () => InstallMethod = detectInstallMethod,
) {
  return fromPromise(async () => resolver());
}

export function createFetchReleaseActor(
  resolver: (
    version: string,
  ) => Promise<{ latestVersion: string; tag: string } | null> = fetchAndCheckVersion,
) {
  return fromPromise(async ({ input }: { input: { version: string } }) => {
    return resolver(input.version);
  });
}

export function createDetectPlatformActor(resolver: () => PlatformInfo | null = detectPlatform) {
  return fromPromise(async () => {
    const platform = resolver();
    if (!platform) {
      throw new CLIError(
        `Unsupported platform: ${process.platform}-${process.arch}. Download manually from GitHub Releases.`,
      );
    }
    return platform;
  });
}

export function createDownloadReleaseActor(
  resolver: (
    tag: string,
    platform: PlatformInfo,
  ) => Promise<{ tarballPath: string; checksumsContent: string; tmpDir: string }> = downloadRelease,
) {
  return fromPromise(async ({ input }: { input: { tag: string; platform: PlatformInfo } }) => {
    return resolver(input.tag, input.platform);
  });
}

export function createVerifyChecksumActor(
  resolver: (
    filePath: string,
    checksumContent: string,
    fileName: string,
  ) => Promise<boolean> = verifyChecksum,
) {
  return fromPromise(
    async ({
      input,
    }: {
      input: { tarballPath: string; checksumsContent: string; archiveName: string };
    }) => {
      const valid = await resolver(input.tarballPath, input.checksumsContent, input.archiveName);
      if (!valid) {
        throw new CLIError("Checksum verification failed. Aborting upgrade.");
      }
    },
  );
}

export function createExtractBinaryActor(
  resolver: (tarballPath: string, tmpDir: string) => Promise<string> = extractBinary,
) {
  return fromPromise(async ({ input }: { input: { tarballPath: string; tmpDir: string } }) => {
    return resolver(input.tarballPath, input.tmpDir);
  });
}

export function createInstallBinaryActor(
  resolver: (extractedBinPath: string) => void = installBinary,
) {
  return fromPromise(async ({ input }: { input: { extractedBinPath: string } }) => {
    resolver(input.extractedBinPath);
  });
}

export function createCleanupActor(resolver: (tmpDir: string) => void = cleanupTmpDir) {
  return fromPromise(async ({ input }: { input: { tmpDir: string } }) => {
    resolver(input.tmpDir);
  });
}

// ── Production Singleton Actors ──────────────────────────────────────

export const detectInstallMethodActor = createDetectInstallMethodActor();
export const fetchReleaseActor = createFetchReleaseActor();
export const detectPlatformActor = createDetectPlatformActor();
export const downloadReleaseActor = createDownloadReleaseActor();
export const verifyChecksumActor = createVerifyChecksumActor();
export const extractBinaryActor = createExtractBinaryActor();
export const installBinaryActor = createInstallBinaryActor();
export const cleanupActor = createCleanupActor();
