/**
 * Production wiring for the upgrade machine.
 *
 * The base `upgradeMachine` uses bare actor singletons with no UI feedback.
 * This module wraps async actors with @clack/prompts spinners via `.provide()`,
 * following the same pattern as `cli.wired.ts` for the push machine.
 */

import { fromPromise } from "xstate";
import { spinner } from "@clack/prompts";
import { upgradeMachine } from "./upgrade.machine.ts";
import {
  fetchAndCheckVersion,
  downloadRelease,
  verifyChecksum,
  extractBinary,
  installBinary,
} from "../lib/upgrade.ts";
import type { PlatformInfo } from "../lib/upgrade.ts";
import { extractErrorMessage } from "../lib/errors.ts";

// ── Wired machine ────────────────────────────────────────────────────

export const wiredUpgradeMachine = upgradeMachine.provide({
  actors: {
    fetchReleaseActor: fromPromise(async ({ input }: { input: { version: string } }) => {
      const s = spinner();
      s.start("Checking for updates...");
      try {
        const result = await fetchAndCheckVersion(input.version);
        if (result === null) {
          s.stop(`Already on the latest version (${input.version})`);
        } else {
          s.stop(`Found ${result.tag}`);
        }
        return result;
      } catch (error) {
        s.stop(extractErrorMessage(error), 1);
        throw error;
      }
    }),

    downloadReleaseActor: fromPromise(
      async ({ input }: { input: { tag: string; platform: PlatformInfo } }) => {
        const s = spinner();
        s.start(`Downloading ${input.tag}...`);
        try {
          const result = await downloadRelease(input.tag, input.platform);
          s.stop("Downloaded");
          return result;
        } catch (error) {
          s.stop(extractErrorMessage(error), 1);
          throw error;
        }
      },
    ),

    verifyChecksumActor: fromPromise(
      async ({
        input,
      }: {
        input: { tarballPath: string; checksumsContent: string; archiveName: string };
      }) => {
        const s = spinner();
        s.start("Verifying checksum...");
        try {
          const valid = await verifyChecksum(
            input.tarballPath,
            input.checksumsContent,
            input.archiveName,
          );
          if (!valid) throw new Error("Checksum verification failed. Aborting upgrade.");
          s.stop("Checksum verified");
        } catch (error) {
          s.stop(extractErrorMessage(error), 1);
          throw error;
        }
      },
    ),

    extractBinaryActor: fromPromise(
      async ({ input }: { input: { tarballPath: string; tmpDir: string } }) => {
        const s = spinner();
        s.start("Extracting...");
        try {
          const result = await extractBinary(input.tarballPath, input.tmpDir);
          s.stop("Extracted");
          return result;
        } catch (error) {
          s.stop(extractErrorMessage(error), 1);
          throw error;
        }
      },
    ),

    installBinaryActor: fromPromise(
      async ({
        input,
      }: {
        input: { extractedBinPath: string; version: string; latestVersion: string };
      }) => {
        const s = spinner();
        s.start("Installing...");
        try {
          installBinary(input.extractedBinPath);
          s.stop(`Upgraded ai-git: ${input.version} -> ${input.latestVersion}`);
        } catch (error) {
          s.stop(extractErrorMessage(error), 1);
          throw error;
        }
      },
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
});
