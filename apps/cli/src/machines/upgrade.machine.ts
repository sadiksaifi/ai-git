import { setup, fromPromise, assign } from "xstate";
import { runUpgrade } from "../lib/upgrade.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface UpgradeInput {
  version: string;
}

export interface UpgradeOutput {
  exitCode: number;
}

interface UpgradeContext {
  version: string;
  exitCode: number;
}

// ── Machine ──────────────────────────────────────────────────────────
//
// Wraps the existing runUpgrade() function as a single fromPromise actor.
//
// The upgrade flow models states UP1-UP11 from the state diagram:
//
//   detect → brew/npm/source → exitOk (UP1-UP3, delegated)
//   detect → curl/unknown → selfUpdate:
//     fetchRelease → error → exitErr (UP6)
//     fetchRelease → same version → exitOk (UP4)
//     fetchRelease → newer → platform check
//     platform → unsupported → exitErr (UP10)
//     platform → supported → download
//     download → HTTP error → exitErr (UP7)
//     download → ok → checksum
//     checksum → mismatch → exitErr (UP8)
//     checksum → valid → extract
//     extract → checkBin (Bug #5 fix)
//     checkBin → binary not found → exitErr (UP11)
//     checkBin → binary found → install
//     install → permission denied → exitErr (UP9)
//     install → success → exitOk (UP5)
//
// Note: runUpgrade() calls process.exit() internally for some paths,
// so in production the machine won't always reach its done state.
// The actor wrapper still provides typed input/output and test
// dependency injection. A future refactor of upgrade.ts should
// remove process.exit() calls and throw CLIError or return results.

export const upgradeMachine = setup({
  types: {
    context: {} as UpgradeContext,
    input: {} as UpgradeInput,
    output: {} as UpgradeOutput,
  },
  actors: {
    runUpgradeActor: fromPromise(
      async ({ input }: { input: { version: string } }) => {
        await runUpgrade(input.version);
        return { delegated: false, updated: true };
      }
    ),
  },
}).createMachine({
  id: "upgrade",
  initial: "running",
  context: ({ input }) => ({
    version: input.version,
    exitCode: 0,
  }),
  states: {
    running: {
      invoke: {
        src: "runUpgradeActor",
        input: ({ context }) => ({ version: context.version }),
        onDone: {
          target: "done",
        },
        onError: {
          target: "done",
          actions: assign({ exitCode: 1 }),
        },
      },
    },
    done: {
      type: "final",
    },
  },
  output: ({ context }) => ({
    exitCode: context.exitCode,
  }),
});
