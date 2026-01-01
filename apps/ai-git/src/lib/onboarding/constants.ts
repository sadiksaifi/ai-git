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
 * Box drawing characters for the welcome screen.
 */
export const BOX = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  verticalRight: "├",
  verticalLeft: "┤",
  horizontalDown: "┬",
  horizontalUp: "┴",
  cross: "┼",
} as const;


/**
 * Error message templates with actionable suggestions.
 */
export const ERROR_MESSAGES = {
  noConfig: {
    message: "No configuration found.",
    suggestion: "Run: ai-git --setup",
  },
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

