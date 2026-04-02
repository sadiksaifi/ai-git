import { setup, assign } from "xstate";
import { log } from "@clack/prompts";
import pc from "picocolors";
import type { PlatformInfo } from "../lib/upgrade.ts";
import type { InstallMethod } from "../lib/install-method.ts";
import { extractErrorMessage } from "../lib/errors.ts";
import {
  detectInstallMethodActor,
  fetchReleaseActor,
  detectPlatformActor,
  downloadReleaseActor,
  verifyChecksumActor,
  extractBinaryActor,
  installBinaryActor,
  cleanupActor,
} from "./actors/upgrade.actors.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface UpgradeInput {
  version: string;
}

export interface UpgradeOutput {
  exitCode: number;
  message?: string;
  errorMessage?: string;
}

interface UpgradeContext {
  version: string;
  exitCode: number;
  method?: InstallMethod;
  latestVersion?: string;
  tag?: string;
  platform?: PlatformInfo;
  tarballPath?: string;
  checksumsContent?: string;
  tmpDir?: string;
  extractedBinPath?: string;
  message?: string;
  errorMessage?: string;
}

// ── Delegation messages ──────────────────────────────────────────────

const DELEGATION_MESSAGES: Record<string, string> = {
  brew: 'Installed via Homebrew. Run "brew upgrade ai-git" instead.',
  npm: 'Installed via npm. Run "npm update -g @ai-git/cli" instead.',
  source: 'Installed from source. Run "git pull && bun install && bun run build" instead.',
};

// ── Machine ──────────────────────────────────────────────────────────
//
// Multi-state machine modeling the full upgrade flow:
//
//   detectMethod → [delegated | fetchRelease]
//   delegated → done
//   fetchRelease → [alreadyLatest | detectPlatform | error]
//   alreadyLatest → done
//   detectPlatform → [download | error]
//   download → [verifyChecksum | error]
//   verifyChecksum → [extract | error]
//   extract → [install | error]
//   install → [cleanup | error]
//   cleanup → done
//   error → errorCleanup → done

export const upgradeMachine = setup({
  types: {
    context: {} as UpgradeContext,
    input: {} as UpgradeInput,
    output: {} as UpgradeOutput,
  },
  actors: {
    detectInstallMethodActor,
    fetchReleaseActor,
    detectPlatformActor,
    downloadReleaseActor,
    verifyChecksumActor,
    extractBinaryActor,
    installBinaryActor,
    cleanupActor,
  },
  guards: {
    isDelegated: ({ event }) => {
      const m = (event as { output?: unknown }).output;
      return m === "brew" || m === "npm" || m === "source";
    },
    isAlreadyLatest: ({ event }) => {
      const output = (event as { output?: unknown }).output;
      return output === null;
    },
  },
}).createMachine({
  id: "upgrade",
  initial: "detectMethod",
  context: ({ input }) => ({
    version: input.version,
    exitCode: 0,
  }),
  states: {
    // ── Detect install method ────────────────────────────────────────
    detectMethod: {
      invoke: {
        src: "detectInstallMethodActor",
        onDone: [
          {
            guard: "isDelegated",
            target: "delegated",
            actions: assign({
              method: ({ event }) => event.output as InstallMethod,
            }),
          },
          {
            target: "fetchRelease",
            actions: assign({
              method: ({ event }) => event.output as InstallMethod,
            }),
          },
        ],
        onError: {
          target: "fetchRelease",
        },
      },
    },

    // ── Delegated (brew/npm/source) ──────────────────────────────────
    delegated: {
      entry: [
        ({ context }) => {
          const msg =
            DELEGATION_MESSAGES[context.method!] ?? "Use your package manager to upgrade.";
          log.info(pc.yellow(msg));
        },
        assign({
          exitCode: 0,
          message: ({ context }) =>
            DELEGATION_MESSAGES[context.method!] ?? "Use your package manager to upgrade.",
        }),
      ],
      always: "done",
    },

    // ── Fetch latest release ─────────────────────────────────────────
    fetchRelease: {
      invoke: {
        src: "fetchReleaseActor",
        input: ({ context }) => ({ version: context.version }),
        onDone: [
          {
            guard: "isAlreadyLatest",
            target: "alreadyLatest",
          },
          {
            target: "detectPlatform",
            actions: assign({
              latestVersion: ({ event }) => event.output!.latestVersion,
              tag: ({ event }) => event.output!.tag,
            }),
          },
        ],
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => extractErrorMessage(event.error),
          }),
        },
      },
    },

    // ── Already on latest ────────────────────────────────────────────
    alreadyLatest: {
      entry: assign({
        exitCode: 0,
        message: ({ context }) => `Already on the latest version (${context.version}).`,
      }),
      always: "done",
    },

    // ── Detect platform ──────────────────────────────────────────────
    detectPlatform: {
      invoke: {
        src: "detectPlatformActor",
        onDone: {
          target: "download",
          actions: assign({
            platform: ({ event }) => event.output as PlatformInfo,
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => extractErrorMessage(event.error),
          }),
        },
      },
    },

    // ── Download release ─────────────────────────────────────────────
    download: {
      invoke: {
        src: "downloadReleaseActor",
        input: ({ context }) => ({
          tag: context.tag!,
          platform: context.platform!,
        }),
        onDone: {
          target: "verifyChecksum",
          actions: assign({
            tarballPath: ({ event }) => event.output.tarballPath,
            checksumsContent: ({ event }) => event.output.checksumsContent,
            tmpDir: ({ event }) => event.output.tmpDir,
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => extractErrorMessage(event.error),
          }),
        },
      },
    },

    // ── Verify checksum ──────────────────────────────────────────────
    verifyChecksum: {
      invoke: {
        src: "verifyChecksumActor",
        input: ({ context }) => ({
          tarballPath: context.tarballPath!,
          checksumsContent: context.checksumsContent!,
          archiveName: context.platform!.archiveName,
        }),
        onDone: {
          target: "extract",
        },
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => extractErrorMessage(event.error),
          }),
        },
      },
    },

    // ── Extract binary ───────────────────────────────────────────────
    extract: {
      invoke: {
        src: "extractBinaryActor",
        input: ({ context }) => ({
          tarballPath: context.tarballPath!,
          tmpDir: context.tmpDir!,
        }),
        onDone: {
          target: "install",
          actions: assign({
            extractedBinPath: ({ event }) => event.output as string,
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => extractErrorMessage(event.error),
          }),
        },
      },
    },

    // ── Install binary ───────────────────────────────────────────────
    install: {
      invoke: {
        src: "installBinaryActor",
        input: ({ context }) => ({
          extractedBinPath: context.extractedBinPath!,
          version: context.version,
          latestVersion: context.latestVersion!,
        }),
        onDone: {
          target: "cleanup",
          actions: assign({
            exitCode: 0,
            message: ({ context }) =>
              `Upgraded ai-git: ${context.version} -> ${context.latestVersion}`,
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => extractErrorMessage(event.error),
          }),
        },
      },
    },

    // ── Cleanup (success path) ───────────────────────────────────────
    cleanup: {
      invoke: {
        src: "cleanupActor",
        input: ({ context }) => ({ tmpDir: context.tmpDir ?? "" }),
        onDone: "done",
        onError: "done", // Best effort — don't fail on cleanup error
      },
    },

    // ── Error ────────────────────────────────────────────────────────
    error: {
      entry: assign({ exitCode: 1 }),
      always: "errorCleanup",
    },

    // ── Error cleanup ────────────────────────────────────────────────
    errorCleanup: {
      invoke: {
        src: "cleanupActor",
        input: ({ context }) => ({ tmpDir: context.tmpDir ?? "" }),
        onDone: "done",
        onError: "done", // Best effort
      },
    },

    // ── Done (final) ─────────────────────────────────────────────────
    done: {
      type: "final",
    },
  },
  output: ({ context }) => ({
    exitCode: context.exitCode,
    message: context.message,
    errorMessage: context.errorMessage,
  }),
});
