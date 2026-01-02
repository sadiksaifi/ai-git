export const FLAGS = {
  // AI configuration
  provider: {
    short: "-P",
    long: "--provider",
    arg: "<id>",
    description:
      "AI provider (claude-code, gemini-cli, openrouter, openai, anthropic, google-ai-studio)",
  },
  model: {
    short: "-M",
    long: "--model",
    arg: "<id>",
    description:
      "Model ID (e.g., haiku, gpt-4o-mini, anthropic/claude-3.5-haiku)",
  },

  // Workflow options
  stageAll: {
    short: "-a",
    long: "--stage-all",
    description: "Automatically stage all changes",
  },
  commit: {
    short: "-c",
    long: "--commit",
    description: "Automatically commit (skip editor/confirmation)",
  },
  push: {
    short: "-p",
    long: "--push",
    description: "Automatically push after commit",
  },
  hint: {
    short: "-H",
    long: "--hint",
    arg: "<text>",
    description: "Provide a hint/context to the AI",
  },
  dangerouslyAutoApprove: {
    long: "--dangerously-auto-approve",
    description: "Run fully automated (Stage All + Commit + Push)",
  },
  dryRun: {
    long: "--dry-run",
    description: "Print the prompt and diff without calling AI",
  },

  // Meta
  setup: {
    long: "--setup",
    description: "Re-run the setup wizard to reconfigure AI provider",
  },
  init: {
    long: "--init",
    description: "Initialize project-level configuration",
  },
  version: {
    short: "-v",
    long: "--version",
    description: "Display version number",
  },
} as const;

/**
 * Get a random tip based on available flags.
 */
export function getRandomTip(): { flag: string; desc: string } {
  const flags = Object.values(FLAGS);
  const randomFlag = flags[Math.floor(Math.random() * flags.length)];
  
  if (!randomFlag) {
    return { flag: "--help", desc: "Show help" };
  }

  return {
    flag: randomFlag.long,
    desc: randomFlag.description,
  };
}
