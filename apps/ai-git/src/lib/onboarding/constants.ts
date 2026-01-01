// ==============================================================================
// ONBOARDING CONSTANTS
// Centralized copy, URLs, and configuration for the onboarding experience.
// ==============================================================================

/**
 * Installation information for CLI tools.
 */
export const INSTALL_INFO = {
  "claude-code": {
    name: "Claude Code",
    binary: "claude",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    docsUrl: "https://code.claude.com/docs/en/setup",
  },
  "gemini-cli": {
    name: "Gemini CLI",
    binary: "gemini",
    installCommand: "npm install -g @google/gemini-cli",
    docsUrl: "https://geminicli.com/docs/get-started/installation",
  },
} as const;

/**
 * Welcome screen copy.
 */
export const WELCOME_COPY = {
  tagline: "AI-powered git commit messages",
  description: [
    "AI Git analyzes your staged changes and generates",
    "Conventional Commits-compliant messages automatically.",
  ],
  features: [
    "Semantic commit types (feat, fix, chore, etc.)",
    "Smart scope detection from file paths",
    "Interactive refinement with AI feedback",
  ],
  setupOverview: [
    "This quick setup will configure your AI provider.",
    "You'll choose between:",
    "",
    "  CLI Mode - Use installed AI tools (claude-code, gemini-cli)",
    "  API Mode - Use API keys (macOS only)",
  ],
} as const;

/**
 * Error message templates with actionable suggestions.
 */
export const ERROR_MESSAGES = {
  noConfig: {
    message: "No configuration found.",
    suggestion: "Run: ai-git --setup",
  },
  missingMode: {
    message: "No connection mode configured.",
    suggestion: "Run: ai-git --setup to select CLI or API mode.",
  },
  invalidMode: (mode: string) => ({
    message: `Invalid mode '${mode}'. Must be 'cli' or 'api'.`,
    suggestion: "Run: ai-git --setup",
  }),
  missingProvider: {
    message: "No AI provider configured.",
    suggestion: "Run: ai-git --setup to select a provider.",
  },
  invalidProvider: (id: string) => ({
    message: `Unknown provider '${id}'.`,
    suggestion: "Run: ai-git --setup to choose a valid provider.",
  }),
  missingModel: {
    message: "No model configured.",
    suggestion: "Run: ai-git --setup to select a model.",
  },
  invalidModel: (modelId: string, providerName: string) => ({
    message: `Unknown model '${modelId}' for ${providerName}.`,
    suggestion: "Run: ai-git --setup to choose a valid model.",
  }),
  cliNotInstalled: (binary: string, providerKey: keyof typeof INSTALL_INFO) => {
    const info = INSTALL_INFO[providerKey];
    return {
      title: `${info?.name ?? binary} CLI not installed`,
      message: `The '${binary}' command was not found.`,
      solutions: [
        info?.installCommand ? `Install: ${info.installCommand}` : null,
        info?.docsUrl ? `Docs: ${info.docsUrl}` : null,
      ].filter((s): s is string => s !== null),
    };
  },
  apiKeyMissing: (providerName: string) => ({
    message: `API key for ${providerName} not found in keychain.`,
    suggestion: "Run: ai-git --setup to configure your API key.",
  }),
  platformNotSupported: {
    title: "Platform Not Supported",
    message: "API mode requires macOS for secure keychain storage.",
    hint: "Use CLI mode instead, or wait for Linux/Windows support.",
  },
} as const;

/**
 * Quick reference commands shown after setup.
 */
export const QUICK_REFERENCE = {
  commands: [
    { cmd: "ai-git", desc: "Generate a commit message" },
    { cmd: "ai-git -a", desc: "Stage all changes first" },
    { cmd: "ai-git --dangerously-auto-approve", desc: "Full auto mode (stage, commit, push)" },
    { cmd: "ai-git --help", desc: "See all options" },
  ],
} as const;
