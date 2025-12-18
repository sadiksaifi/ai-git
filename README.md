# AI Git

A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages.

<img width="1512" height="949" alt="Screenshot 2025-12-03 at 20 30 32" src="https://github.com/user-attachments/assets/165330d2-64e1-44ed-829f-8aec980254ab" />

## Prerequisites

1.  **Git**: Must be installed and running inside a git repository.
2.  **AI CLI**: You need a command-line tool that interfaces with an LLM.
    *   Supported CLI tools: `claude` (Claude Code CLI), `gemini` (Gemini CLI)
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
│  ○ API - Use API keys (coming soon)
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

## Features

- 🤖 **AI-Powered**: Uses AI to analyze diffs and understand the *intent* of your changes.
- 📝 **Conventional Commits**: Strictly adheres to the v1.0.0 specification (`feat`, `fix`, `chore`, etc.).
- ⚡ **Fast & Native**: Compiled to a single binary using Bun.
- 🎨 **Interactive TUI**: Beautiful prompts for staging files, editing messages, and confirming actions.
- 🪙 **Token Efficient**: Uses [TOON](https://toonformat.dev/) (Token-Oriented Object Notation) to minimize prompt size and cost.
- 🛠️ **Flexible**: Supports fully automated workflows (`-y`) or granular control.
- 🔌 **Multiple Providers**: Support for Claude, Gemini, and more.

### Options & Flags

#### AI Configuration

| Flag | Description |
| :--- | :--- |
| `--mode <mode>` | Connection mode: `cli` or `api` (auto-detected from provider) |
| `-P, --provider <id>` | AI provider to use (e.g., `claude`, `gemini`) |
| `-M, --model <id>` | Model to use (e.g., `haiku`, `sonnet`, `gemini-2.5-flash`) |

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

### Examples

```bash
# Use your configured provider and model
ai-git

# Override provider and model for this run
ai-git --provider gemini --model gemini-2.5-flash

# Short form
ai-git -P gemini -M gemini-2.5-flash

# Full auto mode with hint
ai-git -y -H "Refactored authentication module"
```

### Configuration File

You can create a configuration file at `~/.config/ai-git/config.json` for persistent settings:

```json
{
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

**Priority order:**
1. CLI flags (highest priority)
2. Config file (set via setup wizard)

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
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "prompt": {
    "context": "Monorepo with multiple packages. Valid scopes: web, mobile, shared, api, docs, infra.",
    "style": "Always use a scope from the valid list. Reference PR numbers in footer."
  }
}
```

#### Example: Custom Commit Examples

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

> **Tip**: Only provide `examples` if you have very specific formatting requirements. The default examples cover common scenarios well.

### Environment Variables

You can also configure the tool using environment variables:

| Variable | Example | Description |
| :--- | :--- | :--- |
| `AI_GIT_OPTS` | `--provider gemini --model gemini-2.5-flash` | Default options to pass to the CLI. |

## Supported Providers

### CLI Mode (Current)

| Provider | Binary | Recommended Model | Available Models |
| :--- | :--- | :--- | :--- |
| Claude Code | `claude` | `haiku` | `haiku`, `sonnet`, `opus` |
| Gemini CLI | `gemini` | `gemini-2.5-flash` | `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash` |

### API Mode (Coming Soon)

Future support for API-based providers via Vercel AI SDK:
- OpenRouter
- OpenAI
- Google Vertex AI
- Anthropic API

## Contributing

We welcome contributions to AI Git! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## Development

This project is built with Bun.

```bash
# Install dependencies
bun install

# Run in development
bun run src/index.ts

# Run a dry run to test prompt generation
bun run src/index.ts --dry-run -a

# Typecheck
bun run typecheck
```

## License

[MIT](LICENSE)
