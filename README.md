# AI Git

A CLI tool that leverages AI to automatically generate semantically correct, conventional commits compliant git messages.

<img width="1512" height="949" alt="Screenshot 2025-12-03 at 20 30 32" src="https://github.com/user-attachments/assets/165330d2-64e1-44ed-829f-8aec980254ab" />

## Features

- 🤖 **AI-Powered** - Analyzes diffs and understands the *intent* of your changes
- 📝 **Conventional Commits** - Strictly adheres to [v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification
- 🎨 **Interactive TUI** - Beautiful prompts for staging, editing, and confirming
- 🪙 **Token Efficient** - Uses [TOON](https://toonformat.dev/) to minimize prompt size and cost
- 🔌 **Multiple Providers** - CLI mode (Claude, Gemini) or API mode (OpenRouter, OpenAI, Anthropic, Gemini)
- 🔐 **Secure** - API keys stored in keychain, never in config files

## Installation

### Homebrew (Recommended)

```bash
brew tap sadiksaifi/ai-git https://github.com/sadiksaifi/ai-git
brew install ai-git
```

### Build from Source

```bash
git clone https://github.com/sadiksaifi/ai-git.git
cd ai-git
bun install
bun run build
mv dist/ai-git ~/.local/bin/
```

## Quick Start

Run `ai-git` in any git repository:

```bash
ai-git
```

On first run, you'll be guided through a quick setup wizard to configure your AI provider:
- **CLI Mode** - Use installed AI tools (claude, gemini)
- **API Mode** - Use API keys (OpenRouter, OpenAI, Anthropic, Gemini)

Settings are saved to `~/.config/ai-git/config.json`

> **Reconfigure:** `ai-git --setup`
> **Project config:** `ai-git --init` to create `.ai-git.json` in your project root

## Usage

### CLI Reference

```sh
ai-git

Usage:
  $ ai-git

Commands:
    Generate a commit message using AI

For more info, run any command with the `--help` flag:
  $ ai-git --help

Options:
  --mode <mode>        Connection mode: cli or api (auto-detected from provider)
  -P, --provider <id>  AI provider (claude, gemini, openrouter, openai, anthropic, gemini-api)
  -M, --model <id>     Model ID (e.g., haiku, gpt-4o-mini, anthropic/claude-3.5-haiku)
  -a, --stage-all      Automatically stage all changes
  -c, --commit         Automatically commit (skip editor/confirmation)
  -p, --push           Automatically push after commit
  -y, --yes            Run fully automated (Stage All + Commit + Push)
  -H, --hint <text>    Provide a hint/context to the AI
  --dry-run            Print the prompt and diff without calling AI
  --setup              Re-run the setup wizard to reconfigure AI provider
  --init               Initialize project-level configuration
  -v, --version        Display version number
  -h, --help           Display this message
```

### Examples

```bash
# Use configured defaults
ai-git

# Override provider for this run
ai-git --provider gemini --model gemini-3-flash-preview

# API mode with OpenRouter
ai-git --provider openrouter --model anthropic/claude-3.5-haiku

# Full auto with context hint
ai-git --yes --hint "Refactored authentication module"

# Dry run to test prompt generation
ai-git --dry-run --stage-all
```

## Supported Providers

### CLI Mode

Uses locally installed AI CLI tools (no API keys needed).

| Provider | ID | Models | Requirements |
| :--- | :--- | :--- | :--- |
| Claude Code | `claude` | haiku, sonnet, opus | [Install CLI](https://claude.com/claude-code) |
| Gemini | `gemini` | flash, pro, flash-lite | [Install CLI](https://ai.google.dev/gemini-api/docs/cli) |

### API Mode

Uses cloud APIs (requires API key, stored securely in keychain).

| Provider | ID | Documentation |
| :--- | :--- | :--- |
| OpenRouter | `openrouter` | [Model list](https://openrouter.ai/models) - Access 200+ models from multiple providers |
| OpenAI | `openai` | [Models](https://platform.openai.com/docs/models) - GPT-4o, GPT-4o-mini, etc. |
| Gemini | `gemini-api` | [Models](https://ai.google.dev/gemini-api/docs/models) - Gemini 2.5 Flash/Pro |
| Anthropic | `anthropic` | [Models](https://docs.anthropic.com/en/docs/about-claude/models) - Claude 3.5 Sonnet/Haiku |

Configure API keys with `ai-git --setup`

## Configuration

AI Git uses a **three-tier configuration system**:

1. **CLI flags** (highest priority)
2. **Project config** (`.ai-git.json`)
3. **Global config** (`~/.config/ai-git/config.json`)

### Example Configs

**CLI Mode:**
```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "mode": "cli",
  "provider": "claude",
  "model": "haiku",
  "defaults": {
    "stageAll": false,
    "commit": false,
    "push": false
  }
}
```

**API Mode:**
```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "mode": "api",
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
  "mode": "cli",
  "provider": "claude",
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

# Type check
bun run typecheck

# Build binary
bun run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE)
