# AI Git

A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages.

<img width="1512" height="949" alt="Screenshot 2025-12-03 at 19 22 41" src="https://github.com/user-attachments/assets/cee1e37e-cf93-46dd-a443-bae51c2812cb" />

## Prerequisites

1.  **Git**: Must be installed and running inside a git repository.
2.  **Gemini CLI**: You need a command-line tool that interfaces with Gemini (default command is `gemini`).
    *   *Note: This tool expects `gemini` to be in your PATH. You can override this with the `GEMINI_CMD` environment variable.*

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

## Features

- 🤖 **AI-Powered**: Uses Gemini 2.5 Flash to analyze diffs and understand the *intent* of your changes.
- 📝 **Conventional Commits**: Strictly adheres to the v1.0.0 specification (`feat`, `fix`, `chore`, etc.).
- ⚡ **Fast & Native**: compiled to a single binary using Bun.
- 🎨 **Interactive TUI**: Beautiful prompts for staging files, editing messages, and confirming actions.
- 🪙 **Token Efficient**: Uses [TOON](https://toonformat.dev/) (Token-Oriented Object Notation) to minimize prompt size and cost.
- 🛠️ **Flexible**: Supports fully automated workflows (`-y`) or granular control.

### Options & Flags

| Flag | Description |
| :--- | :--- |
| `-a`, `--stage-all` | Automatically stage all changes (`git add -A`) before analysis. |
| `-c`, `--commit` | Automatically commit with the generated message (skip confirmation). |
| `-p`, `--push` | Automatically push after committing. |
| `-y`, `--yes` | **Full Auto Mode**: Stages all, commits, and pushes without interaction. |
| `-H`, `--hint <text>` | Provide a hint or extra context to the AI (e.g., "Fixed the login bug"). |
| `--dry-run` | Print the full system prompt and diff to stdout without calling the AI. |

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GEMINI_CMD` | `gemini` | The CLI command to invoke the Gemini model. |
| `MODEL` | `gemini-2.5-flash` | The specific model version to use. |

## Development

This project is built with Bun.

```bash
# Install dependencies
bun install

# Run in development
bun run index.ts

# Run a dry run to test prompt generation
bun run index.ts --dry-run -a

# Typecheck
bun run typecheck
```

## License

[MIT](LICENSE)
