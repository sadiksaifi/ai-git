# CodeRabbit PR #58 Round 2 Review Fixes — Design

## Problem

CodeRabbit posted a second review round on PR #58 with 10 new comments. None have been addressed or replied to yet. Round 1 (17 inline + 25 nitpicks) was fully handled in prior commits.

## Scope

Fix 8 valid items, push back on 2 incorrect/premature suggestions, reply to all 10 via `gh api`.

## Decisions

### Fix (8 items)

1. **R2-2: Hardcoded provider union missing `cerebras`** (`cli.wired.ts:80`)
   - Replace `"openrouter" | "openai" | "anthropic" | "google-ai-studio"` cast with `SupportedAPIProviderId` from `src/providers/api/models/types.ts`.

2. **R2-3: `GenerationInput` missing `promptCustomization` and `editor`** (`generation.machine.ts:35`)
   - Add `promptCustomization?: PromptCustomization` and `editor?: string` to `GenerationInput` and `GenerationContext`.

3. **R2-6: Missing `waitFor` timeouts in `push.machine.test.ts`**
   - Add `{ timeout: 5000 }` to all `waitFor` calls.

4. **R2-1: AGENTS.md lists 8 items under "7 machines"** (`AGENTS.md:49`)
   - Separate `cli.wired.ts` from the machine list into its own bullet.

5. **R2-7: Heading level skip in `coderabbit-review-fixes.md:32`**
   - Add `## Tasks` heading before first `### Task`.

6. **R2-8: Missing code block language in `coderabbit-review-fixes.md:1137`**
   - Add `text` language identifier.

7. **R2-9: Table column mismatch in `coderabbit-review-fixes.md:1220`**
   - Fix table row to match 4-column header.

8. **R2-10: Stale `utils.ts` reference in `xstate-refactor-plan.md:224`**
   - Change import from `"./utils.ts"` to `"../lib/errors.ts"`.

### Push Back (2 items)

9. **R2-4: Empty `InitInput`** (`init.machine.ts:17`)
   - Intentionally empty. CLI `--provider`/`--model` flags are handled by `cliMachine`, not `initMachine`. The init wizard runs its own interactive flow via `setupWizardMachine`. Pre-seeding would couple these machines unnecessarily and violate the single-responsibility principle of the machine architecture.

10. **R2-5: Unknown `initChoice` → `exitErr`** (`init.machine.ts:246`)
    - Correct behavior. This is a defensive guard for an impossible state — the select actor only returns known values (`"copy"`, `"wizard"`, `"skip"`). An unknown value indicates a programming error, which should exit with error code 1, not silently succeed with code 0.

## GitHub Reply Strategy

After pushing all fixes in a single push:
- For each fixed item: reply to the CodeRabbit comment with the commit hash and brief explanation of what was done.
- For each rejected item: reply explaining the architectural reasoning with enough detail that CodeRabbit can learn the project convention.
- Use `gh api repos/sadiksaifi/ai-git/pulls/comments/{id}/replies` for inline comments.

## Commit Strategy

- One commit for code fixes (R2-2, R2-3, R2-6)
- One commit for doc fixes (R2-1, R2-7, R2-8, R2-9, R2-10)
- Single push, then reply to all 10 comments
