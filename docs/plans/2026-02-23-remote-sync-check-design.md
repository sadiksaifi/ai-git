# Remote Sync Check Before Push — Design Document

**Date:** 2026-02-23

**Goal:** Before pushing, check if the remote branch has new commits and warn the user. In interactive mode, offer to pull & rebase. In non-interactive mode, fail with exit code 1.

## Problem

Currently, `ai-git` attempts `git push` without checking whether the remote branch has diverged. If the remote is ahead, the push fails with a cryptic git error. Users must manually diagnose and run `git pull --rebase`.

## Solution

Add a remote sync check to the XState push machine. Before attempting `git push`, fetch remote changes and compare commit counts. If the remote is ahead:

- **Interactive mode:** Warn the user and offer to automatically `git pull --rebase` before pushing.
- **Non-interactive mode:** Fail with exit code 1 and a clear error message.

## Scope

This feature also includes:

1. **XState migration of push flow** — Wire `push.machine.ts` directly in `cli.wired.ts` (like `stagingMachine`), removing the legacy `handlePush()` wrapper in `lib/push.ts`.
2. **Remote sync check** — New states in the push machine for fetch, compare, warn, and pull-rebase.
3. **Tests** — Update existing PU1-PU11 tests for new actor mocks, add PU12-PU18 for new scenarios. TDD approach.
4. **Documentation** — Update state machine docs.

## Architecture

### New Git Operations (`lib/git.ts`)

```typescript
export async function fetchRemote(): Promise<void>
export async function getRemoteAheadCount(): Promise<number>
export async function pullRebase(): Promise<void>
```

### New Actors (`actors/git.actors.ts`)

Factory-pattern actors following existing conventions:

- `createFetchRemoteActor` / `fetchRemoteActor`
- `createCheckRemoteAheadActor` / `checkRemoteAheadActor`
- `createPullRebaseActor` / `pullRebaseActor`

### Updated Push Machine State Flow

```
checkFlags
  ├── isPushFlagOrAutoApprove → fetchRemote
  ├── isInteractiveMode → promptPush
  └── else → done

promptPush → confirmed → fetchRemote
           → declined/cancelled → done

fetchRemote (spinner: "Looking for upstream changes...")
  ├── success → checkRemoteAhead
  └── error (no remote/upstream/network) → pushing [skip check]

checkRemoteAhead
  ├── not ahead → pushing
  ├── ahead + interactive → warnRemoteAhead
  └── ahead + non-interactive → done (exitCode: 1)

warnRemoteAhead ("Remote is N commit(s) ahead. Pull and rebase before pushing?")
  ├── confirmed → pullRebase
  ├── declined → done
  └── cancelled → done

pullRebase (spinner: "Pulling and rebasing...")
  ├── success → pushing
  └── error → done (with error)

pushing → [existing: pushFailedNoRemote, askAddRemote, etc.] → done
```

### New Scenario IDs

| ID | Scenario | Mode |
|----|----------|------|
| PU12 | Fetch succeeds, remote not ahead → push | Both |
| PU13 | Fetch succeeds, remote ahead, interactive → warn | Interactive |
| PU14 | User confirms rebase → success → push | Interactive |
| PU15 | User confirms rebase → fails | Interactive |
| PU16 | User declines rebase → skip | Interactive |
| PU17 | Fetch succeeds, remote ahead, non-interactive → exit 1 | Non-interactive |
| PU18 | Fetch fails (no remote/upstream/network) → skip check | Both |

### PushMachineOutput Change

```typescript
// Before:
export interface PushMachineOutput {
  pushed: boolean;
  exitCode: 0;
}

// After:
export interface PushMachineOutput {
  pushed: boolean;
  exitCode: 0 | 1;
}
```

## Copy

- Fetch spinner: "Looking for upstream changes..."
- Fetch done (no issues): "Remote is up to date"
- Warning: "Remote is N commit(s) ahead."
- Confirm prompt: "Pull and rebase before pushing?"
- Pull spinner: "Pulling and rebasing..."
- Pull success: "Rebased successfully"
- Non-interactive error: "Remote is N commit(s) ahead. Pull and rebase before pushing."

## What Gets Removed

- `lib/push.ts` — Legacy imperative push handler (replaced by XState machine)
- `import { handlePush }` in `cli.wired.ts` — Replaced by direct machine wiring

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Sequential states in push machine | Keeps push logic self-contained, testable, follows existing patterns |
| Fetch strategy | Always `git fetch` | Guarantees accurate remote state; spinner covers latency |
| Fetch errors | Non-fatal, skip check | No remote/no upstream/offline shouldn't block push attempt |
| Non-interactive + ahead | Exit code 1 | Scripts/CI should explicitly handle sync issues |
| Pull strategy | `git pull --rebase` | User-approved; single strategy keeps UX simple |
| Legacy handler | Remove entirely | XState machine is the single source of truth |
