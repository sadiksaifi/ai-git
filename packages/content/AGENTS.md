# @ai-git/content

Shared content package with dual exports for the CLI and website.

## Architecture

Two explicit export paths enforced by `package.json` exports:

- `@ai-git/content/cli` — consumed by `apps/cli`
- `@ai-git/content/web` — consumed by `apps/web`

Shared content in `src/shared/` is re-exported by both paths.

## Directory Layout

- `src/shared/` — Single source of truth (providers, features, install methods, examples, metadata, shared types)
- `src/cli/` — CLI-specific (flags, commands, error templates, utilities, CLI types)
- `src/web/` — Web marketing content (hero, features showcase, FAQ, SEO, navigation, docs structure)

## What belongs where

### `src/shared/` — Content used by both CLI and web

- Identity: `CLI_NAME`, `CLI_DESCRIPTION`
- Provider metadata: names, types, URLs
- Feature definitions: label + short description
- Installation methods: commands, platforms
- Usage and configuration examples
- Shared types (`ProviderDoc`, `Feature`, `InstallMethod`, etc.)

### `src/cli/` — CLI-only content

- Flag definitions (`FLAGS`, `FLAG_CATEGORIES`)
- Command definitions (`COMMANDS`)
- Error message templates (`ERROR_TEMPLATES`)
- CLI utilities (`getRandomTip`, `getFlagsByCategory`)
- CLI-specific types (`FlagDef`, `CommandDef`, `ErrorTemplate`)

### `src/web/` — Web-only marketing content

- Hero section (headlines, subheadlines, CTAs)
- Feature showcase (marketing copy extending shared features)
- Provider showcase (categorization for display)
- How-it-works steps
- Testimonials and metrics
- FAQ entries
- Documentation page structure
- Navigation (header, footer, social links)
- SEO metadata (OG tags, Twitter cards, icons, manifest)

## Adding new shared content

1. Add a type to `src/shared/types.ts`
2. Create or update the relevant file in `src/shared/`
3. Re-export from both `src/cli/index.ts` and `src/web/index.ts`

## Adding CLI-only content

1. Add to the relevant file in `src/cli/`
2. Export from `src/cli/index.ts`

## Adding web-only content

1. Add to the relevant file in `src/web/`
2. Export from `src/web/index.ts`

## Conventions

- `private: true` — not published to npm
- Extends `@ai-git/config/tsconfig.base.json`
- Uses `catalog:` for shared dev dependencies
- Uses `.ts` extensions in imports (`allowImportingTsExtensions`)
- Formatted with oxfmt, linted with oxlint
