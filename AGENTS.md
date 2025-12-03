# Agent Guide: ai-git

This document provides context, conventions, and workflows for AI agents working on this codebase.

## 1. Tech Stack & Runtime
- **Runtime:** **Bun** (v1.0+). Do not use Node.js or npm/yarn/pnpm commands.
- **Language:** TypeScript (Native execution via Bun).
- **Dependencies:** Managed via `bun install`.
- **Shell Operations:** Use Bun's Shell (`import { $ } from "bun"`) for all subprocesses (Git commands, etc.).

## 2. Project Architecture

### Core Components
- **`src/index.ts`**: The CLI entry point. Handles argument parsing (`cac`), interactive prompts (`@clack/prompts`), and the main logic loop.
- **`src/prompt.ts`**: Contains the `SYSTEM_PROMPT_DATA`. This is the "brain" defining the Conventional Commit schema and strict output rules.

### The Generation Loop (Generator-Discriminator Pattern)
The core feature involves a self-correcting loop:
1.  **Analyze:** `git diff` is captured.
2.  **Generate:** AI model is invoked to create a message.
3.  **Validate (Lint):** The message is checked against **Conventional Commits** rules using `@commitlint/lint`.
    *   *Note:* Config is imported directly from `@commitlint/config-conventional` to ensure portability without external config files.
4.  **Self-Correct:** If linting fails, the errors are injected back into the next AI prompt ("Regenerating with corrections...").
5.  **Approve:** Only valid messages are presented to the user.

## 3. Testing Strategy
Tests are written using **Bun's native test runner** (`bun:test`).

### Unit & Integration Testing
We test the CLI by spawning it as a subprocess.

- **Command:** `bun test`
- **File:** `tests/integration.test.ts`

### The "Fake AI" Mechanism
To test the AI logic deterministically without network calls or API costs, we use a mock script:
- **`tests/fake-ai.ts`**: A script that pretends to be the AI.
    - It reads a counter file to change behavior (1st call returns invalid message, 2nd call returns valid message).
    - It writes the received prompt to `ai-prompt.log` for assertion.
- **`tests/fake-ai.sh`**: A shell wrapper ensuring `fake-ai.ts` runs correctly via Bun in the test subprocess.

**When writing new tests:**
1.  Do NOT mock internal functions if you can verify behavior via CLI output/exit codes.
2.  Use the `fake-ai` pattern if you need to test the *interaction* with the LLM.
3.  Ensure `stderr` is captured, as CLI tools often write errors there.

## 4. Coding Conventions

### Git Operations
- Always use the `$` shell template literal.
- **Security:** When passing variable file paths, use arrays to prevent shell injection:
  ```typescript
  // BAD
  await $`git add ${files.join(" ")}`; 
  
  // GOOD
  for (const file of files) { await $`git add ${file}`; }
  // OR
  await $`git add ${files}`; // Bun handles array expansion safely
  ```

### UI/UX
- Use `@clack/prompts` for all user interactions.
- Use `picocolors` for coloring text.
- Be concise. This is a CLI tool; avoid wall-of-text outputs.

### Imports
- Use ESM imports.
- Prefer `node:` prefix for built-ins (e.g., `import * as path from "node:path"`).

## 5. Common Tasks

**Running the CLI locally:**
```bash
bun run src/index.ts
```

**Building/Release:**
(Refer to `package.json` scripts or GitHub Actions workflows).
