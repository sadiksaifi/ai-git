import type { Feature } from "./types.ts";

// ==============================================================================
// @ai-git/content — Core Features
// ==============================================================================

export const FEATURES: readonly Feature[] = [
  {
    id: "ai-powered",
    label: "AI-Powered",
    description: "Analyzes diffs and understands the intent of your changes",
  },
  {
    id: "conventional-commits",
    label: "Conventional Commits",
    description: "Strictly adheres to v1.0.0 specification",
  },
  {
    id: "interactive-tui",
    label: "Interactive TUI",
    description: "Beautiful prompts for staging, editing, and confirming",
  },
  {
    id: "zero-config",
    label: "Zero Config",
    description: "Setup wizard handles provider, model, and keychain storage",
  },
  {
    id: "multi-provider",
    label: "Multiple Providers",
    description: "8+ AI providers — CLI and API",
  },
  {
    id: "secure",
    label: "Secure",
    description: "API keys stored in keychain, never in config files",
  },
] as const;
