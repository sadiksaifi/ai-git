// ==============================================================================
// @ai-git/content/web — Provider Showcase
// ==============================================================================

export const providerShowcase = {
  headline: "8+ Providers. One Interface.",
  subheadline:
    "Use whatever AI you already have. CLI tools need zero API keys. API providers give you model choice.",
  categories: [
    {
      type: "cli" as const,
      label: "CLI Providers",
      tagline: "Already installed? You're ready.",
      providerIds: ["claude-code", "gemini-cli", "codex"],
    },
    {
      type: "api" as const,
      label: "API Providers",
      tagline: "Bring your own key. Pick your model.",
      providerIds: ["openrouter", "openai", "google-ai-studio", "anthropic", "cerebras"],
    },
  ],
} as const;
