# @ai-git/meta

Shared CLI metadata package. Contains all documentation-level data for the
ai-git CLI: flag definitions, command definitions, provider display metadata,
error message templates, and utility functions.

## What belongs here

- **Types** — `FlagDef`, `CommandDef`, `ProviderDoc`, `ErrorTemplate`, etc.
- **Metadata** — `CLI_NAME`, `CLI_DESCRIPTION`
- **Flag definitions** — `FLAGS` record with all CLI flags, `FLAG_CATEGORIES` for grouping
- **Command definitions** — `COMMANDS` record (`configure`, `upgrade`)
- **Provider docs** — Display-only metadata (name, type, URLs, install commands)
- **Error templates** — Reusable error messages with actionable suggestions
- **Utilities** — `getRandomTip()`, `getFlagsByCategory()`

## What does NOT belong here

- Runtime logic (provider adapters, model lists, config resolution)
- Rendering / formatting (that lives in `apps/cli`)
- State machines or actors
- Anything that imports from `apps/cli`

## Adding a new flag

1. Add a `FlagDef` entry to `FLAGS` in `src/flags.ts`
2. Assign a `FlagCategory` (`"model"`, `"workflow"`, or `"info"`)
3. If it has a custom shorthand, use uppercase (e.g. `-X`)
4. Register the flag in `apps/cli/src/index.ts` via cac `.option()`
5. Add to `CLIOptions` in `apps/cli/src/machines/cli.machine.ts` if needed

## Adding a new command

1. Add a `CommandDef` entry to `COMMANDS` in `src/commands.ts`
2. Register the command in `apps/cli/src/index.ts` via cac `.command()`

## Adding a new provider

1. Add a `ProviderDoc` (or `CLIProviderDoc` for CLI providers) to `PROVIDERS` in `src/providers.ts`
2. The runtime provider registration stays in `apps/cli/src/providers/registry.ts`

## Conventions

- `private: true` — not published to npm
- Extends `@ai-git/config/tsconfig.base.json`
- Uses `catalog:` for shared dev dependencies
- Uses `.ts` extensions in imports (`allowImportingTsExtensions`)
- Formatted with oxfmt, linted with oxlint
