import type { UsageExample, ConfigExample } from "./types.ts";

// ==============================================================================
// @ai-git/content — Usage & Configuration Examples
// ==============================================================================

export const USAGE_EXAMPLES: readonly UsageExample[] = [
  { command: "ai-git", description: "Use configured defaults" },
  {
    command: "ai-git --provider openrouter --model anthropic/claude-sonnet-4-6",
    description: "Override provider for this run",
  },
  {
    command: 'ai-git -A --exclude "tests/" --exclude "*.test.ts"',
    description: "Exclude files from staging",
  },
  {
    command: 'ai-git --dangerously-auto-approve --hint "Refactored auth module"',
    description: "Fully automated",
  },
  {
    command: "ai-git --dry-run -A",
    description: "Preview prompt without calling the AI",
  },
] as const;

export const CONFIG_EXAMPLES: readonly ConfigExample[] = [
  {
    title: "Basic",
    description: "Simple provider + model setup",
    json: {
      $schema: "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
      provider: "claude-code",
      model: "haiku",
      defaults: { stageAll: false, commit: false, push: false },
    },
  },
  {
    title: "Monorepo with Scopes",
    description: "Custom context and style for monorepos",
    json: {
      $schema: "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
      provider: "claude-code",
      model: "sonnet",
      prompt: {
        context: "Monorepo with packages: web, mobile, shared, api, docs, infra.",
        style: "Always use a scope from the valid list. Reference PR numbers in footer.",
      },
    },
  },
  {
    title: "Custom Commit Format",
    description: "Provide your own commit message examples",
    json: {
      prompt: {
        examples: [
          "feat(auth): add SSO integration\n\n- implement SAML 2.0 authentication\n- add identity provider configuration\n- support multiple IdP connections\n\nRefs: PROJ-456",
        ],
      },
    },
  },
] as const;
