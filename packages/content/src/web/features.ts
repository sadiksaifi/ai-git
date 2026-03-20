import type { FeatureShowcaseItem } from "./types.ts";

// ==============================================================================
// @ai-git/content/web — Feature Showcase
// ==============================================================================

export const featureShowcase: readonly FeatureShowcaseItem[] = [
  {
    featureId: "ai-powered",
    headline: "Understands Your Code, Not Just Your Diff",
    detail:
      "AI Git reads your changes in context — it knows the difference between a refactor and a bug fix. Every commit message captures the why, not just the what.",
  },
  {
    featureId: "conventional-commits",
    headline: "Perfect Conventional Commits. Every Time.",
    detail:
      "Strict v1.0.0 compliance with automatic validation and self-correcting retries. No more debating commit formats in PR reviews.",
  },
  {
    featureId: "interactive-tui",
    headline: "A Terminal Experience You'll Actually Enjoy",
    detail:
      "Stage files, review messages, edit inline, commit — all from a gorgeous interactive interface. No flags to memorize for your daily workflow.",
  },
  {
    featureId: "zero-config",
    headline: "Zero to Committing in 30 Seconds",
    detail:
      "Install, run, pick your AI provider. The setup wizard handles everything. No config files to write, no environment variables to set.",
  },
  {
    featureId: "multi-provider",
    headline: "Your AI. Your Choice.",
    detail:
      "Claude Code, Gemini CLI, Codex, OpenRouter, OpenAI, Anthropic, Google AI Studio, Cerebras. Switch providers with a single command.",
  },
  {
    featureId: "secure",
    headline: "Your Keys Stay in Your Keychain",
    detail:
      "API keys are stored in your OS keychain — never written to config files, never exposed in your dotfiles, never leaked in a git push.",
  },
] as const;
