# Remote Sync Check + Push Machine XState Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a remote sync check before push (warn if remote is ahead, offer pull --rebase in interactive mode, fail in non-interactive mode) and migrate the push flow from legacy `handlePush()` to direct XState machine wiring.

**Architecture:** New states added to `push.machine.ts` (fetchRemote → checkRemoteAhead → warnRemoteAhead → pullRebase) with factory-pattern actors. Production wiring in `cli.wired.ts` switches from legacy `fromPromise(handlePush)` to direct `pushMachine.provide({...})`. Legacy `lib/push.ts` is deleted.

**Tech Stack:** TypeScript, XState v5, Bun test runner, @clack/prompts, Bun Shell (`$`)

---

### Task 1: Add new git operations for remote sync

**Files:**
- Modify: `apps/cli/src/lib/git.ts:362-372`

**Step 1: Add fetchRemote, getRemoteAheadCount, and pullRebase functions**

Add these after the existing `push()` function at line 364:

```typescript
/**
 * Fetch updates from the remote for the current branch's upstream.
 * Throws if no remote is configured or on network errors.
 */
export async function fetchRemote(): Promise<void> {
  await $`git fetch`.quiet();
}

/**
 * Count how many commits the remote tracking branch is ahead of HEAD.
 * Returns 0 if the remote is not ahead or there is no upstream.
 */
export async function getRemoteAheadCount(): Promise<number> {
  const output = await $`git rev-list HEAD..@{u} --count`.text();
  return parseInt(output.trim(), 10) || 0;
}

/**
 * Pull with rebase from the remote tracking branch.
 * Throws on conflicts or other errors.
 */
export async function pullRebase(): Promise<void> {
  await $`git pull --rebase`.quiet();
}
```

**Step 2: Verify the file compiles**

Run: `cd /Users/sdk/Projects/ai-git && bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/cli/src/lib/git.ts
git commit -m "feat(push): add fetchRemote, getRemoteAheadCount, pullRebase git operations"
```

---

### Task 2: Add new actor factories for remote sync

**Files:**
- Modify: `apps/cli/src/machines/actors/git.actors.ts`

**Step 1: Add imports for new git functions**

Update the import block at line 10 to include the new functions:

```typescript
import {
  getStagedFiles,
  getUnstagedFiles,
  stageFiles,
  stageAllExcept,
  commit,
  push,
  addRemoteAndPush,
  fetchRemote,
  getRemoteAheadCount,
  pullRebase,
  getBranchName,
  setBranchName,
  getStagedDiff,
  getRecentCommits,
  getStagedFileList,
  type CommitResult,
} from "../../lib/git.ts";
```

**Step 2: Add factory functions and singletons**

Add before the `// ── Production Singleton Actors` section:

```typescript
export function createFetchRemoteActor(resolver: () => Promise<void> = fetchRemote) {
  return fromPromise(async () => {
    await resolver();
  });
}

export function createCheckRemoteAheadActor(
  resolver: () => Promise<number> = getRemoteAheadCount,
) {
  return fromPromise(async () => resolver());
}

export function createPullRebaseActor(resolver: () => Promise<void> = pullRebase) {
  return fromPromise(async () => {
    await resolver();
  });
}
```

Add to the singleton exports section:

```typescript
export const fetchRemoteActor = createFetchRemoteActor();
export const checkRemoteAheadActor = createCheckRemoteAheadActor();
export const pullRebaseActor = createPullRebaseActor();
```

**Step 3: Verify the file compiles**

Run: `cd /Users/sdk/Projects/ai-git && bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/cli/src/machines/actors/git.actors.ts
git commit -m "feat(push): add fetchRemote, checkRemoteAhead, pullRebase actor factories"
```

---

### Task 3: Write failing tests for new push machine scenarios (PU12-PU18)

**Files:**
- Modify: `apps/cli/src/machines/push.machine.test.ts`

**Step 1: Write tests for all new scenarios**

Add the following tests after the existing test block. These will fail because the new states don't exist yet. Note: all existing tests also need new actor mocks — we'll update them in Task 4.

```typescript
// ═══════════════════════════════════════════════════════════════════
// Remote sync check scenarios (PU12-PU18)
// ═══════════════════════════════════════════════════════════════════

// PU12: fetch succeeds, remote not ahead → push proceeds
test("PU12: remote not ahead → push proceeds normally", async () => {
  const machine = pushMachine.provide({
    actors: {
      // @ts-expect-error — XState v5 test mock type inference
      fetchRemoteActor: fromPromise(async () => {}),
      // @ts-expect-error — XState v5 test mock type inference
      checkRemoteAheadActor: fromPromise(async () => 0),
      // @ts-expect-error — XState v5 test mock type inference
      pushActor: fromPromise(async () => {}),
    },
  });
  const actor = createActor(machine, {
    input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: false },
  });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
  expect(snap.output!.pushed).toBe(true);
  expect(snap.output!.exitCode).toBe(0);
});

// PU13: fetch succeeds, remote ahead, interactive → warn prompt shown
test("PU13: remote ahead in interactive → warn and prompt", async () => {
  const machine = pushMachine.provide({
    actors: {
      // @ts-expect-error — XState v5 test mock type inference
      confirmActor: fromPromise(async () => true),
      // @ts-expect-error — XState v5 test mock type inference
      fetchRemoteActor: fromPromise(async () => {}),
      // @ts-expect-error — XState v5 test mock type inference
      checkRemoteAheadActor: fromPromise(async () => 3),
      // @ts-expect-error — XState v5 test mock type inference
      pullRebaseActor: fromPromise(async () => {}),
      // @ts-expect-error — XState v5 test mock type inference
      pushActor: fromPromise(async () => {}),
    },
  });
  const actor = createActor(machine, {
    input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: true },
  });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
  expect(snap.output!.pushed).toBe(true);
});

// PU14: user confirms pull rebase → success → push
test("PU14: confirm pull rebase → rebase succeeds → push", async () => {
  const machine = pushMachine.provide({
    actors: {
      // @ts-expect-error — XState v5 test mock type inference
      fetchRemoteActor: fromPromise(async () => {}),
      // @ts-expect-error — XState v5 test mock type inference
      checkRemoteAheadActor: fromPromise(async () => 5),
      // @ts-expect-error — XState v5 test mock type inference
      confirmActor: fromPromise(async () => true),
      // @ts-expect-error — XState v5 test mock type inference
      pullRebaseActor: fromPromise(async () => {}),
      // @ts-expect-error — XState v5 test mock type inference
      pushActor: fromPromise(async () => {}),
    },
  });
  const actor = createActor(machine, {
    input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: true },
  });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
  expect(snap.output!.pushed).toBe(true);
  expect(snap.output!.exitCode).toBe(0);
});

// PU15: user confirms pull rebase → rebase fails (conflicts)
test("PU15: pull rebase fails → error, not pushed", async () => {
  const machine = pushMachine.provide({
    actors: {
      // @ts-expect-error — XState v5 test mock type inference
      fetchRemoteActor: fromPromise(async () => {}),
      // @ts-expect-error — XState v5 test mock type inference
      checkRemoteAheadActor: fromPromise(async () => 2),
      // @ts-expect-error — XState v5 test mock type inference
      confirmActor: fromPromise(async () => true),
      // @ts-expect-error — XState v5 test mock type inference
      pullRebaseActor: fromPromise(async () => {
        throw new Error("merge conflict");
      }),
    },
  });
  const actor = createActor(machine, {
    input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: true },
  });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
  expect(snap.output!.pushed).toBe(false);
  expect(snap.output!.exitCode).toBe(1);
});

// PU16: user declines pull rebase → skip push
test("PU16: decline pull rebase → skip push", async () => {
  const machine = pushMachine.provide({
    actors: {
      // @ts-expect-error — XState v5 test mock type inference
      fetchRemoteActor: fromPromise(async () => {}),
      // @ts-expect-error — XState v5 test mock type inference
      checkRemoteAheadActor: fromPromise(async () => 2),
      // @ts-expect-error — XState v5 test mock type inference
      confirmActor: fromPromise(async () => false),
    },
  });
  const actor = createActor(machine, {
    input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: true },
  });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
  expect(snap.output!.pushed).toBe(false);
});

// PU17: remote ahead + non-interactive → exit code 1
test("PU17: remote ahead in non-interactive → fail with exit 1", async () => {
  const machine = pushMachine.provide({
    actors: {
      // @ts-expect-error — XState v5 test mock type inference
      fetchRemoteActor: fromPromise(async () => {}),
      // @ts-expect-error — XState v5 test mock type inference
      checkRemoteAheadActor: fromPromise(async () => 3),
    },
  });
  const actor = createActor(machine, {
    input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: false },
  });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
  expect(snap.output!.pushed).toBe(false);
  expect(snap.output!.exitCode).toBe(1);
});

// PU18: fetch fails (no remote/no upstream/network) → skip check, proceed to push
test("PU18: fetch fails → skip check, proceed to push", async () => {
  const machine = pushMachine.provide({
    actors: {
      // @ts-expect-error — XState v5 test mock type inference
      fetchRemoteActor: fromPromise(async () => {
        throw new Error("fatal: no remote");
      }),
      // @ts-expect-error — XState v5 test mock type inference
      pushActor: fromPromise(async () => {}),
    },
  });
  const actor = createActor(machine, {
    input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: false },
  });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
  expect(snap.output!.pushed).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/sdk/Projects/ai-git && bun test apps/cli/src/machines/push.machine.test.ts`
Expected: New tests FAIL (states don't exist yet). Existing tests may also fail once the machine changes.

**Step 3: Commit**

```bash
git add apps/cli/src/machines/push.machine.test.ts
git commit -m "test(push): add failing tests for remote sync check scenarios PU12-PU18"
```

---

### Task 4: Update existing tests to mock new actors

**Files:**
- Modify: `apps/cli/src/machines/push.machine.test.ts`

**Step 1: Update all existing tests (PU1-PU11) to include new actor mocks**

Every test that reaches the `pushing` state needs `fetchRemoteActor` and `checkRemoteAheadActor` mocks (since the machine now goes through fetch → check before pushing). Add these mocks to each existing test's `.provide()` block.

For tests that go through `pushing` (PU1, PU3, PU5, PU8, PU9, and dangerouslyAutoApprove):
```typescript
// @ts-expect-error — XState v5 test mock type inference
fetchRemoteActor: fromPromise(async () => {}),
// @ts-expect-error — XState v5 test mock type inference
checkRemoteAheadActor: fromPromise(async () => 0),
```

For PU2 (missing remote, non-interactive), the fetch will also fail since there's no remote:
```typescript
// @ts-expect-error — XState v5 test mock type inference
fetchRemoteActor: fromPromise(async () => {}),
// @ts-expect-error — XState v5 test mock type inference
checkRemoteAheadActor: fromPromise(async () => 0),
```

Tests that never reach `pushing` (PU10, PU11, user cancel at push prompt) don't need the new mocks.

**Step 2: Run tests to verify existing tests still fail**

Run: `cd /Users/sdk/Projects/ai-git && bun test apps/cli/src/machines/push.machine.test.ts`
Expected: Still FAIL (machine not yet updated)

**Step 3: Commit**

```bash
git add apps/cli/src/machines/push.machine.test.ts
git commit -m "test(push): update existing PU1-PU11 tests with remote sync actor mocks"
```

---

### Task 5: Implement push machine remote sync states

**Files:**
- Modify: `apps/cli/src/machines/push.machine.ts`

**Step 1: Add new imports**

Add to the imports at top:

```typescript
import {
  pushActor as defaultPushActor,
  addRemoteAndPushActor as defaultAddRemoteAndPushActor,
  fetchRemoteActor as defaultFetchRemoteActor,
  checkRemoteAheadActor as defaultCheckRemoteAheadActor,
  pullRebaseActor as defaultPullRebaseActor,
} from "./actors/git.actors.ts";
```

**Step 2: Update PushMachineContext to add remoteAheadCount**

```typescript
export interface PushMachineContext {
  push: boolean;
  dangerouslyAutoApprove: boolean;
  isInteractiveMode: boolean;
  pushed: boolean;
  errorMessage: string;
  remoteUrl: string;
  remoteAheadCount: number;
}
```

**Step 3: Update PushMachineOutput to support exitCode 1**

```typescript
export interface PushMachineOutput {
  pushed: boolean;
  exitCode: 0 | 1;
}
```

**Step 4: Add new actors, guards, and actions to setup()**

In the `setup()` call, add:

Actors:
```typescript
fetchRemoteActor: defaultFetchRemoteActor as ActorLogicFrom<typeof defaultFetchRemoteActor>,
checkRemoteAheadActor: defaultCheckRemoteAheadActor as ActorLogicFrom<typeof defaultCheckRemoteAheadActor>,
pullRebaseActor: defaultPullRebaseActor as ActorLogicFrom<typeof defaultPullRebaseActor>,
```

Guards:
```typescript
isRemoteAhead: ({ context }) => context.remoteAheadCount > 0,
```

Actions:
```typescript
storeRemoteAheadCount: assign({
  remoteAheadCount: ({ event }) => {
    return (event as { output?: number }).output ?? 0;
  },
}),
```

**Step 5: Update initial context to include remoteAheadCount**

```typescript
context: ({ input }) => ({
  push: input.push,
  dangerouslyAutoApprove: input.dangerouslyAutoApprove,
  isInteractiveMode: input.isInteractiveMode,
  pushed: false,
  errorMessage: "",
  remoteUrl: "",
  remoteAheadCount: 0,
}),
```

**Step 6: Update output to include exitCode from context**

Add `exitCode` to context:

```typescript
export interface PushMachineContext {
  push: boolean;
  dangerouslyAutoApprove: boolean;
  isInteractiveMode: boolean;
  pushed: boolean;
  errorMessage: string;
  remoteUrl: string;
  remoteAheadCount: number;
  exitCode: 0 | 1;
}
```

Update output:
```typescript
output: ({ context }) => ({
  pushed: context.pushed,
  exitCode: context.exitCode,
}),
```

Initial context:
```typescript
exitCode: 0 as const,
```

Add action:
```typescript
markExitError: assign({ exitCode: 1 as const }),
```

**Step 7: Update state flow — modify checkFlags transitions**

Change the `checkFlags` state to route through fetch:

```typescript
checkFlags: {
  always: [
    {
      guard: "isPushFlagOrAutoApprove",
      target: "fetchRemote",
    },
    {
      guard: "isInteractiveMode",
      target: "promptPush",
    },
    {
      target: "done",
    },
  ],
},
```

**Step 8: Update promptPush to route to fetchRemote instead of pushing**

```typescript
promptPush: {
  invoke: {
    src: "confirmActor",
    // @ts-expect-error — XState v5 invoke type inference
    input: { message: "Push to remote?" },
    onDone: [
      {
        guard: "isConfirmed",
        target: "fetchRemote",
      },
      {
        target: "done",
      },
    ],
    onError: {
      target: "done",
    },
  },
},
```

**Step 9: Add new states**

Add these states between `promptPush` and `pushing`:

```typescript
// ── PU12/PU18: fetch remote to check for upstream changes ────────
fetchRemote: {
  // @ts-expect-error — XState v5 invoke type inference
  invoke: {
    src: "fetchRemoteActor",
    onDone: {
      target: "checkRemoteAhead",
    },
    onError: {
      // PU18: fetch fails (no remote/no upstream/network) → skip check
      target: "pushing",
    },
  },
},

// ── PU12/PU13/PU17: check if remote has new commits ─────────────
checkRemoteAhead: {
  // @ts-expect-error — XState v5 invoke type inference
  invoke: {
    src: "checkRemoteAheadActor",
    onDone: {
      target: "evaluateRemoteAhead",
      actions: "storeRemoteAheadCount",
    },
    onError: {
      // Failed to check → skip, proceed to push
      target: "pushing",
    },
  },
},

// ── Evaluate remote ahead count ──────────────────────────────────
evaluateRemoteAhead: {
  always: [
    {
      guard: { type: "not", params: { guard: "isRemoteAhead" } },
      // PU12: not ahead → push
      target: "pushing",
    },
    {
      guard: "isInteractiveMode",
      // PU13: ahead + interactive → warn
      target: "warnRemoteAhead",
    },
    {
      // PU17: ahead + non-interactive → fail
      target: "done",
      actions: ["storeErrorMessage", "markExitError"],
    },
  ],
},

// ── PU13/PU16: warn user remote is ahead, offer pull rebase ─────
warnRemoteAhead: {
  invoke: {
    src: "confirmActor",
    // @ts-expect-error — XState v5 invoke type inference
    input: ({ context }) => ({
      message: `Remote is ${context.remoteAheadCount} commit(s) ahead. Pull and rebase before pushing?`,
    }),
    onDone: [
      {
        guard: "isConfirmed",
        target: "pullRebase",
      },
      {
        // PU16: user declines
        target: "done",
      },
    ],
    onError: {
      // User cancelled
      target: "done",
    },
  },
},

// ── PU14/PU15: pull with rebase ─────────────────────────────────
pullRebase: {
  // @ts-expect-error — XState v5 invoke type inference
  invoke: {
    src: "pullRebaseActor",
    onDone: {
      // PU14: rebase succeeded → push
      target: "pushing",
    },
    onError: {
      // PU15: rebase failed (conflicts, etc.)
      target: "done",
      actions: ["storeErrorMessage", "markExitError"],
    },
  },
},
```

**Step 10: Fix evaluateRemoteAhead for PU17 — the guard `not` syntax**

XState v5 uses `not` as a built-in guard combinator. The syntax is:

```typescript
{
  guard: { type: "not", params: { guard: "isRemoteAhead" } },
  target: "pushing",
},
```

However, if the `not` combinator isn't supported in the specific XState v5 version being used, use a separate guard instead:

```typescript
// In guards:
isRemoteNotAhead: ({ context }) => context.remoteAheadCount === 0,
```

And use `isRemoteNotAhead` in `evaluateRemoteAhead` instead of the `not` combinator.

**Step 11: Fix PU17 — storeErrorMessage needs error context**

For PU17, we need an error message but there's no `event.error`. Use a dedicated action instead:

```typescript
// In actions:
storeRemoteAheadError: assign({
  errorMessage: ({ context }) =>
    `Remote is ${context.remoteAheadCount} commit(s) ahead. Pull and rebase before pushing.`,
}),
```

Update `evaluateRemoteAhead`'s non-interactive branch:
```typescript
{
  // PU17: ahead + non-interactive → fail
  target: "done",
  actions: ["storeRemoteAheadError", "markExitError"],
},
```

**Step 12: Run tests**

Run: `cd /Users/sdk/Projects/ai-git && bun test apps/cli/src/machines/push.machine.test.ts`
Expected: ALL tests PASS

**Step 13: Commit**

```bash
git add apps/cli/src/machines/push.machine.ts
git commit -m "feat(push): add remote sync check states to push machine (PU12-PU18)"
```

---

### Task 6: Wire push machine directly in cli.wired.ts (remove legacy handler)

**Files:**
- Modify: `apps/cli/src/machines/cli.wired.ts`
- Modify: `apps/cli/src/machines/cli.machine.ts`

**Step 1: Update cli.wired.ts imports**

Remove the `handlePush` import:
```typescript
// DELETE: import { handlePush } from "../lib/push.ts";
```

Add push machine and actor imports:
```typescript
import { pushMachine } from "./push.machine.ts";
import {
  pushActor,
  addRemoteAndPushActor,
  fetchRemoteActor,
  checkRemoteAheadActor,
  pullRebaseActor,
} from "./actors/git.actors.ts";
import { confirmActor, textActor } from "./actors/clack.actors.ts";
```

Note: `confirmActor` and `textActor` may already be imported if used by other machines. Check and add only if missing.

**Step 2: Replace the pushMachine wiring**

Replace the legacy wrapper:

```typescript
// OLD (delete this):
pushMachine: fromPromise(async ({ input }: { input: Record<string, unknown> }) => {
  const ctx = input as {
    push: boolean;
    dangerouslyAutoApprove: boolean;
    isInteractiveMode: boolean;
  };
  await handlePush(ctx);
  return { pushed: true, exitCode: 0 as const };
}),

// NEW:
pushMachine: pushMachine.provide({
  actors: {
    pushActor,
    addRemoteAndPushActor,
    confirmActor,
    textActor,
    fetchRemoteActor,
    checkRemoteAheadActor,
    pullRebaseActor,
  },
}),
```

**Step 3: Update cli.machine.ts push state to handle exitCode from output**

In `cli.machine.ts`, update the push state's `onDone` to check for exit code 1:

```typescript
push: {
  invoke: {
    src: "pushMachine",
    input: ({ context }) => {
      const isInteractiveMode =
        !context.options.commit &&
        !context.options.stageAll &&
        !context.options.push &&
        !context.options.dangerouslyAutoApprove;
      return {
        push: context.options.push,
        dangerouslyAutoApprove: context.options.dangerouslyAutoApprove,
        isInteractiveMode,
      };
    },
    onDone: [
      {
        guard: "pushFailed",
        target: "exit",
        actions: "setExitError",
      },
      {
        target: "exit",
        actions: "setExitOk",
      },
    ],
    onError: {
      // Push errors are non-fatal (push machine handles its own error states)
      target: "exit",
      actions: "setExitOk",
    },
  },
},
```

Add the `pushFailed` guard to `cli.machine.ts` setup:

```typescript
pushFailed: ({ event }) => {
  const output = (event as { output?: { exitCode?: number } }).output;
  return output?.exitCode === 1;
},
```

**Step 4: Update cli.machine.ts stub pushMachine to match new output type**

In the `actors` section of `cli.machine.ts` setup, update the stub:

```typescript
pushMachine: fromPromise(async (): Promise<{ pushed: boolean; exitCode: 0 | 1 }> => {
  return { pushed: false, exitCode: 0 };
}),
```

**Step 5: Verify the build compiles**

Run: `cd /Users/sdk/Projects/ai-git && bun run typecheck`
Expected: PASS

**Step 6: Run all tests**

Run: `cd /Users/sdk/Projects/ai-git && bun test`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add apps/cli/src/machines/cli.wired.ts apps/cli/src/machines/cli.machine.ts
git commit -m "refactor(push): wire XState push machine directly, remove legacy handlePush wrapper"
```

---

### Task 7: Delete legacy push handler

**Files:**
- Delete: `apps/cli/src/lib/push.ts`

**Step 1: Verify no other files import from push.ts**

Search for any remaining imports of `lib/push.ts` or `handlePush`:

Run: `cd /Users/sdk/Projects/ai-git && grep -r "lib/push" apps/cli/src/ --include="*.ts" | grep -v ".test."`
Expected: No results (cli.wired.ts import was already removed in Task 6)

**Step 2: Delete the file**

```bash
rm apps/cli/src/lib/push.ts
```

**Step 3: Verify the build still compiles**

Run: `cd /Users/sdk/Projects/ai-git && bun run typecheck`
Expected: PASS

**Step 4: Run all tests**

Run: `cd /Users/sdk/Projects/ai-git && bun test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(push): delete legacy push handler (lib/push.ts)"
```

---

### Task 8: Add display logging to push machine states

**Files:**
- Modify: `apps/cli/src/machines/push.machine.ts`
- Modify: `apps/cli/src/machines/cli.wired.ts`

The push machine currently has no spinner or log output for the new states. The existing `lib/push.ts` had spinners via `@clack/prompts`. We need to add logging for:

- "Looking for upstream changes..." (spinner during fetch)
- "Remote is up to date" (on fetch done + not ahead)
- "Pulling and rebasing..." (spinner during pull)
- "Rebased successfully" (on pull done)
- Error messages (on failures)

**Step 1: Add a logActor to push machine setup**

In `push.machine.ts`, add a new actor type and import:

```typescript
import { log } from "@clack/prompts";
import pc from "picocolors";
```

Add to actors in setup:
```typescript
logActor: fromPromise(async ({ input }: { input: { message: string; level: "info" | "warn" | "error" } }) => {
  if (input.level === "warn") log.warn(input.message);
  else if (input.level === "error") log.error(pc.red(input.message));
  else log.info(input.message);
}) as ActorLogicFrom<any>,
```

However, this approach of adding a log actor for every message is verbose. Instead, use XState's entry/exit actions pattern. Add actions that call `log` directly:

Actually, the cleanest approach is to add log calls as **side-effect actions** in the machine. Since the machine is already wired with production actors, we can add inline actions for logging. But XState v5 actions should be pure (assign) or declared.

The pragmatic approach: add log output inside the actors themselves. The `fetchRemoteActor` production implementation can include spinner output. Let's update the actor factories instead.

**Step 2: Update fetchRemoteActor factory to include spinner**

In `git.actors.ts`, update:

```typescript
export function createFetchRemoteActor(
  resolver: () => Promise<void> = fetchRemote,
  ui: { spinner: typeof import("@clack/prompts").spinner } = { spinner: require("@clack/prompts").spinner },
) {
  return fromPromise(async () => {
    // Note: dynamic import to avoid circular deps is unnecessary here;
    // @clack/prompts is a leaf dependency.
    const { spinner } = await import("@clack/prompts");
    const s = spinner();
    s.start("Looking for upstream changes...");
    try {
      await resolver();
      s.stop("Remote is up to date");
    } catch (error) {
      s.stop("Could not reach remote");
      throw error;
    }
  });
}
```

Wait — this couples UI to the actor, which breaks testability. The factory pattern exists precisely to avoid this. Tests inject mock resolvers that skip UI.

Better approach: Keep the git actor factories pure (no UI). Add **separate display actors** for logging, invoked as intermediate states. But that adds many states.

**Best approach:** Add UI output inside the **production wiring** in `cli.wired.ts`, not in the actor factories. Override the default actors with UI-enhanced versions:

In `cli.wired.ts`:

```typescript
import { spinner, log } from "@clack/prompts";

// ...

pushMachine: pushMachine.provide({
  actors: {
    pushActor: fromPromise(async () => {
      const s = spinner();
      s.start("Pushing changes...");
      try {
        await push();
        s.stop("Pushed successfully");
      } catch (error) {
        s.stop("Push failed");
        throw error;
      }
    }),
    addRemoteAndPushActor: fromPromise(async ({ input }: { input: { url: string } }) => {
      const s = spinner();
      s.start("Adding remote and pushing...");
      try {
        await addRemoteAndPush(input.url);
        s.stop("Remote added and pushed successfully");
      } catch (error) {
        s.stop("Failed to push to new remote");
        throw error;
      }
    }),
    fetchRemoteActor: fromPromise(async () => {
      const s = spinner();
      s.start("Looking for upstream changes...");
      try {
        await fetchRemote();
        s.stop("Checked remote");
      } catch (error) {
        s.stop("Could not reach remote");
        throw error;
      }
    }),
    checkRemoteAheadActor: fromPromise(async () => {
      return await getRemoteAheadCount();
    }),
    pullRebaseActor: fromPromise(async () => {
      const s = spinner();
      s.start("Pulling and rebasing...");
      try {
        await pullRebase();
        s.stop("Rebased successfully");
      } catch (error) {
        s.stop("Rebase failed");
        throw error;
      }
    }),
    confirmActor,
    textActor,
  },
}),
```

This follows the same pattern used by the existing `pushMachine` wiring (lines 315-327) where the legacy wrapper included UI. The actor factories in `git.actors.ts` stay pure for testing. Production UI is added at the wiring layer.

**Step 3: Add error logging for PU17 (non-interactive remote ahead)**

For PU17 (non-interactive, remote ahead), we need to log an error message. Add a `logErrorActor` or use an action. Since this is a terminal transition, add a log action:

In `push.machine.ts`, add to actions:

```typescript
logRemoteAheadError: ({ context }) => {
  // Side-effect: log error to console for non-interactive mode
  console.error(
    `Remote is ${context.remoteAheadCount} commit(s) ahead. Pull and rebase before pushing.`,
  );
},
```

Update the PU17 transition in `evaluateRemoteAhead`:
```typescript
{
  // PU17: ahead + non-interactive → fail
  target: "done",
  actions: ["storeRemoteAheadError", "markExitError", "logRemoteAheadError"],
},
```

Actually, for consistency with the rest of the codebase which uses `@clack/prompts` for output, use `log.error` from clack. But importing clack into the machine would couple it to the UI. Keep `console.error` for now — it's only used in non-interactive mode where clack spinners aren't shown anyway.

**Step 4: Run tests**

Run: `cd /Users/sdk/Projects/ai-git && bun test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/cli/src/machines/cli.wired.ts apps/cli/src/machines/push.machine.ts
git commit -m "feat(push): add spinner and log output for remote sync check flow"
```

---

### Task 9: Update CLI machine tests for pushFailed guard

**Files:**
- Modify: `apps/cli/src/machines/cli.machine.test.ts` (if it exists and tests push transitions)

**Step 1: Check if cli.machine tests exist and cover push**

Run: `cd /Users/sdk/Projects/ai-git && grep -l "push" apps/cli/src/machines/cli.machine.test.ts 2>/dev/null || echo "no cli machine test"`

If tests exist, add a test for the `pushFailed` guard:

```typescript
test("pushFailed guard returns true when exitCode is 1", async () => {
  // Test the push state onDone with exitCode 1
  const machine = cliMachine.provide({
    actors: {
      // ... mock all actors ...
      pushMachine: fromPromise(async () => ({ pushed: false, exitCode: 1 })),
    },
  });
  // ... setup and verify exitCode propagation
});
```

**Step 2: Run tests**

Run: `cd /Users/sdk/Projects/ai-git && bun test`
Expected: ALL PASS

**Step 3: Commit (if changes were made)**

```bash
git add apps/cli/src/machines/cli.machine.test.ts
git commit -m "test(push): add CLI machine test for pushFailed guard"
```

---

### Task 10: Update documentation

**Files:**
- Modify: `apps/cli/CLAUDE.md` (update push machine scenario IDs)

**Step 1: Update the push machine description in CLAUDE.md**

In the State Machines section, update the push machine description:

```markdown
- **`push.machine.ts`** - Push decisions, remote sync check, and remote recovery (PU1-PU18 scenarios)
```

**Step 2: Update the scenario ID prefixes section**

Ensure PU scenarios are listed as PU1-PU18.

**Step 3: Commit**

```bash
git add apps/cli/CLAUDE.md
git commit -m "docs: update CLAUDE.md with new push machine scenarios PU12-PU18"
```

---

### Task 11: Final verification and cleanup

**Step 1: Run full test suite**

Run: `cd /Users/sdk/Projects/ai-git && bun test`
Expected: ALL PASS

**Step 2: Run type checker**

Run: `cd /Users/sdk/Projects/ai-git && bun run typecheck`
Expected: PASS

**Step 3: Run linter**

Run: `cd /Users/sdk/Projects/ai-git && bun run check`
Expected: PASS (or fix any issues)

**Step 4: Verify no dead imports remain**

Run: `cd /Users/sdk/Projects/ai-git && grep -r "lib/push" apps/cli/src/ --include="*.ts"`
Expected: No results

**Step 5: Test manually (interactive mode)**

Run: `cd /Users/sdk/Projects/ai-git && bun run dev`
Expected: After committing, push flow should:
1. Show "Looking for upstream changes..." spinner
2. If remote ahead: show warning and confirm prompt
3. If user confirms: show "Pulling and rebasing..." spinner, then push
4. If user declines: skip push

**Step 6: Test manually (non-interactive mode)**

Run: `cd /Users/sdk/Projects/ai-git && bun run dev -- -a -c -p`
Expected: If remote ahead, fail with exit code 1 and error message.
