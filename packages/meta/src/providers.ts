import type { ProviderDoc, CLIProviderDoc } from "./types.ts";

// ==============================================================================
// @ai-git/meta — Provider Documentation
// ==============================================================================

/**
 * Provider documentation metadata.
 * Display-only data for help screens, README, and documentation sites.
 * Runtime data (adapters, model lists, binaries) stays in apps/cli.
 */
export const PROVIDERS: Record<string, ProviderDoc | CLIProviderDoc> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    type: "cli",
    binary: "claude",
    installCommand: "curl -fsSL https://claude.ai/install.sh | bash",
    docsUrl: "https://code.claude.com/docs/en/setup",
    requirementsUrl: "https://claude.com/claude-code",
    requirementsLabel: "Install CLI",
  },
  "gemini-cli": {
    id: "gemini-cli",
    name: "Gemini CLI",
    type: "cli",
    binary: "gemini",
    installCommand: "npm install -g @google/gemini-cli",
    docsUrl: "https://geminicli.com/docs/get-started/installation",
    requirementsUrl: "https://geminicli.com/docs/get-started/installation",
    requirementsLabel: "Install CLI",
  },
  codex: {
    id: "codex",
    name: "Codex",
    type: "cli",
    binary: "codex",
    installCommand: "npm install -g @openai/codex",
    docsUrl: "https://developers.openai.com/codex/cli#cli-setup",
    requirementsUrl: "https://developers.openai.com/codex/cli#cli-setup",
    requirementsLabel: "Install CLI",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    type: "cli",
    binary: "opencode",
    installCommand: "curl -fsSL https://opencode.ai/install | bash",
    docsUrl: "https://opencode.ai",
    requirementsUrl: "https://opencode.ai",
    requirementsLabel: "Install CLI",
  },
  pi: {
    id: "pi",
    name: "Pi",
    type: "cli",
    binary: "pi",
    installCommand: "npm install -g @mariozechner/pi-coding-agent",
    docsUrl: "https://pi.dev",
    requirementsUrl: "https://pi.dev",
    requirementsLabel: "Install CLI",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    type: "api",
    requirementsUrl: "https://openrouter.ai/keys",
    requirementsLabel: "Get API Key",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    type: "api",
    requirementsUrl: "https://platform.openai.com/api-keys",
    requirementsLabel: "Get API Key",
  },
  "google-ai-studio": {
    id: "google-ai-studio",
    name: "Google AI Studio",
    type: "api",
    requirementsUrl: "https://aistudio.google.com/app/apikey",
    requirementsLabel: "Get API Key",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    type: "api",
    requirementsUrl: "https://console.anthropic.com/settings/keys",
    requirementsLabel: "Get API Key",
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras",
    type: "api",
    requirementsUrl: "https://cloud.cerebras.ai/",
    requirementsLabel: "Get API Key",
  },
};

/**
 * Type guard: check if a provider doc is a CLI provider.
 */
export function isCLIProviderDoc(doc: ProviderDoc): doc is CLIProviderDoc {
  return doc.type === "cli";
}
