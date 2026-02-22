# AGENTS.md

This file defines project-specific rules and constraints for AI agents like you working in this repository.

## Project Overview

AI Git is a CLI tool that uses AI to generate Conventional Commits-compliant git commit messages. It analyzes staged diffs and produces semantically correct messages following the v1.0.0 specification.

## Commands

```bash
bun install             # Install dependencies
bun run dev             # Run CLI in development
bun run build           # Build single binary (dist/ai-git)
bun run typecheck       # Type check without emitting
bun test                # Run tests
bun run dev --dry-run -a  # Test prompt generation without AI call
bun run sync:catalog       # Refresh API model snapshot from models.dev
bun run sync:schema        # Refresh API model examples in root schema.json from models.dev
bun run sync:models        # Run both model snapshot + schema sync
```

## Architecture

**Tech Stack:** Bun runtime, XState v5 (state machines), TypeScript strict, @clack/prompts, cac (CLI parsing)

### Core Flow

```text
CLI Entry (src/index.ts)
    → Parse args (cac) → cliMachine (XState)
        → Load config → Validate provider → Check git
        → stagingMachine → generationMachine → pushMachine
        → Exit with code
```

All workflow orchestration is handled by composable XState v5 state machines. `index.ts` (~120 lines) only parses CLI args and delegates to the machines.

### State Machines (`src/machines/`)

7 composable XState machines orchestrated by a top-level CLI machine:

- **`cli.machine.ts`** - Top-level orchestrator (config, provider validation, child machine invocation)
- **`init.machine.ts`** - Project initialization (`configure` command, IN1-IN10 scenarios)
- **`setup-wizard.machine.ts`** - Provider/model setup wizard (wraps `lib/onboarding/wizard.ts`)
- **`staging.machine.ts`** - File staging decisions (ST1-ST14 scenarios)
- **`generation.machine.ts`** - 7-state AI generation loop (GN1-GN29 scenarios)
- **`push.machine.ts`** - Push decisions and remote recovery (PU1-PU11 scenarios)
- **`upgrade.machine.ts`** - Self-update and package manager delegation (UP1-UP11 scenarios)

**Production wiring:**

- **`cli.wired.ts`** - Provides real actor implementations to `cli.machine` via `.provide()`

### Actor Layer (`src/machines/actors/`)

Reusable `fromPromise()` actors with factory pattern for test dependency injection:

- **`clack.actors.ts`** - @clack/prompts wrappers (select, confirm, text, multiselect) with cancel → `UserCancelledError`
- **`git.actors.ts`** - Git operations (stage, commit, push, branch, diff, etc.)
- **`ai.actors.ts`** - AI invocation with spinner and slow warning timer
- **`display.actors.ts`** - Display formatting (staged result, file summary) with @clack/prompts

### Key Components

- **`src/index.ts`** - CLI entry point: parses args with cac, delegates to XState machines
- **`src/config.ts`** - Two-tier config system: project (`.ai-git.json`) > global (`~/.config/ai-git/config.json`)
- **`src/prompt.ts`** - System prompt definitions for Conventional Commits schema
- **`src/types.ts`** - Core TypeScript interfaces (`Mode`, `Provider`, `Model` definitions)
- **`src/lib/errors.ts`** - Shared error types (`UserCancelledError`, `CLIError`, `extractErrorMessage()`)

### Provider System (`src/providers/`)

Two modes with unified adapter interface:

- **CLI Mode** (`cli/`): Spawns installed binaries (`claude`, `gemini`, `codex`)
- **API Mode** (`api/`): HTTP APIs via Vercel AI SDK (OpenRouter, OpenAI, Anthropic, Google AI Studio)

Provider registry in `registry.ts` defines available providers and models.

### API Model Catalog (`src/providers/api/models/`)

API model filtering/ranking/defaults/deprecation checks are centralized here:

- Source of truth: runtime fetch from `https://models.dev/api.json`
- Cache: `~/.cache/ai-git/models-dev-catalog.json`
- Fallback: bundled snapshot in `src/providers/api/models/snapshot.ts`
- Behavior: deterministic tiered ranking + provider ordering for OpenRouter
- Safety: deprecated configured API models are hard-failed with setup guidance

### Generation Loop (`src/machines/generation.machine.ts`)

Self-correcting generator-discriminator pattern implemented as an XState state machine:

1. Gather context (diff, commits, file list) via `gatherContextActor`
2. Invoke AI via `invokeAIActor` (with spinner + slow warning)
3. Clean response (strip Markdown code blocks)
4. Validate against Conventional Commits (`src/lib/validation.ts`)
5. Auto-retry up to 3x on critical validation errors
6. Present interactive menu (Commit / Retry / Edit / Quit)

Utility functions (prompt building, validation, commit display) remain in `src/lib/generation.ts` and `src/lib/validation.ts`.

### Git Operations (`src/lib/git.ts`)

Wrapper using Bun Shell (`$`). Lock files are excluded from diffs. Diffs truncated at 2500 lines.

### Secrets (`src/lib/secrets/`)

API keys stored via `Bun.secrets` (native keychain on macOS/Linux/Windows), with AES-256-GCM encrypted file fallback for headless environments.

## Coding Conventions

### Bun-Specific

- Use `$` shell template for subprocesses: `` await $`git add ${file}` ``
- Use `Bun.spawn()` for provider invocations
- Use `Bun.file()` and `Bun.write()` for filesystem operations
- ESM imports with `import type` for TypeScript types
- Prefer `node:` prefix for built-ins (e.g., `import * as path from "node:path"`)

### Shell Safety

```typescript
// Safe array expansion (Bun handles it)
await $`git add ${files}`;

// Also safe - iterate for complex cases
for (const file of files) {
  await $`git add ${file}`;
}
```

### UI/UX

- Use `@clack/prompts` for interactive prompts
- Use `picocolors` for terminal colors
- Keep CLI output concise

## Testing

Tests use Bun's native test runner (`bun:test`). Tests are colocated in `src/**/*.test.ts`.

Current coverage includes:

- **State machine tests** in `src/machines/*.test.ts` — each machine tested via `.provide()` with mock actors for full dependency injection. Covers all scenario IDs from `docs/cli/states.mmd`.
- **Actor tests** in `src/machines/actors/*.test.ts` — factory pattern tests with mock resolvers
- CLI behavior and runtime validation in `src/index.test.ts`
- Utility and update-cache tests in `src/lib/*.test.ts`
- API model catalog/ranking/provider adapter tests in `src/providers/api/**/*.test.ts`

### Testing XState Machines

Machines are tested by injecting mock actors via `.provide()`:

```typescript
const machine = pushMachine.provide({
  actors: {
    pushActor: fromPromise(async () => {}),
    confirmActor: fromPromise(async () => true),
  },
});
const actor = createActor(machine, { input: { ... } });
actor.start();
const snap = await waitFor(actor, (s) => s.status === "done");
expect(snap.output.pushed).toBe(true);
```

## Adding New Providers

1. Add entry to `PROVIDERS` array in `src/providers/registry.ts`
2. Create adapter in `src/providers/cli/` or `src/providers/api/`
3. Register in the respective `index.ts`
4. If API provider behavior/ranking is affected, update `src/providers/api/models/provider-rules.ts`
5. Refresh and commit snapshot data with `bun run sync:catalog` when needed
6. Update `schema.json` for config validation

## Config Migrations

Config migrations live in `src/lib/migration.ts` as a declarative registry.
Each migration is a self-contained `ConfigMigration` object in the `migrations` array.

To add a new migration:

1. Append a `ConfigMigration` object to the `migrations` array in `src/lib/migration.ts`
2. Add tests in `src/lib/migration.test.ts`

Migrations must be idempotent (return `null` if they don't apply).
Backup + user notification is handled automatically by the migration engine in `config.ts`.

## Config Priority

CLI flags > Project config (`.ai-git.json`) > Global config (`~/.config/ai-git/config.json`) > Built-in defaults

## State Machine Reference

- **`docs/cli/states.mmd`** — Authoritative Mermaid state diagram (168 scenarios across all sub-flows)
- **`docs/cli/state-machine-improvements.md`** — Documents 5 bugs found and fixed during the XState refactor
- **`docs/plans/2026-02-21-xstate-refactor-design.md`** — Architecture decisions for the XState v5 migration

Scenario ID prefixes: E (Entry), C (Flag Combos), CF (Config), SW (Setup Wizard), IN (Init), PM (Provider/Model), AA (Auto-Approve), ST (Staging), GN (Generation), PU (Push), UP (Upgrade), XC (Cross-Cutting)
