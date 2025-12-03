# AI Git

A powerful CLI tool that leverages **Gemini 2.5 Flash** to automatically generate semantically correct, **Conventional Commits**-compliant git messages from your staged changes.

Built with **Bun**, **TypeScript**, and **@clack/prompts** for a beautiful, interactive terminal experience.

## Features

- 🤖 **AI-Powered**: Uses Gemini 2.5 Flash to analyze diffs and understand the *intent* of your changes.
- 📝 **Conventional Commits**: Strictly adheres to the v1.0.0 specification (`feat`, `fix`, `chore`, etc.).
- ⚡ **Fast & Native**: compiled to a single binary using Bun.
- 🎨 **Interactive TUI**: Beautiful prompts for staging files, editing messages, and confirming actions.
- 🪙 **Token Efficient**: Uses [TOON](https://toonformat.dev/) (Token-Oriented Object Notation) to minimize prompt size and cost.
- 🛠️ **Flexible**: Supports fully automated workflows (`-y`) or granular control.

## Prerequisites

1.  **Git**: Must be installed and running inside a git repository.
2.  **Gemini CLI**: You need a command-line tool that interfaces with Gemini (default command is `gemini`).
    *   *Note: This tool expects `gemini` to be in your PATH. You can override this with the `GEMINI_CMD` environment variable.*

## Installation

### Option 1: Homebrew (Recommended)

Install `ai-git` using Homebrew:

```bash
brew tap sadiksaifi/ai-git
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

### Option 2: Run with Bun

If you prefer not to compile:

```bash
bun install
bun run index.ts
```

## Usage

Run the tool in your git repository:

```bash
ai-git
```

It will guide you through the process of generating a commit message based on your staged changes.
```bash
┌   ai-git v0.2.0
│
◇  No staged changes detected. What would you like to do?
│  Select Files
│
◇  Select files to stage
│  README.md
│
◇  Staged selected files
│
◇  Message generated
│
◇  Generated Commit Message ────────────────────────╮
│                                                   │
│  docs: update project title in readme             │
│                                                   │
│  - add " - kindo app" to project title in readme  │
│                                                   │
├───────────────────────────────────────────────────╯
│
◇  Action
│  Commit
[main 5869b55] docs: update project title in readme
 1 file changed, 1 insertion(+), 1 deletion(-)
│
└  Commit created successfully.

│
◇  Do you want to git push?
│  Yes
│
◑  Pushing changes.To https://github.com/KinTechnology/surface.git
   8d9ac45..5869b55  main -> main
◇  Pushed successfully
│
└  All done!
```

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

MIT
