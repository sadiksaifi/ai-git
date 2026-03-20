import type { FAQItem } from "./types.ts";

// ==============================================================================
// @ai-git/content/web — FAQ
// ==============================================================================

export const faq = {
  headline: "Questions?",
  items: [
    {
      question: "Is AI Git free?",
      answer:
        "Yes. AI Git is open source under the MIT license. You bring your own AI provider — some are free (Claude Code, Gemini CLI, Codex), others require an API key.",
    },
    {
      question: "Does my code leave my machine?",
      answer:
        "Only the staged diff is sent to your chosen AI provider. No telemetry, no analytics, no data collection. Your code stays yours.",
    },
    {
      question: "Which AI provider should I use?",
      answer:
        "If you have Claude Code, Gemini CLI, or Codex installed, start there — zero API keys needed. For API providers, OpenRouter gives you access to hundreds of models with one key.",
    },
    {
      question: "Does it work with monorepos?",
      answer:
        "Yes. Configure scopes, custom context, and style preferences per project with .ai-git.json.",
    },
    {
      question: "What if the AI generates a bad message?",
      answer:
        "You always review before committing. Edit inline, regenerate, or quit. The generation loop auto-retries on validation errors up to 3 times.",
    },
    {
      question: "Can I use it in CI/CD?",
      answer:
        "Yes. Use --dangerously-auto-approve for fully automated pipelines. Pair with --hint to give the AI extra context.",
    },
  ] as readonly FAQItem[],
} as const;
