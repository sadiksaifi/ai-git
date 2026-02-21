# XState v5 State Machine Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the entire AI Git CLI to use XState v5 state machines, fixing 5 known bugs and improving codebase quality.

**Architecture:** 7 composable XState machines (cli, init, setup-wizard, staging, generation, push, upgrade) orchestrated by a top-level CLI machine. Each machine uses `fromPromise()` actors for async operations, typed context/events/input/output via `setup()`, and `.provide()` for test dependency injection. A single `process.exit()` lives in `index.ts`.

**Tech Stack:** XState v5, TypeScript strict, Bun runtime, @clack/prompts, bun:test

**Reference docs:**
- `docs/cli/states.mmd` — Authoritative state machine diagram (167 scenarios)
- `docs/cli/state-machine-improvements.md` — 5 bugs to fix
- `docs/plans/2026-02-21-xstate-refactor-design.md` — Architecture decisions

---

## Task 1: Install XState v5 and Create Directory Structure

**Files:**
- Modify: `apps/cli/package.json`
- Create: `apps/cli/src/machines/` directory
- Create: `apps/cli/src/machines/actors/` directory

**Step 1: Install XState**

Run: `cd apps/cli && bun add xstate`
Expected: xstate added to dependencies in package.json

**Step 2: Create directory structure**

```bash
mkdir -p apps/cli/src/machines/actors
```

**Step 3: Verify**

Run: `cd apps/cli && bun run typecheck`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add apps/cli/package.json apps/cli/bun.lock apps/cli/src/machines
git commit -m "build: add xstate v5 dependency and machines directory"
```

---

## Task 2: Create Shared Error Types

**Files:**
- Create: `apps/cli/src/lib/errors.ts`
- Create: `apps/cli/src/lib/errors.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/cli/src/lib/errors.test.ts
import { describe, test, expect } from "bun:test";
import { UserCancelledError, CLIError } from "./errors.ts";

describe("UserCancelledError", () => {
  test("is an instance of Error", () => {
    const err = new UserCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UserCancelledError");
    expect(err.message).toBe("User cancelled");
  });
});

describe("CLIError", () => {
  test("has default exit code 1", () => {
    const err = new CLIError("something failed");
    expect(err).toBeInstanceOf(Error);
    expect(err.exitCode).toBe(1);
    expect(err.message).toBe("something failed");
  });

  test("accepts custom exit code", () => {
    const err = new CLIError("interrupted", 130);
    expect(err.exitCode).toBe(130);
  });

  test("accepts optional suggestion", () => {
    const err = new CLIError("not found", 1, "Run ai-git --setup");
    expect(err.suggestion).toBe("Run ai-git --setup");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/lib/errors.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// apps/cli/src/lib/errors.ts

/**
 * Thrown when a user cancels a @clack/prompts interaction (Ctrl+C or cancel).
 * Used uniformly across all fromPromise() prompt actors.
 */
export class UserCancelledError extends Error {
  override name = "UserCancelledError" as const;
  constructor() {
    super("User cancelled");
  }
}

/**
 * Typed CLI error with exit code and optional user-facing suggestion.
 * Replaces scattered process.exit() calls throughout the codebase.
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1,
    public suggestion?: string,
  ) {
    super(message);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/lib/errors.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/lib/errors.ts apps/cli/src/lib/errors.test.ts
git commit -m "feat: add shared error types for state machines"
```

---

## Task 3: Create Shared Utility — extractErrorMessage()

**Files:**
- Modify: `apps/cli/src/lib/utils.ts`
- Modify: `apps/cli/src/lib/utils.test.ts`

**Step 1: Write the failing test**

Add to the existing `apps/cli/src/lib/utils.test.ts`:

```typescript
import { extractErrorMessage } from "./utils.ts";

describe("extractErrorMessage", () => {
  test("extracts message from Error instance", () => {
    expect(extractErrorMessage(new Error("test error"))).toBe("test error");
  });

  test("extracts stderr from shell error object", () => {
    const shellErr = { stderr: Buffer.from("git: not found") };
    expect(extractErrorMessage(shellErr)).toBe("git: not found");
  });

  test("extracts stderr string from error object", () => {
    const err = { stderr: "permission denied" };
    expect(extractErrorMessage(err)).toBe("permission denied");
  });

  test("converts unknown values to string", () => {
    expect(extractErrorMessage(42)).toBe("42");
    expect(extractErrorMessage(null)).toBe("Unknown error");
    expect(extractErrorMessage(undefined)).toBe("Unknown error");
  });

  test("handles string errors", () => {
    expect(extractErrorMessage("raw string error")).toBe("raw string error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/lib/utils.test.ts`
Expected: FAIL — extractErrorMessage not exported

**Step 3: Add implementation to utils.ts**

Append to `apps/cli/src/lib/utils.ts`:

```typescript
/**
 * Extract a human-readable error message from any thrown value.
 * Handles: Error instances, shell errors with stderr, strings, and unknown types.
 * Replaces 5+ different error extraction patterns across the codebase.
 */
export function extractErrorMessage(error: unknown): string {
  if (error === null || error === undefined) return "Unknown error";

  // Shell errors from Bun.$ have a stderr property
  if (typeof error === "object" && "stderr" in error) {
    const stderr = (error as { stderr: unknown }).stderr;
    const str = stderr instanceof Buffer ? stderr.toString() : String(stderr);
    return str.trim() || "Unknown error";
  }

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  return String(error);
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/lib/utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/lib/utils.ts apps/cli/src/lib/utils.test.ts
git commit -m "feat: add extractErrorMessage utility for unified error handling"
```

---

## Task 4: Create Clack Prompt Actors

**Files:**
- Create: `apps/cli/src/machines/actors/clack.actors.ts`
- Create: `apps/cli/src/machines/actors/clack.actors.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/cli/src/machines/actors/clack.actors.test.ts
import { describe, test, expect } from "bun:test";
import { createActor, waitFor, setup, fromPromise, assign } from "xstate";
import { UserCancelledError } from "../../lib/errors.ts";
import {
  createSelectActor,
  createConfirmActor,
  createTextActor,
  createMultiselectActor,
} from "./clack.actors.ts";

// We test the actor factory functions, not the actual @clack/prompts calls.
// The factories accept a resolver function so we can inject mocks.

describe("createSelectActor", () => {
  test("returns user selection on success", async () => {
    const actor = createSelectActor(async (opts) => "commit");
    const ref = createActor(actor, { input: { message: "Action", options: [] } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe("commit");
  });

  test("throws UserCancelledError when resolver returns cancel symbol", async () => {
    const actor = createSelectActor(async () => Symbol.for("cancel"));
    const ref = createActor(actor, { input: { message: "Action", options: [] } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "error" || s.status === "done");
    expect(snap.status).toBe("error");
    expect(snap.error).toBeInstanceOf(UserCancelledError);
  });
});

describe("createConfirmActor", () => {
  test("returns boolean on success", async () => {
    const actor = createConfirmActor(async () => true);
    const ref = createActor(actor, { input: { message: "Continue?" } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe(true);
  });
});

describe("createTextActor", () => {
  test("returns trimmed text on success", async () => {
    const actor = createTextActor(async () => "  hello  ");
    const ref = createActor(actor, { input: { message: "Enter text" } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe("hello");
  });
});

describe("createMultiselectActor", () => {
  test("returns selected array on success", async () => {
    const actor = createMultiselectActor(async () => ["a.ts", "b.ts"]);
    const ref = createActor(actor, { input: { message: "Select files", options: [] } });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toEqual(["a.ts", "b.ts"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/machines/actors/clack.actors.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// apps/cli/src/machines/actors/clack.actors.ts
import { fromPromise } from "xstate";
import {
  select,
  confirm,
  text,
  multiselect,
  isCancel,
  type SelectOptions,
  type ConfirmOptions,
  type TextOptions,
  type MultiSelectOptions,
} from "@clack/prompts";
import { UserCancelledError } from "../../lib/errors.ts";

// ── Types ────────────────────────────────────────────────────────────

type SelectInput = {
  message: string;
  options: Array<{ value: string; label: string; hint?: string }>;
};

type ConfirmInput = {
  message: string;
  initialValue?: boolean;
};

type TextInput = {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (value: string) => string | void;
};

type MultiselectInput = {
  message: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
};

// ── Cancel Sentinel Check ────────────────────────────────────────────

function assertNotCancelled<T>(value: T | symbol): T {
  if (isCancel(value) || typeof value === "symbol") {
    throw new UserCancelledError();
  }
  return value as T;
}

// ── Actor Factories ──────────────────────────────────────────────────
// Each factory accepts an optional resolver override for testing.
// In production, the resolver is the actual @clack/prompts function.

export function createSelectActor(
  resolver: (input: SelectInput) => Promise<string | symbol> = (input) =>
    select(input) as Promise<string | symbol>,
) {
  return fromPromise(async ({ input }: { input: SelectInput }) => {
    const result = await resolver(input);
    return assertNotCancelled(result) as string;
  });
}

export function createConfirmActor(
  resolver: (input: ConfirmInput) => Promise<boolean | symbol> = (input) =>
    confirm(input) as Promise<boolean | symbol>,
) {
  return fromPromise(async ({ input }: { input: ConfirmInput }) => {
    const result = await resolver(input);
    return assertNotCancelled(result) as boolean;
  });
}

export function createTextActor(
  resolver: (input: TextInput) => Promise<string | symbol> = (input) =>
    text(input) as Promise<string | symbol>,
) {
  return fromPromise(async ({ input }: { input: TextInput }) => {
    const result = await resolver(input);
    const value = assertNotCancelled(result) as string;
    return (value ?? "").trim();
  });
}

export function createMultiselectActor(
  resolver: (input: MultiselectInput) => Promise<string[] | symbol> = (input) =>
    multiselect(input) as Promise<string[] | symbol>,
) {
  return fromPromise(async ({ input }: { input: MultiselectInput }) => {
    const result = await resolver(input);
    return assertNotCancelled(result) as string[];
  });
}

// ── Production Singleton Actors ──────────────────────────────────────
// These are the default actors used in machine definitions.

export const selectActor = createSelectActor();
export const confirmActor = createConfirmActor();
export const textActor = createTextActor();
export const multiselectActor = createMultiselectActor();

// Re-export types for machine definitions
export type { SelectInput, ConfirmInput, TextInput, MultiselectInput };
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/machines/actors/clack.actors.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/machines/actors/clack.actors.ts apps/cli/src/machines/actors/clack.actors.test.ts
git commit -m "feat: add @clack/prompts XState actor wrappers with cancel handling"
```

---

## Task 5: Create Git Operation Actors

**Files:**
- Create: `apps/cli/src/machines/actors/git.actors.ts`
- Create: `apps/cli/src/machines/actors/git.actors.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/cli/src/machines/actors/git.actors.test.ts
import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
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
    const snap = await waitFor(ref, (s) => s.status === "error" || s.status === "done");
    expect(snap.status).toBe("error");
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
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/machines/actors/git.actors.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// apps/cli/src/machines/actors/git.actors.ts
import { fromPromise } from "xstate";
import {
  getStagedFiles,
  getUnstagedFiles,
  stageFiles,
  stageAllExcept,
  commit,
  push,
  addRemoteAndPush,
  getBranchName,
  setBranchName,
  getStagedDiff,
  getRecentCommits,
  getStagedFileList,
  type CommitResult,
} from "../../lib/git.ts";
import { CLIError } from "../../lib/errors.ts";

// ── Actor Factories ──────────────────────────────────────────────────
// Each factory accepts an optional resolver for testing.

export function createCheckGitInstalledActor(
  checker: () => Promise<void> = async () => {
    try {
      await Bun.$`git --version`.quiet();
    } catch {
      throw new CLIError("git is not installed", 1, "Install git: https://git-scm.com");
    }
  },
) {
  return fromPromise(async () => { await checker(); });
}

export function createCheckInsideRepoActor(
  checker: () => Promise<void> = async () => {
    try {
      await Bun.$`git rev-parse --is-inside-work-tree`.quiet();
    } catch {
      throw new CLIError("Not inside a git repository", 1, "Run 'git init' first");
    }
  },
) {
  return fromPromise(async () => { await checker(); });
}

export function createGetStagedFilesActor(
  resolver: () => Promise<string[]> = getStagedFiles,
) {
  return fromPromise(async () => resolver());
}

export function createGetUnstagedFilesActor(
  resolver: () => Promise<string[]> = getUnstagedFiles,
) {
  return fromPromise(async () => resolver());
}

export function createStageFilesActor(
  resolver: (files: string[]) => Promise<void> = stageFiles,
) {
  return fromPromise(async ({ input }: { input: { files: string[] } }) => {
    await resolver(input.files);
  });
}

export function createStageAllExceptActor(
  resolver: (exclude?: string[]) => Promise<void> = stageAllExcept,
) {
  return fromPromise(async ({ input }: { input: { exclude?: string[] } }) => {
    await resolver(input.exclude);
  });
}

export function createCommitActor(
  resolver: (message: string) => Promise<CommitResult> = commit,
) {
  return fromPromise(async ({ input }: { input: { message: string } }) => {
    return resolver(input.message);
  });
}

export function createPushActor(
  resolver: () => Promise<void> = push,
) {
  return fromPromise(async () => { await resolver(); });
}

export function createAddRemoteAndPushActor(
  resolver: (url: string) => Promise<void> = addRemoteAndPush,
) {
  return fromPromise(async ({ input }: { input: { url: string } }) => {
    await resolver(input.url);
  });
}

export function createGetBranchNameActor(
  resolver: () => Promise<string | null> = async () => getBranchName(),
) {
  return fromPromise(async () => resolver());
}

export function createSetBranchNameActor(
  resolver: (name: string) => Promise<void> = async (name) => { await setBranchName(name); },
) {
  return fromPromise(async ({ input }: { input: { name: string } }) => {
    await resolver(input.name);
  });
}

export function createGatherContextActor(
  resolver?: () => Promise<{ diff: string; commits: string; fileList: string }>,
) {
  const defaultResolver = async () => {
    const [diff, commits, fileList] = await Promise.all([
      getStagedDiff(),
      getRecentCommits(5).then((c) => c.join("\n")),
      getStagedFileList(),
    ]);
    return { diff, commits, fileList };
  };
  return fromPromise(async () => (resolver ?? defaultResolver)());
}

// ── Production Singleton Actors ──────────────────────────────────────

export const checkGitInstalledActor = createCheckGitInstalledActor();
export const checkInsideRepoActor = createCheckInsideRepoActor();
export const getStagedFilesActor = createGetStagedFilesActor();
export const getUnstagedFilesActor = createGetUnstagedFilesActor();
export const stageFilesActor = createStageFilesActor();
export const stageAllExceptActor = createStageAllExceptActor();
export const commitActor = createCommitActor();
export const pushActor = createPushActor();
export const addRemoteAndPushActor = createAddRemoteAndPushActor();
export const getBranchNameActor = createGetBranchNameActor();
export const setBranchNameActor = createSetBranchNameActor();
export const gatherContextActor = createGatherContextActor();
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/machines/actors/git.actors.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/machines/actors/git.actors.ts apps/cli/src/machines/actors/git.actors.test.ts
git commit -m "feat: add git operation XState actors with factory pattern"
```

---

## Task 6: Create AI Invocation Actor

**Files:**
- Create: `apps/cli/src/machines/actors/ai.actors.ts`
- Create: `apps/cli/src/machines/actors/ai.actors.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/cli/src/machines/actors/ai.actors.test.ts
import { describe, test, expect } from "bun:test";
import { createActor, waitFor } from "xstate";
import { createInvokeAIActor } from "./ai.actors.ts";

describe("createInvokeAIActor", () => {
  test("returns raw message from AI adapter", async () => {
    const actor = createInvokeAIActor(async () => "feat: add login");
    const ref = createActor(actor, {
      input: {
        model: "test",
        system: "system prompt",
        prompt: "user prompt",
        modelName: "Test Model",
        slowThresholdMs: 0,
      },
    });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "done");
    expect(snap.output).toBe("feat: add login");
  });

  test("propagates AI errors", async () => {
    const actor = createInvokeAIActor(async () => {
      throw new Error("API rate limit exceeded");
    });
    const ref = createActor(actor, {
      input: {
        model: "test",
        system: "",
        prompt: "",
        modelName: "Test",
        slowThresholdMs: 0,
      },
    });
    ref.start();
    const snap = await waitFor(ref, (s) => s.status === "error" || s.status === "done");
    expect(snap.status).toBe("error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/machines/actors/ai.actors.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// apps/cli/src/machines/actors/ai.actors.ts
import { fromPromise } from "xstate";
import { spinner } from "@clack/prompts";
import pc from "picocolors";
import type { ProviderAdapter } from "../../providers/types.ts";
import { createSlowWarningTimer } from "../../lib/generation.ts";

type InvokeAIInput = {
  model: string;
  system: string;
  prompt: string;
  modelName: string;
  slowThresholdMs: number;
  adapter?: ProviderAdapter;
};

/**
 * Factory for the AI invocation actor.
 * Includes spinner and slow warning timer colocated with the async call.
 */
export function createInvokeAIActor(
  resolver?: (input: { model: string; system: string; prompt: string }) => Promise<string>,
) {
  return fromPromise(async ({ input }: { input: InvokeAIInput }) => {
    const invoke = resolver ?? (async (opts: { model: string; system: string; prompt: string }) => {
      if (!input.adapter) throw new Error("No adapter provided");
      return input.adapter.invoke(opts);
    });

    const s = spinner();
    s.start(`Analyzing changes with ${input.modelName}...`);

    const cancelSlowWarning = createSlowWarningTimer(input.slowThresholdMs, () => {
      s.message(
        pc.yellow(`Still generating with ${input.modelName}... Speed depends on your selected provider and model.`)
      );
    });

    try {
      const rawMsg = await invoke({ model: input.model, system: input.system, prompt: input.prompt });
      cancelSlowWarning();
      s.stop("Message generated");
      return rawMsg;
    } catch (e) {
      cancelSlowWarning();
      s.stop("Generation failed");
      throw e;
    }
  });
}

export const invokeAIActor = createInvokeAIActor();
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/machines/actors/ai.actors.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/machines/actors/ai.actors.ts apps/cli/src/machines/actors/ai.actors.test.ts
git commit -m "feat: add AI invocation XState actor with spinner integration"
```

---

## Task 7: Push Machine (Simplest Leaf Machine)

**Files:**
- Create: `apps/cli/src/machines/push.machine.ts`
- Create: `apps/cli/src/machines/push.machine.test.ts`

This is the simplest complete flow — good first machine to establish patterns.

**Step 1: Write the failing tests**

```typescript
// apps/cli/src/machines/push.machine.test.ts
import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { pushMachine } from "./push.machine.ts";
import { UserCancelledError } from "../lib/errors.ts";

describe("pushMachine", () => {
  // PU1: --push flag → auto-push success
  test("PU1: --push flag triggers auto-push", async () => {
    const machine = pushMachine.provide({
      actors: {
        pushActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.pushed).toBe(true);
    expect(snap.output.exitCode).toBe(0);
  });

  // PU8: push error
  test("PU8: push error exits gracefully", async () => {
    const machine = pushMachine.provide({
      actors: {
        pushActor: fromPromise(async () => { throw new Error("auth failed"); }),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.pushed).toBe(false);
  });

  // PU2-PU3: missing remote → recovery flow
  test("PU3: missing remote in interactive mode → prompt to add", async () => {
    const machine = pushMachine.provide({
      actors: {
        pushActor: fromPromise(async () => {
          throw Object.assign(new Error(), { stderr: "No configured push destination" });
        }),
        confirmActor: fromPromise(async () => true),
        textActor: fromPromise(async () => "git@github.com:user/repo.git"),
        addRemoteAndPushActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { push: true, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.pushed).toBe(true);
  });

  // PU9: interactive mode → prompt → Yes
  test("PU9: interactive mode prompts user and pushes on yes", async () => {
    const machine = pushMachine.provide({
      actors: {
        confirmActor: fromPromise(async () => true),
        pushActor: fromPromise(async () => {}),
      },
    });
    const actor = createActor(machine, {
      input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.pushed).toBe(true);
  });

  // PU10: interactive mode → prompt → No
  test("PU10: interactive mode skips on no", async () => {
    const machine = pushMachine.provide({
      actors: {
        confirmActor: fromPromise(async () => false),
      },
    });
    const actor = createActor(machine, {
      input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.pushed).toBe(false);
  });

  // PU11: non-interactive without --push → skip
  test("PU11: non-interactive without --push skips push", async () => {
    const actor = createActor(pushMachine, {
      input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.pushed).toBe(false);
  });

  // Cancel handling
  test("user cancel at push prompt → skip gracefully", async () => {
    const machine = pushMachine.provide({
      actors: {
        confirmActor: fromPromise(async () => { throw new UserCancelledError(); }),
      },
    });
    const actor = createActor(machine, {
      input: { push: false, dangerouslyAutoApprove: false, isInteractiveMode: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.pushed).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/machines/push.machine.test.ts`
Expected: FAIL — module not found

**Step 3: Write the push machine implementation**

```typescript
// apps/cli/src/machines/push.machine.ts
import { setup, assign, fromPromise } from "xstate";
import { log } from "@clack/prompts";
import pc from "picocolors";
import {
  pushActor as defaultPushActor,
  addRemoteAndPushActor as defaultAddRemoteActor,
} from "./actors/git.actors.ts";
import {
  confirmActor as defaultConfirmActor,
  textActor as defaultTextActor,
} from "./actors/clack.actors.ts";
import { extractErrorMessage } from "../lib/errors.ts";

// ── Types ────────────────────────────────────────────────────────────

export interface PushInput {
  push: boolean;
  dangerouslyAutoApprove: boolean;
  isInteractiveMode: boolean;
}

export interface PushOutput {
  pushed: boolean;
  exitCode: number;
}

interface PushContext {
  push: boolean;
  dangerouslyAutoApprove: boolean;
  isInteractiveMode: boolean;
  pushed: boolean;
  pushError: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────

function isMissingRemoteError(error: unknown): boolean {
  const msg = extractErrorMessage(error);
  return msg.includes("No configured push destination") ||
    msg.includes("no remote repository specified");
}

// ── Machine ──────────────────────────────────────────────────────────

export const pushMachine = setup({
  types: {
    context: {} as PushContext,
    input: {} as PushInput,
    output: {} as PushOutput,
  },
  actors: {
    pushActor: defaultPushActor,
    addRemoteAndPushActor: defaultAddRemoteActor,
    confirmActor: defaultConfirmActor,
    textActor: defaultTextActor,
  },
  guards: {
    isPushFlag: ({ context }) => context.push,
    isInteractiveMode: ({ context }) => context.isInteractiveMode,
    isAutomated: ({ context }) => context.dangerouslyAutoApprove,
    isMissingRemote: ({ context }) => isMissingRemoteError(context.pushError),
  },
  actions: {
    logPushError: ({ context }) => {
      const msg = extractErrorMessage(context.pushError);
      log.error(pc.red(`Push failed: ${msg}`));
    },
    logMissingRemote: () => {
      log.warn("No remote repository configured.");
    },
    logMissingRemoteAutomated: () => {
      log.error(pc.red("No remote repository configured. Cannot push."));
    },
  },
}).createMachine({
  id: "push",
  initial: "checkFlags",
  context: ({ input }) => ({
    push: input.push,
    dangerouslyAutoApprove: input.dangerouslyAutoApprove,
    isInteractiveMode: input.isInteractiveMode,
    pushed: false,
    pushError: null,
  }),
  states: {
    checkFlags: {
      always: [
        { guard: "isPushFlag", target: "pushing" },
        { guard: "isInteractiveMode", target: "promptPush" },
        { target: "done" },
      ],
    },

    promptPush: {
      invoke: {
        src: "confirmActor",
        input: () => ({ message: "Do you want to git push?", initialValue: false }),
        onDone: [
          { guard: ({ event }) => event.output === true, target: "pushing" },
          { target: "done" },
        ],
        onError: { target: "done" }, // Cancel → skip
      },
    },

    pushing: {
      invoke: {
        src: "pushActor",
        onDone: {
          target: "done",
          actions: assign({ pushed: true }),
        },
        onError: {
          target: "pushFailed",
          actions: assign({ pushError: ({ event }) => event.error }),
        },
      },
    },

    pushFailed: {
      always: [
        {
          guard: ({ context }) => isMissingRemoteError(context.pushError) && context.dangerouslyAutoApprove,
          target: "done",
          actions: "logMissingRemoteAutomated",
        },
        {
          guard: ({ context }) => isMissingRemoteError(context.pushError),
          target: "askAddRemote",
          actions: "logMissingRemote",
        },
        {
          target: "done",
          actions: "logPushError",
        },
      ],
    },

    askAddRemote: {
      invoke: {
        src: "confirmActor",
        input: () => ({ message: "Do you want to add a remote repository?", initialValue: true }),
        onDone: [
          { guard: ({ event }) => event.output === true, target: "enterRemoteUrl" },
          { target: "done" },
        ],
        onError: { target: "done" },
      },
    },

    enterRemoteUrl: {
      invoke: {
        src: "textActor",
        input: () => ({
          message: "Enter the remote repository URL:",
          placeholder: "git@github.com:user/repo.git",
          validate: (value: string) => { if (!value) return "URL is required"; },
        }),
        onDone: {
          target: "addRemoteAndPush",
        },
        onError: { target: "done" }, // Cancel → skip
      },
    },

    addRemoteAndPush: {
      invoke: {
        src: "addRemoteAndPushActor",
        input: ({ event }) => ({ url: (event as { output: string }).output }),
        onDone: {
          target: "done",
          actions: assign({ pushed: true }),
        },
        onError: {
          target: "done",
          actions: ({ event }) => {
            log.error(pc.red(extractErrorMessage(event.error)));
          },
        },
      },
    },

    done: {
      type: "final" as const,
    },
  },
  output: ({ context }) => ({
    pushed: context.pushed,
    exitCode: 0,
  }),
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/machines/push.machine.test.ts`
Expected: PASS (all 7 tests)

**Step 5: Run all tests to ensure no regressions**

Run: `cd apps/cli && bun test`
Expected: All existing tests still pass

**Step 6: Commit**

```bash
git add apps/cli/src/machines/push.machine.ts apps/cli/src/machines/push.machine.test.ts
git commit -m "feat: add push state machine (PU1-PU11 scenarios)"
```

---

## Task 8: Staging Machine (Fixes Bug #1)

**Files:**
- Create: `apps/cli/src/machines/staging.machine.ts`
- Create: `apps/cli/src/machines/staging.machine.test.ts`

This is the machine that fixes **Bug #1** — the `-a` flag silently ignoring unstaged files when some files are already staged.

**Step 1: Write the failing tests (including Bug #1 regression test)**

```typescript
// apps/cli/src/machines/staging.machine.test.ts
import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { stagingMachine } from "./staging.machine.ts";

describe("stagingMachine", () => {
  // ST1: files already staged, no unstaged → proceed
  test("ST1: proceeds with existing staged files when no unstaged exist", async () => {
    const machine = stagingMachine.provide({
      actors: {
        getStagedFilesActor: fromPromise(async () => ["a.ts", "b.ts"]),
        getUnstagedFilesActor: fromPromise(async () => []),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.stagedFiles).toEqual(["a.ts", "b.ts"]);
    expect(snap.output.aborted).toBe(false);
  });

  // ** BUG #1 REGRESSION TEST **
  // ST5/ST6: files staged + unstaged + stageAll → auto-stage remaining
  test("ST5: stageAll flag auto-stages remaining unstaged files (Bug #1 fix)", async () => {
    let stageAllCalled = false;
    const machine = stagingMachine.provide({
      actors: {
        getStagedFilesActor: fromPromise(async () => {
          // After stageAllExcept, return all files
          return stageAllCalled ? ["a.ts", "b.ts", "c.ts"] : ["a.ts"];
        }),
        getUnstagedFilesActor: fromPromise(async () => ["b.ts", "c.ts"]),
        stageAllExceptActor: fromPromise(async () => { stageAllCalled = true; }),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: true, dangerouslyAutoApprove: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(stageAllCalled).toBe(true); // KEY: stageAllExcept MUST be called
    expect(snap.output.aborted).toBe(false);
  });

  // ST6: dangerouslyAutoApprove also triggers auto-staging
  test("ST6: dangerouslyAutoApprove auto-stages remaining (Bug #1 fix)", async () => {
    let stageAllCalled = false;
    const machine = stagingMachine.provide({
      actors: {
        getStagedFilesActor: fromPromise(async () =>
          stageAllCalled ? ["a.ts", "b.ts"] : ["a.ts"]
        ),
        getUnstagedFilesActor: fromPromise(async () => ["b.ts"]),
        stageAllExceptActor: fromPromise(async () => { stageAllCalled = true; }),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: true },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(stageAllCalled).toBe(true);
  });

  // ST7: nothing staged, nothing unstaged → clean
  test("ST7: clean working directory returns empty with no abort", async () => {
    const machine = stagingMachine.provide({
      actors: {
        getStagedFilesActor: fromPromise(async () => []),
        getUnstagedFilesActor: fromPromise(async () => []),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.stagedFiles).toEqual([]);
    expect(snap.output.aborted).toBe(false);
  });

  // ST8: nothing staged + stageAll → auto-stage all
  test("ST8: stageAll with nothing staged stages everything", async () => {
    let staged = false;
    const machine = stagingMachine.provide({
      actors: {
        getStagedFilesActor: fromPromise(async () => staged ? ["a.ts"] : []),
        getUnstagedFilesActor: fromPromise(async () => ["a.ts"]),
        stageAllExceptActor: fromPromise(async () => { staged = true; }),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: true, dangerouslyAutoApprove: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(staged).toBe(true);
    expect(snap.output.aborted).toBe(false);
  });

  // ST11: cancel → abort
  test("ST11: cancel in interactive mode aborts", async () => {
    const machine = stagingMachine.provide({
      actors: {
        getStagedFilesActor: fromPromise(async () => []),
        getUnstagedFilesActor: fromPromise(async () => ["a.ts"]),
        selectActor: fromPromise(async () => "cancel"),
      },
    });
    const actor = createActor(machine, {
      input: { stageAll: false, dangerouslyAutoApprove: false },
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.aborted).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/machines/staging.machine.test.ts`
Expected: FAIL

**Step 3: Write the staging machine implementation**

The staging machine is a moderately complex machine with two main paths (hasStaged vs noneStaged). The key Bug #1 fix is the explicit `autoStageMore` state.

Create `apps/cli/src/machines/staging.machine.ts` implementing the staging sub-flow from `docs/cli/states.mmd` (ST1-ST14). The machine must:

- Use compound states `hasStaged` and `noneStaged` as per the diagram
- Include an explicit `autoStageMore` state under `hasStaged` that calls `stageAllExcept()` when `shouldAutoStage` guard is true (this is the Bug #1 fix)
- Have `fromPromise()` actors for: getStagedFiles, getUnstagedFiles, stageAllExcept, stageFiles, select prompt, multiselect prompt
- Guards: `hasStaged`, `hasUnstaged`, `shouldAutoStage` (stageAll || dangerouslyAutoApprove)
- Output: `{ stagedFiles: string[], aborted: boolean }`
- All cancel paths transition to `aborted` final state

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/machines/staging.machine.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `cd apps/cli && bun test`
Expected: All pass

**Step 6: Commit**

```bash
git add apps/cli/src/machines/staging.machine.ts apps/cli/src/machines/staging.machine.test.ts
git commit -m "feat: add staging state machine with Bug #1 fix (ST1-ST14)"
```

---

## Task 9: Generation Machine (Fixes Bug #3)

**Files:**
- Create: `apps/cli/src/machines/generation.machine.ts`
- Create: `apps/cli/src/machines/generation.machine.test.ts`

This is the most complex machine — the 7-state generation loop. It replaces the `while/switch` pattern in `generation.ts`.

**Step 1: Write the failing tests (including Bug #3 regression)**

```typescript
// apps/cli/src/machines/generation.machine.test.ts
import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { generationMachine } from "./generation.machine.ts";

const mockContext = (overrides = {}) => ({
  model: "test-model",
  modelName: "Test Model",
  options: { commit: false, dangerouslyAutoApprove: false, dryRun: false, hint: undefined },
  slowWarningThresholdMs: 0,
  ...overrides,
});

describe("generationMachine", () => {
  // GN4: valid message → prompt → commit → done (happy path)
  test("GN4: valid message → commit → done", async () => {
    const machine = generationMachine.provide({
      actors: {
        getBranchNameActor: fromPromise(async () => "main"),
        gatherContextActor: fromPromise(async () => ({
          diff: "diff content", commits: "recent commits", fileList: "M file.ts",
        })),
        invokeAIActor: fromPromise(async () => "feat: add login"),
        selectActor: fromPromise(async () => "commit"),
        commitActor: fromPromise(async () => ({
          hash: "abc1234", branch: "main", subject: "feat: add login",
          filesChanged: 1, insertions: 10, deletions: 0, files: [], isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, { input: mockContext() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.committed).toBe(true);
    expect(snap.output.aborted).toBe(false);
  });

  // GN6: auto-retry on validation failure (up to 3)
  test("GN6: auto-retries up to 3 times on critical validation errors", async () => {
    let callCount = 0;
    const machine = generationMachine.provide({
      actors: {
        getBranchNameActor: fromPromise(async () => "main"),
        gatherContextActor: fromPromise(async () => ({
          diff: "", commits: "", fileList: "",
        })),
        invokeAIActor: fromPromise(async () => {
          callCount++;
          if (callCount <= 3) return "This is not a conventional commit with an extremely long header that is definitely over fifty characters";
          return "feat: add login";
        }),
        selectActor: fromPromise(async () => "commit"),
        commitActor: fromPromise(async () => ({
          hash: "abc", branch: "main", subject: "feat: add login",
          filesChanged: 1, insertions: 1, deletions: 0, files: [], isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, { input: mockContext() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(callCount).toBe(4); // 3 retries + 1 success
    expect(snap.output.committed).toBe(true);
  });

  // ** BUG #3 REGRESSION TEST **
  // GN8-GN11: fatal errors → done(aborted), NOT process.exit(1)
  test("Bug #3: AI provider error returns done(aborted) instead of exit", async () => {
    const machine = generationMachine.provide({
      actors: {
        getBranchNameActor: fromPromise(async () => "main"),
        gatherContextActor: fromPromise(async () => ({
          diff: "", commits: "", fileList: "",
        })),
        invokeAIActor: fromPromise(async () => {
          throw new Error("API rate limit exceeded");
        }),
      },
    });
    const actor = createActor(machine, { input: mockContext() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    // KEY: machine reaches done state (no process.exit)
    expect(snap.output.aborted).toBe(true);
    expect(snap.output.committed).toBe(false);
  });

  // GN11: empty AI response → fatal → done(aborted)
  test("Bug #3: empty AI response returns done(aborted)", async () => {
    const machine = generationMachine.provide({
      actors: {
        getBranchNameActor: fromPromise(async () => "main"),
        gatherContextActor: fromPromise(async () => ({
          diff: "", commits: "", fileList: "",
        })),
        invokeAIActor: fromPromise(async () => "```\n```"), // Only code blocks
      },
    });
    const actor = createActor(machine, { input: mockContext() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.aborted).toBe(true);
  });

  // GN14: dry-run
  test("GN14: dry-run skips AI call and returns done", async () => {
    let aiCalled = false;
    const machine = generationMachine.provide({
      actors: {
        getBranchNameActor: fromPromise(async () => "main"),
        gatherContextActor: fromPromise(async () => ({
          diff: "diff", commits: "", fileList: "",
        })),
        invokeAIActor: fromPromise(async () => { aiCalled = true; return ""; }),
      },
    });
    const actor = createActor(machine, {
      input: mockContext({ options: { commit: false, dangerouslyAutoApprove: false, dryRun: true } }),
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(aiCalled).toBe(false);
    expect(snap.output.aborted).toBe(false);
    expect(snap.output.committed).toBe(false);
  });

  // GN22: cancel at menu → abort
  test("GN22: cancel at action menu aborts", async () => {
    const machine = generationMachine.provide({
      actors: {
        getBranchNameActor: fromPromise(async () => "main"),
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        invokeAIActor: fromPromise(async () => "feat: add login"),
        selectActor: fromPromise(async () => "cancel"),
      },
    });
    const actor = createActor(machine, { input: mockContext() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.aborted).toBe(true);
  });

  // GN15: --commit flag → auto-commit
  test("GN15: auto-commit with --commit flag", async () => {
    const machine = generationMachine.provide({
      actors: {
        getBranchNameActor: fromPromise(async () => "main"),
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        invokeAIActor: fromPromise(async () => "feat: add login"),
        commitActor: fromPromise(async () => ({
          hash: "abc", branch: "main", subject: "feat: add login",
          filesChanged: 1, insertions: 1, deletions: 0, files: [], isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, {
      input: mockContext({ options: { commit: true, dangerouslyAutoApprove: false, dryRun: false } }),
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(snap.output.committed).toBe(true);
  });

  // GN24: retry with refinement instructions
  test("GN24: retry with instructions regenerates", async () => {
    let genCount = 0;
    const machine = generationMachine.provide({
      actors: {
        getBranchNameActor: fromPromise(async () => "main"),
        gatherContextActor: fromPromise(async () => ({ diff: "", commits: "", fileList: "" })),
        invokeAIActor: fromPromise(async () => {
          genCount++;
          return "feat: add login";
        }),
        selectActor: fromPromise(async () => genCount === 1 ? "retry" : "commit"),
        textActor: fromPromise(async () => "Make it shorter"),
        commitActor: fromPromise(async () => ({
          hash: "abc", branch: "main", subject: "feat: add login",
          filesChanged: 1, insertions: 1, deletions: 0, files: [], isRoot: false,
        })),
      },
    });
    const actor = createActor(machine, { input: mockContext() });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done");
    expect(genCount).toBe(2);
    expect(snap.output.committed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/machines/generation.machine.test.ts`
Expected: FAIL

**Step 3: Write the generation machine**

Create `apps/cli/src/machines/generation.machine.ts` implementing the generation sub-flow from `docs/cli/states.mmd` (GN1-GN29). The machine must:

- States: `resolveBranch`, `promptBranch`, `setBranch`, `generate` (compound: gatherContext → checkDryRun → invokeAI → cleanResponse → checkEmpty), `validate`, `autoRetry`, `prompt` (compound: checkAutoCommit → autoCommit | showMenu → menu), `retry`, `edit`, `fatalError`, `dryRun`, `done`
- **Bug #3 fix**: `invokeAI` `onError` → `fatalError` state → `done(aborted)`. No `process.exit(1)`.
- Context tracks: autoRetries, editedManually, generationErrors, userRefinements, lastGeneratedMessage, currentMessage, branchName, validationResult
- Reuse existing functions: `validateCommitMessage()`, `buildRetryContext()`, `showCommitResult()`, `buildSystemPrompt()`, `buildUserPrompt()`, `createSlowWarningTimer()`
- Output: `GenerationResult { message, committed, aborted }`

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/machines/generation.machine.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `cd apps/cli && bun test`
Expected: All pass

**Step 6: Commit**

```bash
git add apps/cli/src/machines/generation.machine.ts apps/cli/src/machines/generation.machine.test.ts
git commit -m "feat: add generation state machine with Bug #3 fix (GN1-GN29)"
```

---

## Task 10: Setup Wizard Machine

**Files:**
- Create: `apps/cli/src/machines/setup-wizard.machine.ts`
- Create: `apps/cli/src/machines/setup-wizard.machine.test.ts`

Implement the setup wizard sub-flow from `docs/cli/states.mmd` (SW1-SW20). Extract the pure logic from `src/lib/onboarding/wizard.ts` into the machine.

Key states: preCheck → selectProvider → [cliFlow | apiFlow | failed]
Output: `{ completed: boolean, config: UserConfig | null }`

Tests should cover: SW1 (CLI happy path), SW4-SW11 (API flow), SW12-SW15 (cancel paths).

**Commit message**: `feat: add setup wizard state machine (SW1-SW20)`

---

## Task 11: Upgrade Machine (Fixes Bug #5)

**Files:**
- Create: `apps/cli/src/machines/upgrade.machine.ts`
- Create: `apps/cli/src/machines/upgrade.machine.test.ts`

Implement the upgrade sub-flow from `docs/cli/states.mmd` (UP1-UP11). Include the **Bug #5 fix**: explicit `checkBinary` state between extract and install.

Tests should cover: UP1-UP3 (package manager delegation), UP4-UP5 (self-update), UP6-UP10 (error paths), UP11 (extraction check).

**Commit message**: `feat: add upgrade state machine with Bug #5 fix (UP1-UP11)`

---

## Task 12: Init Machine (Fixes Bug #4)

**Files:**
- Create: `apps/cli/src/machines/init.machine.ts`
- Create: `apps/cli/src/machines/init.machine.test.ts`

Implement the init sub-flow from `docs/cli/states.mmd` (IN1-IN10). Invokes `setupWizardMachine` as a child.

**Bug #4 fix**: The machine reads `setupWizardMachine` output `{ completed: false }` and transitions to its own error state — no internal `process.exit(1)`.

Tests should cover: IN1-IN2 (global config exists), IN3-IN4 (no global), IN5-IN7 (overwrite), IN8 (cancel), IN9-IN10 (try now).

**Commit message**: `feat: add init state machine with Bug #4 fix (IN1-IN10)`

---

## Task 13: CLI Machine (Fixes Bug #2) — Top-Level Orchestrator

**Files:**
- Create: `apps/cli/src/machines/cli.machine.ts`
- Create: `apps/cli/src/machines/cli.machine.test.ts`

This is the top-level orchestrator that replaces `index.ts`'s 581-line action handler.

Key states: flagProcessing → loadConfig → showWelcome → [setupNeeded | resolveProvider] → getAdapter → validateModel → [countdown] → checkGit → checkRepo → checkAvail → staging → generation → push → done

**Bug #2 fix**: Provider error message uses `PROVIDERS.map(p => p.id).join(", ")` instead of hardcoded string missing cerebras.

Invokes child machines: initMachine, setupWizardMachine (via onboarding), stagingMachine, generationMachine, pushMachine.

Output: `{ exitCode: 0 | 1 | 130 }`

Tests should cover key paths: E5-E16 (normal flow), CF1-CF7 (config resolution), PM1-PM12 (provider validation).

**Commit message**: `feat: add CLI orchestrator state machine with Bug #2 fix`

---

## Task 14: Rewrite index.ts

**Files:**
- Modify: `apps/cli/src/index.ts`

**Step 1: Rewrite index.ts**

Replace the 581-line action handler with:

```typescript
#!/usr/bin/env bun
import { createActor, waitFor } from "xstate";
import cac from "cac";
import { VERSION } from "./version.ts";
import { cliMachine } from "./machines/cli.machine.ts";
import { upgradeMachine } from "./machines/upgrade.machine.ts";
import { FLAGS } from "./lib/flags.ts";
import type { CLIOptions } from "./machines/cli.machine.ts";

// Suppress AI SDK warning logs (we handle errors ourselves)
(globalThis as Record<string, unknown>).AI_SDK_LOG_WARNINGS = false;

const cli = cac("ai-git");

// ── Upgrade Subcommand ───────────────────────────────────────────────

cli.command("upgrade", "Upgrade ai-git to the latest version")
  .action(async () => {
    const actor = createActor(upgradeMachine, { input: { version: VERSION } });
    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done");
    process.exit(snapshot.output.exitCode);
  });

// ── Main Command ─────────────────────────────────────────────────────

cli.command("")
  .option(`${FLAGS.provider.short}, ${FLAGS.provider.long} ${FLAGS.provider.arg}`, FLAGS.provider.description)
  .option(`${FLAGS.model.short}, ${FLAGS.model.long} ${FLAGS.model.arg}`, FLAGS.model.description)
  .option(`${FLAGS.stageAll.short}, ${FLAGS.stageAll.long}`, FLAGS.stageAll.description)
  .option(`${FLAGS.commit.short}, ${FLAGS.commit.long}`, FLAGS.commit.description)
  .option(`${FLAGS.push.short}, ${FLAGS.push.long}`, FLAGS.push.description)
  .option(`${FLAGS.hint.short}, ${FLAGS.hint.long} ${FLAGS.hint.arg}`, FLAGS.hint.description)
  .option(`${FLAGS.exclude.short}, ${FLAGS.exclude.long} ${FLAGS.exclude.arg}`, FLAGS.exclude.description)
  .option(FLAGS.dangerouslyAutoApprove.long, FLAGS.dangerouslyAutoApprove.description)
  .option(FLAGS.dryRun.long, FLAGS.dryRun.description)
  .option(FLAGS.setup.long, FLAGS.setup.description)
  .option(FLAGS.init.long, FLAGS.init.description)
  .option(`${FLAGS.version.short}, ${FLAGS.version.long}`, FLAGS.version.description)
  .action(async (options: CLIOptions) => {
    const actor = createActor(cliMachine, {
      input: { options, version: VERSION },
    });
    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done");
    process.exit(snapshot.output.exitCode);
  });

// ── Help ─────────────────────────────────────────────────────────────

cli.help((sections) => {
  const newSections = sections.filter(
    (section) =>
      section.title !== "Commands" &&
      section.body.trim() !== "ai-git" &&
      !section.title?.startsWith("For more info"),
  );
  const usageSection = newSections.find((section) => section.title === "Usage");
  if (usageSection) usageSection.body = "  $ ai-git [options]";
  const usageIndex = newSections.findIndex((section) => section.title === "Usage");
  if (usageIndex !== -1) {
    newSections.splice(usageIndex + 1, 0, { body: "Generate a commit message using AI" });
  }
  return newSections;
});

// ── Entry Point ──────────────────────────────────────────────────────

try {
  const parsed = cli.parse(process.argv, { run: false });
  if (parsed.options.version) {
    console.log(VERSION);
    process.exit(0);
  } else if (parsed.options.help) {
    process.exit(0);
  } else {
    cli.runMatchedCommand();
  }
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Unknown option")) {
    const pc = await import("picocolors").then(m => m.default);
    console.error(pc.red(`Error: ${error.message}`));
    console.error(pc.dim("Use --help to see available options."));
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
}
```

**Step 2: Run all tests**

Run: `cd apps/cli && bun test`
Expected: All pass

**Step 3: Manual smoke test**

Run: `cd apps/cli && bun start --dry-run -a`
Expected: Shows system + user prompts without calling AI

**Step 4: Commit**

```bash
git add apps/cli/src/index.ts
git commit -m "refactor: rewrite index.ts to use CLI state machine (~60 lines)"
```

---

## Task 15: Clean Up Old Files

**Files:**
- Delete: `apps/cli/src/lib/push.ts` (replaced by push.machine.ts)
- Delete: `apps/cli/src/lib/setup.ts` (replaced by setup-wizard.machine.ts)
- Modify: `apps/cli/src/lib/generation.ts` → keep only utility functions (showCommitResult, logCommitError, createSlowWarningTimer, resolveSlowWarningThreshold)

**Step 1: Remove old flow files and update imports**

Remove `handlePush`, `handleStaging`, `runSetupWizard` exports. Keep pure utility functions.

**Step 2: Run all tests**

Run: `cd apps/cli && bun test`
Expected: All pass

**Step 3: Commit**

```bash
git commit -m "refactor: remove old flow files replaced by state machines"
```

---

## Task 16: Update State Machine Documentation (Bug #5)

**Files:**
- Modify: `docs/cli/states.mmd`

**Step 1: Add Bug #5 fix to states.mmd**

In the Upgrade sub-flow, replace:
```mermaid
up_Extract --> up_Install
```
with:
```mermaid
up_Extract --> up_CheckBin
up_CheckBin --> up_Install : binary found
up_CheckBin --> up_ExtractFail : binary not found [UP11]
```

Update header comment: `UP = Upgrade (11)` (was 10)

**Step 2: Commit**

```bash
git add docs/cli/states.mmd
git commit -m "docs: fix Bug #5 — add extraction check state to upgrade diagram"
```

---

## Task 17: Fix `any` Types and Improve Error Handling

**Files:**
- Modify: `apps/cli/src/lib/push.ts` (if still exists) or push.machine.ts
- Modify: any remaining `catch (error: any)` patterns

Replace all `catch (error: any)` with proper typing using `extractErrorMessage()` from utils.ts.

**Commit message**: `fix: replace any types in error handling with extractErrorMessage`

---

## Task 18: Full Verification

**Step 1: Type check**

Run: `cd apps/cli && bun run typecheck`
Expected: Zero errors

**Step 2: Full test suite**

Run: `cd apps/cli && bun test`
Expected: All pass

**Step 3: Manual smoke tests**

Run each of these:
```bash
bun start                     # Interactive mode
bun start -a -c               # Auto stage + commit
bun start -a -c -p            # Full auto
bun start --dry-run -a        # Dry run
bun start --setup             # Setup wizard
bun start --init              # Init flow
```

**Step 4: Verify Bug fixes**

- Bug #1: With files already staged, run `bun start -a` → unstaged files MUST be staged
- Bug #2: Use invalid provider → error message MUST include "cerebras"
- Bug #3: Configure invalid model → graceful exit, no crash
- Bug #4: Cancel during --init wizard → clean exit
- Bug #5: `checkBinary` state exists in upgrade machine

**Step 5: Verify no process.exit() outside index.ts**

Run: `grep -rn "process.exit" apps/cli/src/ --include="*.ts" | grep -v "test" | grep -v "index.ts"`
Expected: Zero results (only index.ts should have process.exit)

**Step 6: Final commit**

```bash
git add -A
git commit -m "test: verify all state machines and bug fixes"
```
