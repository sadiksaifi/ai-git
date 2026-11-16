import type { ProviderDoc, CLIProviderDoc, DisabledProviderDoc } from "./types.ts";

// ==============================================================================
// @ai-git/meta — Provider Documentation
// ==============================================================================

/**
 * Provider documentation metadata.
 * Display data for help screens, README, and documentation sites.
 * The CLI provider registry (apps/cli/src/providers/registry.ts) derives its
 * provider list from this record, so adding a provider starts here.
 * Adapters stay in apps/cli. No provider has a hardcoded model list.
 */
export const PROVIDERS: Record<string, ProviderDoc | CLIProviderDoc> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    type: "cli",
    binary: "claude",
    installCommand: "curl -fsSL https://claude.ai/install.sh | bash",
    docsUrl: "https://code.claude.com/docs/en/setup",
    requirementsUrl: "https://claude.com/product/claude-code",
    requirementsLabel: "Install CLI",
  },
  "antigravity-cli": {
    id: "antigravity-cli",
    name: "Antigravity CLI",
    type: "cli",
    binary: "agy",
    installCommand: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    docsUrl: "https://antigravity.google/docs/cli/overview",
    requirementsUrl: "https://antigravity.google/docs/cli/install",
    requirementsLabel: "Install CLI",
  },
  codex: {
    id: "codex",
    name: "Codex",
    type: "cli",
    binary: "codex",
    installCommand: "npm install -g @openai/codex",
    docsUrl: "https://learn.chatgpt.com/docs/codex/cli",
    requirementsUrl: "https://learn.chatgpt.com/docs/codex/cli",
    requirementsLabel: "Install CLI",
  },
  pi: {
    id: "pi",
    name: "Pi",
    type: "cli",
    binary: "pi",
    installCommand: "npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
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
    requirementsUrl: "https://platform.claude.com/settings/keys",
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
 * Providers that are switched off until their adapter is fixed. They are left
 * out of PROVIDERS, so setup, help, the schema, and the website skip them.
 */
export const DISABLED_PROVIDERS: Record<string, DisabledProviderDoc> = {
  opencode: {
    id: "opencode",
    name: "OpenCode",
    reason: "OpenCode 2.x removed the CLI flags the adapter uses.",
    issueUrl: "https://github.com/sadiksaifi/ai-git/issues/141",
  },
};

/**
 * Type guard: check if a provider doc is a CLI provider.
 */
export function isCLIProviderDoc(doc: ProviderDoc): doc is CLIProviderDoc {
  return doc.type === "cli";
}
