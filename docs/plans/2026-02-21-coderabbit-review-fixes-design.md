# CodeRabbit PR #58 Review Fixes — Design

## Context

CodeRabbit reviewed PR #58 (XState v5 state machine refactor) and posted 17 actionable inline comments + 25 nitpick comments. This design covers fixing all valid items, pushing back on incorrect/impractical suggestions, and replying to every comment via GitHub API.

## Approach

Single branch, multiple commits grouped by concern. One push at the end. Then batch-reply to all CodeRabbit comments with commit hashes.

## What to Fix

### Tier 1 — Critical/Major Functional Fixes

1. **staging.machine.ts** — Add `onError` handlers to ALL invoke states (checkStaged, checkUnstaged, autoStageMore, stageAllMore, autoStageAll, stageAll, stageSelectedMore, stageSelected, all refreshStaged* states). Extract shared sub-flows to reduce duplication between hasStaged/noneStaged.
2. **generation.machine.ts** — Fix `retryOrEdit` routing with context flag. Handle `gatherContext` error (abort if diff missing). Append errors instead of replacing. Add branch name error logging. Improve `cleanAIResponse` regex.
3. **index.ts:113** — Add `await` to `cli.runMatchedCommand()`
4. **cli.wired.ts** — Fix empty object casts, propagate actual push result, replace `any` types

### Tier 2 — Type Safety (all @ts-nocheck removal)

5. Remove `@ts-nocheck` from ALL files (production + test), replace with targeted `@ts-expect-error`
   - generation.machine.ts, init.machine.ts (production)
   - push.machine.test.ts, init.machine.test.ts, staging.machine.test.ts, generation.machine.test.ts, cli.machine.test.ts, upgrade.machine.test.ts (test)
6. Replace `any` casts in cli.wired.ts with proper types

### Tier 3 — Minor Code Improvements

7. **errors.ts** — Add `name` override to `CLIError`
8. **push.machine.ts** — Validate remote URL, use named guard, fix inline guard
9. **index.ts** — Add timeout to production `waitFor` calls
10. **git.actors.ts** — Use imported `$` instead of `Bun.$`
11. **push.ts** — Extract stderr helper to reduce duplication
12. **setup-wizard.machine.ts** — Log unexpected errors in `onError`
13. **init.machine.ts** — Fix cancel exit code consistency, add defensive guard for globalConfig, log config load errors
14. **cli.machine.ts** — Add guard for non-null adapter before generation state
15. **generation.machine.test.ts** — Deep-merge `mockInput` options
16. **init.machine.test.ts** — Assert `confirmCount`

### Tier 4 — Documentation

17. **states.mmd** — Fix scenario count (168), add machine file references
18. **design.md** — Add `text` language identifier
19. **plan.md** — Fix `getRecentCommits` type, add `mermaid` specifiers

### Tier 5 — Test Coverage

20. **git.actors.test.ts** — Add tests for 4 untested factory functions
21. **upgrade.machine.test.ts** — Add meaningful assertions to UP1-UP3

### Push Back (with reasoning)

- **cli.machine.ts fromPromise composability** — Intentional for CLI tool; XState invoke/spawn is overkill here
- **push.machine.ts locale-dependent strings** — Known git limitation, not fixable without over-engineering
- **clack.actors.ts type vs interface** — No practical benefit for non-extended input types
- **upgrade.machine.ts process.exit()** — Open tracking issue; refactoring upgrade.ts is too large for this PR

## Workflow

1. Make all fixes locally across multiple commits
2. Run `bun test` + `bun run typecheck` after each tier
3. Single `git push` at the end
4. Batch-reply to all 42 CodeRabbit comments via `gh api`:
   - Fixed: "Fixed in `<hash>`. [what was done]"
   - Push-back: "@coderabbitai [technical reasoning]"
   - Deferred: "Tracked in #XX"
