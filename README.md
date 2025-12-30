# AI Git

A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages.

<img width="1512" height="949" alt="Screenshot 2025-12-03 at 20 30 32" src="https://github.com/user-attachments/assets/165330d2-64e1-44ed-829f-8aec980254ab" />

## Prerequisites

1.  **Git**: Must be installed and running inside a git repository.
2.  **AI Provider**: Choose one of the following:
    *   **CLI Mode**: Install an AI CLI tool (`claude` or `gemini`)
    *   **API Mode** (macOS only): Use API keys from OpenRouter, OpenAI, Anthropic, or Google Gemini
    *   On first run, you'll be guided through a setup wizard to choose your provider.

## Installation

### Option 1: Homebrew (Recommended)

Install `ai-git` using Homebrew:

```bash
brew tap sadiksaifi/ai-git https://github.com/sadiksaifi/ai-git
brew install ai-git
```

### Option 2: Build from Source

Clone the repository and build the single-file executable:

```bash
# Install dependencies
bun install

# Build the binary
bun run build
# The compiled binary will be in `dist/ai-git`

# Add to your PATH manually or move to a bin directory
mv dist/ai-git ~/.local/bin/
```

## Usage

Run the tool in your git repository:

```bash
ai-git
```

### First-Run Setup

On your first run, AI Git will guide you through a quick setup wizard:

```
┌  AI Git Setup
│
│  Welcome to AI Git! Let's configure your AI provider.
│  This setup only runs once. Your settings will be saved to:
│  ~/.config/ai-git/config.json
│
◆  Select connection mode:
│  ● CLI - Use installed AI CLI tools (claude, gemini)
│  ○ API - Use API keys (OpenRouter, OpenAI, Anthropic, Gemini)
│
◆  Select AI provider:
│  ● Claude Code (recommended)
│  ○ Gemini CLI
│
◆  Select model:
│  ● Claude Haiku (recommended)
│  ○ Claude Sonnet
│  ○ Claude Opus
│
└  Setup complete! You're ready to use AI Git.
```

The setup wizard will:
1. Ask you to select a connection mode (CLI or API)
2. Let you choose your preferred AI provider
3. Select which model to use (with recommendations)
4. Save your configuration to `~/.config/ai-git/config.json`

To re-run setup at any time (e.g., to switch providers), use the `--setup` flag:

```bash
ai-git --setup
```

### Project Setup

To configure AI Git for a specific project (e.g., to enforce a specific model or prompt style for your team), run:

```bash
ai-git --init
```

This command will guide you through creating a `.ai-git.json` file in your project root. You can:
- Copy your existing global settings.
- Run the wizard to configure fresh settings for this project.

## Features

- 🤖 **AI-Powered**: Uses AI to analyze diffs and understand the *intent* of your changes.
- 📝 **Conventional Commits**: Strictly adheres to the v1.0.0 specification (`feat`, `fix`, `chore`, etc.).
- ⚡ **Fast & Native**: Compiled to a single binary using Bun.
- 🎨 **Interactive TUI**: Beautiful prompts for staging files, editing messages, and confirming actions.
- 🪙 **Token Efficient**: Uses [TOON](https://toonformat.dev/) (Token-Oriented Object Notation) to minimize prompt size and cost.
- 🛠️ **Flexible**: Supports fully automated workflows (`-y`) or granular control.
- 🔌 **Multiple Providers**: CLI mode (Claude, Gemini) or API mode (OpenRouter, OpenAI, Anthropic, Gemini).
- 🔐 **Secure**: API keys stored in macOS Keychain, never in config files.

### Options & Flags

#### AI Configuration

| Flag | Description |
| :--- | :--- |
| `--mode <mode>` | Connection mode: `cli` or `api` (auto-detected from provider) |
| `-P, --provider <id>` | AI provider to use (e.g., `claude`, `gemini`) |
| `-M, --model <id>` | Model to use (e.g., `haiku`, `sonnet`, `gemini-3-flash-preview`) |

#### Workflow Options

| Flag | Description |
| :--- | :--- |
| `-a`, `--stage-all` | Automatically stage all changes (`git add -A`) before analysis. |
| `-c`, `--commit` | Automatically commit with the generated message (skip confirmation). |
| `-p`, `--push` | Automatically push after committing. |
| `-y`, `--yes` | **Full Auto Mode**: Stages all, commits, and pushes without interaction. |
| `-H`, `--hint <text>` | Provide a hint or extra context to the AI (e.g., "Fixed the login bug"). |
| `--dry-run` | Print the full system prompt and diff to stdout without calling the AI. |
| `--setup` | Re-run the setup wizard to reconfigure your AI provider. |
| `--init` | Initialize a project-level configuration file (`.ai-git.json`). |

### Examples

```bash
# Use your configured provider and model
ai-git

# Override provider and model for this run (CLI mode)
ai-git --provider gemini --model gemini-3-flash-preview

# Use API mode with OpenRouter
ai-git --provider openrouter --model anthropic/claude-3.5-haiku

# Short form
ai-git -P gemini -M gemini-3-flash-preview

# Full auto mode with hint
ai-git -y -H "Refactored authentication module"

# Re-run setup to switch providers or update API key
ai-git --setup
```

### Configuration

AI Git supports both **global** and **project-level** configuration.

#### Global Config
Stored at `~/.config/ai-git/config.json`. This is your default configuration across all projects.
- Created automatically during the first-run setup.
- Reconfigure anytime with `ai-git --setup`.

#### Project Config
Stored at `.ai-git.json` in your project root. This overrides global settings for specific repositories.
- Ideal for sharing team standards (e.g., custom prompts, models).
- Initialize with `ai-git --init`.

**Priority Order:**
1.  CLI flags (highest priority)
2.  Project config (`.ai-git.json`)
3.  Global config (`~/.config/ai-git/config.json`)

#### Example Config Structure (CLI Mode)

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

#### Example Config Structure (API Mode)

```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "mode": "api",
  "provider": "openrouter",
  "model": "anthropic/claude-3.5-haiku"
}
```

> **Tip**: Add the `$schema` property to get autocomplete and validation in your editor (VS Code, Cursor, etc.).
>
> **Note**: API keys are stored securely in the macOS Keychain, not in config files.

### Prompt Customization (Optional)

The default prompt is designed to be **best-in-class** and works excellently for most projects. However, you can optionally customize it for project-specific needs via the config file.

> **Note**: Customization is only needed for project-specific context like ticket systems (Jira, Linear), monorepo scopes, or team style preferences. The default prompt handles common scenarios very well.

#### Available Customization Options

| Field | Description | Example |
| :--- | :--- | :--- |
| `prompt.context` | Project-specific information | `"React Native app using Expo. Jira tickets: PROJ-123"` |
| `prompt.style` | Style/format preferences | `"Always include scope. Keep body under 5 points."` |
| `prompt.examples` | Custom commit examples (replaces defaults) | Array of commit message strings |

#### Example: React Native + Jira Project

```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "mode": "cli",
  "provider": "claude",
  "model": "sonnet",
  "prompt": {
    "context": "React Native app with Expo SDK 54. We track work in Jira (MOBILE-xxx tickets). Extract ticket ID from branch name if present.",
    "style": "Always include scope. Keep body concise with 3-5 bullet points."
  }
}
```

#### Example: Monorepo with Custom Scopes

```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "mode": "cli",
  "provider": "gemini",
  "model": "gemini-3-flash-preview",
  "prompt": {
    "context": "Monorepo with multiple packages. Valid scopes: web, mobile, shared, api, docs, infra.",
    "style": "Always use a scope from the valid list. Reference PR numbers in footer."
  }
}
```

#### Example: Custom Commit Examples

```json
{
  "$schema": "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/schema.json",
  "mode": "cli",
  "provider": "claude",
  "model": "haiku",
  "prompt": {
    "examples": [
      "feat(auth): add SSO integration\n\n- implement SAML 2.0 authentication\n- add identity provider configuration\n- support multiple IdP connections\n\nRefs: PROJ-456",
      "fix(api): resolve rate limiting bypass\n\n- add per-user rate limit tracking\n- implement sliding window algorithm\n- add rate limit headers to responses"
    ]
  }
}
```

> **Tip**: Only provide `examples` if you have very specific formatting requirements. The default examples cover common scenarios well.

## Supported Providers

### CLI Mode (Current)

| Provider | Binary | Recommended Model | Available Models |
| :--- | :--- | :--- | :--- |
| Claude Code | `claude` | `haiku` | `haiku`, `sonnet`, `opus` |
| Gemini CLI | `gemini` | `gemini-3-flash-preview` | `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro` |

### API Mode

API-based providers using Vercel AI SDK (macOS only for now):

| Provider | Provider ID | Default Model | Description |
|----------|-------------|---------------|-------------|
| OpenRouter | `openrouter` | `anthropic/claude-3.5-haiku` | Access to multiple AI providers (recommended) |
| OpenAI | `openai` | `gpt-4o-mini` | GPT-4o, GPT-4, o1 models |
| Google Gemini | `gemini-api` | `gemini-2.0-flash` | Gemini models via REST API |
| Anthropic | `anthropic` | `claude-3-5-haiku-latest` | Claude models directly |

API keys are stored securely in the macOS Keychain. Run `ai-git --setup` to configure.

## Contributing

We welcome contributions to AI Git! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## Development

This project is built with Bun.

```bash
# Install dependencies
bun install

# Run in development
bun start

# Run a dry run to test prompt generation
bun start --dry-run -a

# Typecheck
bun run typecheck
```

## License

[MIT](LICENSE)
