# CLI Options Refactor Design

Date: 2026-02-22

## Problem

AI Git's CLI interface has three problems:

1. **Misclassified options.** `--setup` and `--init` are flags but launch separate workflows.
2. **No shared documentation data.** Flag definitions, provider metadata, and descriptions are embedded in the CLI app.
3. **Stale documentation.** Help menu hides commands, uses a flat flag list, and shows incorrect usage.

## Decisions

### Package: `@ai-git/meta`

New workspace at `packages/meta/` — single source of truth for all CLI documentation data.

**Exports:**
- `CLI_NAME` (`"ai-git"`) and `CLI_DESCRIPTION` (`"AI-powered Conventional Commits"`)
- `COMMANDS: Record<string, CommandDef>` — `configure`, `upgrade`
- `FLAGS: Record<string, FlagDef>` — all flag definitions with category assignment
- `FLAG_CATEGORIES: FlagCategoryDef[]` — ordered category definitions (Model, Workflow, Info)
- `PROVIDERS: Record<string, ProviderDoc>` — provider display metadata (name, type, requirements URL, install info for CLI providers)
- `ERROR_TEMPLATES` — error message factories returning plain strings
- `getRandomTip()` — random flag tip for welcome screen
- `getFlagsByCategory()` — flags grouped by category

**Does NOT contain:** runtime logic, rendering/formatting, provider adapters, model lists, state machines.

**Follows conventions:** `@ai-git/` scope, `private: true`, extends `@ai-git/config/tsconfig.base.json`, uses `catalog:` for shared deps, has `.oxlintrc.json` and `.oxfmtrc.json`.

### Package structure

```
packages/meta/
├── package.json
├── tsconfig.json
├── .oxlintrc.json
├── .oxfmtrc.json
└── src/
    ├── index.ts           # Re-exports all public API
    ├── types.ts           # FlagDef, CommandDef, ProviderDoc, etc.
    ├── meta.ts            # CLI_NAME, CLI_DESCRIPTION
    ├── commands.ts        # COMMANDS record
    ├── flags.ts           # FLAGS record + FLAG_CATEGORIES
    ├── providers.ts       # PROVIDERS record (display metadata only)
    ├── errors.ts          # ERROR_TEMPLATES
    └── utils.ts           # getRandomTip(), getFlagsByCategory()
```

### Flag shorthands

All custom flag shorthands use uppercase. Framework flags (`-v`, `-h`) keep universal lowercase.

| Flag | Shorthand | Rationale |
|------|-----------|-----------|
| `--provider` | _(none)_ | Set via config, rarely per-run |
| `--model` | _(none)_ | Set via config, rarely per-run |
| `--stage-all` | `-A` | **A**ll |
| `--commit` | `-C` | **C**ommit |
| `--push` | `-P` | **P**ush (ecosystem standard) |
| `--hint` | `-H` | **H**int |
| `--exclude` | `-X` | e**X**clude |
| `--dangerously-auto-approve` | _(none)_ | Intentionally long |
| `--dry-run` | _(none)_ | Long form preferred |
| `--version` | `-v` | Universal standard |
| `--help` | `-h` | Universal standard |

### Flag categories

| Category Key | Display Label | Order | Flags |
|-------------|---------------|-------|-------|
| `model` | Model | 1 | `--provider`, `--model` |
| `workflow` | Workflow | 2 | `--stage-all`, `--commit`, `--push`, `--hint`, `--exclude`, `--dangerously-auto-approve`, `--dry-run` |
| `info` | Info | 3 | `--version`, `--help` |

### Rewritten descriptions

**Flags:**

| Flag | Description |
|------|-------------|
| `--provider <id>` | Use a specific AI provider for this run |
| `--model <id>` | Use a specific model for this run |
| `--stage-all` | Stage all changes before generating |
| `--commit` | Commit without confirmation |
| `--push` | Push to remote after committing |
| `--hint <text>` | Guide the AI with additional context |
| `--exclude <pattern>` | Skip files when staging (glob, regex, or path) |
| `--dangerously-auto-approve` | Stage, commit, and push without prompts |
| `--dry-run` | Preview the prompt without calling the AI |
| `--version` | Show version |
| `--help` | Show help |

**Commands:**

| Command | Description |
|---------|-------------|
| `configure` | Set up AI provider and model |
| `upgrade` | Update ai-git to the latest version |

### Help output

```
Usage:
  $ ai-git [command] [options]

AI-powered Conventional Commits

Commands:
  configure                    Set up AI provider and model
  upgrade                      Update ai-git to the latest version

Model:
  --provider <id>              Use a specific AI provider for this run
  --model <id>                 Use a specific model for this run

Workflow:
  -A, --stage-all              Stage all changes before generating
  -C, --commit                 Commit without confirmation
  -P, --push                   Push to remote after committing
  -H, --hint <text>            Guide the AI with additional context
  -X, --exclude <pattern>      Skip files when staging (glob, regex, or path)
  --dangerously-auto-approve   Stage, commit, and push without prompts
  --dry-run                    Preview the prompt without calling the AI

Info:
  -v, --version                Show version
  -h, --help                   Show help
```

### `configure` command

**Standalone flow** (like `upgrade`), not routed through `cliMachine`.

```
ai-git configure
  │
  ├─ @clack/prompts select: "Where do you want to configure?"
  │   ├─ "Global (~/.config/ai-git/config.json)"
  │   │   └─ runOnboarding({ target: "global" })
  │   └─ "Project (.ai-git.json in current repo)"
  │       └─ initMachine (existing project init flow)
  └─ Ctrl+C → exit
```

Both the `ai-git configure` command and the first-run auto-trigger share the same `configureActor`.

**First-run:** When `ai-git` runs with no config, the CLI machine's `needsSetup` path invokes the same configure flow. A brief intro message (`"No configuration found."`) precedes the Global/Project prompt.

### CLI machine changes

- **Remove:** `init` state, `isInitFlag` guard, `setup`/`init` from `CLIOptions`
- **Modify:** `runOnboarding` state → uses new `configureActor` (Global/Project prompt)
- **Keep:** `needsSetup` guard (checks `configResult?.needsSetup` only)

### Data migration from CLI to `@ai-git/meta`

| Current location | Data | New location |
|-----------------|------|-------------|
| `apps/cli/src/lib/flags.ts` | `FLAGS`, `getRandomTip()` | `@ai-git/meta` (rewritten) |
| `apps/cli/src/lib/onboarding/constants.ts` | `ERROR_MESSAGES`, `INSTALL_INFO` | `@ai-git/meta` errors + providers |
| `apps/cli/src/providers/registry.ts` | Provider display names, types | `@ai-git/meta` providers (display only) |
| Hardcoded in `index.ts` | CLI description, usage pattern | `@ai-git/meta` meta |
| Hardcoded in various files | 17+ `--setup`/`--init` references | `@ai-git/meta` error templates |

### Error message updates

All references to `ai-git --setup` and `ai-git --init` become `ai-git configure`.

Files affected:
- `apps/cli/src/lib/onboarding/constants.ts` (templates move to `@ai-git/meta`)
- `apps/cli/src/lib/onboarding/index.ts`
- `apps/cli/src/lib/generation.ts`
- `apps/cli/src/config.ts`
- `apps/cli/src/machines/cli.wired.ts`
- `apps/cli/src/providers/api/models/validation.ts`
- `apps/cli/src/providers/api/utils.ts`

### README updates

- Replace CLI reference block with new help output
- Replace `ai-git --setup` / `ai-git --init` with `ai-git configure`
- Fix model examples to match new descriptions
- Update provider table footer

### Custom help renderer

New file: `apps/cli/src/lib/help.ts`
- Reads data from `@ai-git/meta`
- Renders grouped output with picocolors
- Replaces cac's built-in help in `index.ts`

### Root CLAUDE.md update

Add `@ai-git/meta` to the monorepo structure table:

| Workspace | Description |
|-----------|-------------|
| `packages/meta` | Shared CLI metadata, flag/command definitions, provider docs (`@ai-git/meta`) |
