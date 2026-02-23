import type { HowItWorksStep } from "./types.ts";

// ==============================================================================
// @ai-git/content/web — How It Works
// ==============================================================================

export const howItWorks = {
  headline: "Three Commands. Zero Friction.",
  steps: [
    {
      step: 1,
      title: "Install",
      command: "npm install -g @ai-git/cli",
      description: "One command. Works with npm, bun, pnpm, yarn, or Homebrew.",
    },
    {
      step: 2,
      title: "Configure",
      command: "ai-git configure",
      description: "Pick your AI provider. Set your model. Keys go straight to your keychain.",
    },
    {
      step: 3,
      title: "Commit",
      command: "ai-git",
      description: "Stage changes, generate a message, review it, commit. That's it.",
    },
  ] as readonly HowItWorksStep[],
} as const;
