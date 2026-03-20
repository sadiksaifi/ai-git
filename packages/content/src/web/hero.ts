import type { HeroContent } from "./types.ts";

// ==============================================================================
// @ai-git/content/web — Hero Section
// ==============================================================================

export const hero: HeroContent = {
  headline: "Commit messages. Solved.",
  subheadline:
    "AI analyzes your staged changes and writes Conventional Commits — so you never have to.",
  primaryCTA: { label: "Install Now", command: "npm install -g @ai-git/cli" },
  secondaryCTA: {
    label: "View on GitHub",
    href: "https://github.com/sadiksaifi/ai-git",
  },
} as const;
