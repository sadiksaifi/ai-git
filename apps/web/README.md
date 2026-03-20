# ai-git web

The product website for [ai-git](https://ai-git.xyz), built with Astro 5 and deployed to Cloudflare.

## Tech Stack

- **Framework:** Astro 5 (static output)
- **Styling:** Tailwind CSS v4
- **Deployment:** Cloudflare via Alchemy
- **Linting:** oxlint + oxfmt

## Development

```bash
# From monorepo root
bun run dev:web

# Or from this directory
bun run dev
```

## Scripts

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `bun run dev`       | Start dev server at localhost:4321 |
| `bun run build`     | Build static site to `./dist/`     |
| `bun run preview`   | Preview production build locally   |
| `bun run typecheck` | Type check Astro and TypeScript    |
| `bun run check`     | Run oxlint + oxfmt check           |
| `bun run check:fix` | Auto-fix lint and format issues    |

## Deployment

Deployment is managed through `packages/infra` using Alchemy:

```bash
# From monorepo root
bun run deploy    # Deploy to Cloudflare
bun run destroy   # Tear down infrastructure
```
