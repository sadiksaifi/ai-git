# AGENTS.md

This file defines project-specific rules and constraints for AI agents like you working in this repository.

## Project Overview

AI Git is a CLI tool that uses AI to generate Conventional Commits-compliant git commit messages. It analyzes staged diffs and produces semantically correct messages following the v1.0.0 specification.

## Commands

```bash
bun install             # Install dependencies
bun start               # Run CLI in development
bun run compile         # Compile to single binary (dist/ai-git)
bun run typecheck       # Type check without emitting
bun test                # Run tests
bun start --dry-run -a  # Test prompt generation without AI call
```

## Architecture

### Core Flow
```
CLI Entry (src/index.ts)
    → Parse args (cac) → Load config → Validate provider
    → Stage files → Generation loop → Commit → Push
```

### Key Components

- **`src/index.ts`** - CLI entry point with argument parsing and main workflow orchestration
- **`src/config.ts`** - Two-tier config system: project (`.ai-git.json`) > global (`~/.config/ai-git/config.json`)
- **`src/prompt.ts`** - System prompt definitions for Conventional Commits schema
- **`src/types.ts`** - Core TypeScript interfaces (`Mode`, `Provider`, `Model` definitions)

### Provider System (`src/providers/`)
Two modes with unified adapter interface:
- **CLI Mode** (`cli/`): Spawns installed binaries (`claude`, `gemini`)
- **API Mode** (`api/`): HTTP APIs via Vercel AI SDK (OpenRouter, OpenAI, Anthropic, Gemini)

Provider registry in `registry.ts` defines available providers and models.

### Generation Loop (`src/lib/generation.ts`)
Self-correcting generator-discriminator pattern:
1. Capture staged diff
2. Generate message via AI adapter
3. Validate against Conventional Commits
4. If invalid, inject errors into next prompt (auto-retry up to 3x)
5. Present valid message to user

### Git Operations (`src/lib/git.ts`)
Wrapper using Bun Shell (`$`). Lock files are excluded from diffs. Diffs truncated at 2500 lines.

### Secrets (`src/lib/secrets/`)
API keys stored in macOS Keychain (API mode is macOS-only).

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
for (const file of files) { await $`git add ${file}`; }
```

### UI/UX
- Use `@clack/prompts` for interactive prompts
- Use `picocolors` for terminal colors
- Keep CLI output concise

## Testing

Tests use Bun's native test runner (`bun:test`). Located in `tests/`.

### Fake AI Pattern
For deterministic AI testing without API calls:
- `tests/fake-ai.ts` - Mock script that varies behavior based on counter file
- Writes received prompts to `ai-prompt.log` for assertions
- Test CLI via subprocess spawning, verifying stdout/stderr/exit codes

## Adding New Providers

1. Add entry to `PROVIDERS` array in `src/providers/registry.ts`
2. Create adapter in `src/providers/cli/` or `src/providers/api/`
3. Register in the respective `index.ts`
4. Update `schema.json` for config validation

## Config Priority

CLI flags > Project config (`.ai-git.json`) > Global config (`~/.config/ai-git/config.json`) > Built-in defaults
