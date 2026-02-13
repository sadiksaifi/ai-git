# AI Git

A CLI tool that leverages AI to automatically generate semantically correct, conventional commits compliant git messages.

<img width="1351" height="883" alt="Screenshot 2026-01-02 at 03 23 41" src="https://github.com/user-attachments/assets/657cbb28-ac54-435f-9759-a31a762c45a3" />

## Features

- 🤖 **AI-Powered** - Analyzes diffs and understands the *intent* of your changes
- 📝 **Conventional Commits** - Strictly adheres to [v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification
- 🎨 **Interactive TUI** - Beautiful prompts for staging, editing, and confirming
- 🪙 **Token Efficient** - Uses [TOON](https://toonformat.dev/) to minimize prompt size and cost
- 🔌 **Multiple Providers** - Claude Code, Gemini CLI, Codex, OpenRouter, OpenAI, Anthropic, Google AI Studio
- 🔐 **Secure** - API keys stored in keychain, never in config files

## Installation

### npm (Recommended)

```bash
npm install -g @ai-git/cli
```

> Also works with `bun`, `pnpm`, and `yarn`.

### Homebrew (macOS)

```bash
brew tap sadiksaifi/tap
brew install ai-git
```

### Shell Script (macOS/Linux)

```bash
curl -fsSL https://ai-git.xyz/install | bash
```

### Build from Source

```bash
git clone https://github.com/sadiksaifi/ai-git.git
cd ai-git
bun install
bun run build
```

## Quick Start

Run `ai-git` in any git repository:

```bash
ai-git
```

On first run, you'll be guided through a quick setup wizard to choose your AI provider.

Settings are saved to `~/.config/ai-git/config.json`

> **Reconfigure:** `ai-git --setup`
> **Project config:** `ai-git --init` to create `.ai-git.json` in your project root
> **Self-update:** `ai-git upgrade`

## Usage

### CLI Reference

```sh
$ ai-git --help
Usage:
  $ ai-git [options]

Generate a commit message using AI

Options:
  -P, --provider <id>         AI provider (claude-code, gemini-cli, codex, openrouter, openai, anthropic, google-ai-studio)
  -M, --model <id>            Model ID (e.g., haiku, gpt-4o-mini, anthropic/claude-3.5-haiku)
  -a, --stage-all             Automatically stage all changes
  -c, --commit                Automatically commit (skip editor/confirmation)
  -p, --push                  Automatically push after commit
  -H, --hint <text>           Provide a hint/context to the AI
  -X, --exclude <pattern>     Exclude files/directories from staging (use with -a)
  --dangerously-auto-approve  Run fully automated (Stage All + Commit + Push)
  --dry-run                   Print the prompt and diff without calling AI (provider availability not required)
  --setup                     Re-run the setup wizard to reconfigure AI provider
  --init                      Initialize project-level configuration
  -v, --version               Display version number
  -h, --help                  Display this message
```

### Examples

```bash
# Use configured defaults
ai-git

# Override provider for this run
ai-git --provider gemini-cli --model gemini-3-flash-preview

# Use Codex
ai-git --provider codex --model gpt-5.3-codex

# Use OpenRouter
ai-git --provider openrouter --model anthropic/claude-3.5-haiku

# Exclude files/directories from staging
ai-git -a --exclude "tests/" --exclude "*.test.ts"

# Automated (Be careful!)
ai-git --dangerously-auto-approve --hint "Refactored authentication module"

# Dry run works without installed provider CLI/API key
ai-git --dry-run -a
```

## Supported Providers

| Provider | ID | Type | Requirements |
| :--- | :--- | :--- | :--- |
| Claude Code | `claude-code` | CLI | [Install CLI](https://claude.com/claude-code) |
| Gemini CLI | `gemini-cli` | CLI | [Install CLI](https://ai.google.dev/gemini-api/docs/cli) |
| Codex | `codex` | CLI | [Install CLI](https://developers.openai.com/codex/cli) (`npm install -g @openai/codex`) |
| OpenRouter | `openrouter` | API | [Get API Key](https://openrouter.ai/keys) |
| OpenAI | `openai` | API | [Get API Key](https://platform.openai.com/api-keys) |
| Google AI Studio | `google-ai-studio` | API | [Get API Key](https://aistudio.google.com/app/apikey) |
| Anthropic | `anthropic` | API | [Get API Key](https://console.anthropic.com/settings/keys) |

Configure with `ai-git --setup`

## Configuration

AI Git uses a **three-tier configuration system**:

1. **CLI flags** (highest priority)
2. **Project config** (`.ai-git.json`)
3. **Global config** (`~/.config/ai-git/config.json`)

### Example Configs

```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "provider": "claude-code",
  "model": "haiku",
  "defaults": {
    "stageAll": false,
    "commit": false,
    "push": false
  }
}
```

```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "provider": "openrouter",
  "model": "anthropic/claude-3.5-haiku"
}
```

> **Tip:** Add the `$schema` property for autocomplete and validation in your editor.
>
> **Note:** API keys are stored securely in keychain, not in config files.

## Advanced: Custom Prompts

The default prompt works excellently for most projects. Customize only for project-specific needs like ticket systems, monorepo scopes, or team style preferences.

### Customization Options

| Field | Description | Example |
| :--- | :--- | :--- |
| `prompt.context` | Project-specific information | `"React Native app. Jira tickets: PROJ-123"` |
| `prompt.style` | Style/format preferences | `"Always include scope. Keep body under 5 points."` |
| `prompt.examples` | Custom commit examples (replaces defaults) | Array of commit message strings |

### Example: Monorepo with Scopes

```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "provider": "claude-code",
  "model": "sonnet",
  "prompt": {
    "context": "Monorepo with packages: web, mobile, shared, api, docs, infra.",
    "style": "Always use a scope from the valid list. Reference PR numbers in footer."
  }
}
```

### Example: Custom Commit Format

```json
{
  "prompt": {
    "examples": [
      "feat(auth): add SSO integration\n\n- implement SAML 2.0 authentication\n- add identity provider configuration\n- support multiple IdP connections\n\nRefs: PROJ-456",
      "fix(api): resolve rate limiting bypass\n\n- add per-user rate limit tracking\n- implement sliding window algorithm\n- add rate limit headers to responses"
    ]
  }
}
```

> **Note:** Only provide `examples` if you have very specific formatting requirements.

## Development

```bash
# Install dependencies
bun install

# Run in development
bun start

# Test prompt generation without AI call
bun start --dry-run -a

# Disable update-check network calls (useful for tests/CI)
AI_GIT_DISABLE_UPDATE_CHECK=1 bun test

# Type check
bun run typecheck

# Build binary
bun run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE)
