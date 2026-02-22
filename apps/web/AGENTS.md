# ai-git Web

Product website for ai-git. Built with **Astro 5** and **Tailwind CSS v4**, deployed to Cloudflare via Alchemy.

## Static-First Principle

This is a product/landing site. Minimize client-side JavaScript:

- **Default:** Zero-JS Astro components (no `client:*` directives)
- **Styling:** Tailwind CSS v4 utilities and CSS animations only
- **Interactivity:** Use CSS (`:hover`, `:focus`, `@keyframes`, `transition`) before JS
- **When JS is needed:** Prefer `client:visible` or `client:idle`. Only use `client:load` when absolutely necessary and explicitly specified by the user.
- **Goal:** Ship HTML + CSS. Add JS only when genuinely required.

## Tech Stack

| Technology   | Version | Purpose                                     |
| ------------ | ------- | ------------------------------------------- |
| Astro        | 5.x     | Static site framework                       |
| Tailwind CSS | 4.x     | Utility-first CSS (via `@tailwindcss/vite`) |
| TypeScript   | 5.x     | Type safety                                 |
| Alchemy      | 0.82.x  | Cloudflare deployment (IaC)                 |
| oxlint       | latest  | Linting                                     |
| oxfmt        | latest  | Formatting                                  |

## Project Structure

```
apps/web/
├── public/              # Static assets (favicons, images)
├── src/
│   ├── assets/          # Processed assets (imported in components)
│   ├── components/      # Reusable Astro components
│   ├── layouts/         # Page layouts (Layout.astro)
│   ├── pages/           # File-based routing (each .astro = a route)
│   └── styles/          # Global CSS (global.css with Tailwind)
├── astro.config.mjs     # Astro + Tailwind + Alchemy config
├── tsconfig.json        # Extends astro/tsconfigs/strict
├── .oxlintrc.json       # Linter config
└── .oxfmtrc.json        # Formatter config
```

## Astro Conventions

- **Pages:** `src/pages/` directory. Each `.astro` file = a route. `index.astro` = `/`
- **Layouts:** `src/layouts/` for shared page structure. Use `<slot />` for content injection.
- **Components:** `src/components/` for reusable pieces. All components are server-rendered by default (zero JS).
- **Styles:** `src/styles/global.css` is the Tailwind entry point, already imported in Layout.astro. Use Tailwind CSS utilities heavily for all styling. Only use scoped `<style>` blocks when something genuinely can't be achieved with Tailwind CSS.
- **Assets:** `src/assets/` for images/SVGs that need processing. `public/` for static files served as-is.

## Tailwind CSS v4

- Configured via `@tailwindcss/vite` plugin in `astro.config.mjs`
- Entry point: `src/styles/global.css` with `@import "tailwindcss"`
- Theme customization: `@theme {}` block in global.css
- No separate `tailwind.config.js` needed (v4 uses CSS-based config)

## Commands

```bash
bun run dev          # Dev server at localhost:4321
bun run build        # Build static site to dist/
bun run preview      # Preview production build
bun run typecheck    # Type check (astro check + tsc)
bun run check        # Lint + format check
bun run check:fix    # Auto-fix lint + format
```

## Deployment

Managed by `packages/infra` via Alchemy. From monorepo root:

```bash
bun run deploy       # Deploy to Cloudflare
bun run destroy      # Tear down infrastructure
```

## Testing

No test framework configured yet. When adding tests:

- Prefer Bun test runner (consistent with monorepo)
- Test utilities and logic, not Astro rendering
- Colocate test files (`*.test.ts`)
