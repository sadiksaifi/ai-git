# Project Overview

AI Git is a CLI tool that uses AI to generate Conventional Commits-compliant
git commit messages. Monorepo managed with Turborepo and Bun.

## Monorepo Structure

| Workspace | Description |
|-----------|-------------|
| `apps/cli` | Main CLI application (XState v5, Bun, TypeScript) |
| `packages/config` | Shared TypeScript configuration (`tsconfig.base.json`) |
| `packages/content` | Shared content with dual exports: `@ai-git/content/cli` for CLI, `@ai-git/content/web` for website (`@ai-git/content`) |
| `packages/npm/ai-git` | Main npm distribution package with postinstall |
| `packages/npm/darwin-*`, `linux-*`, `win32-*` | Platform-specific binary packages |

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Run all dev servers
bun run dev:cli      # Run CLI in development
bun run build        # Build all packages
bun run build:cli    # Build CLI binary (dist/ai-git)
bun run typecheck    # Type check all packages
bun run check        # Lint & format check all packages
bun run check:fix    # Auto-fix lint & format issues
bun run test         # Run all tests
bun run sync:catalog # Refresh API model snapshot from models.dev
bun run sync:schema  # Refresh API model examples in schema.json
bun run sync:models  # Run both syncs
```

## Tech Stack

- **Runtime:** Bun
- **Orchestration:** Turborepo
- **Language:** TypeScript (strict)
- **State Management:** XState v5
- **Linting:** oxlint + oxfmt (per-package configs)
- **Testing:** Bun test runner
- **CI/CD:** GitHub Actions
