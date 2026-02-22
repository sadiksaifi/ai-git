# CLI Options Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor AI Git's CLI interface to unify `--setup`/`--init` into a `configure` command, extract documentation data into `@ai-git/meta`, rewrite descriptions, standardize shorthands, and rewrite the help menu.

**Architecture:** New `@ai-git/meta` package holds all CLI metadata (flags, commands, providers, error templates). CLI app imports from it and owns rendering. `configure` command is standalone (like `upgrade`), sharing a configure actor with the first-run auto-trigger path in `cliMachine`.

**Tech Stack:** TypeScript, Bun, XState v5, cac, @clack/prompts, Turborepo, oxlint/oxfmt

---

### Task 1: Create `@ai-git/meta` package scaffold

**Files:**
- Create: `packages/meta/package.json`
- Create: `packages/meta/tsconfig.json`
- Create: `packages/meta/.oxlintrc.json`
- Create: `packages/meta/.oxfmtrc.json`
- Create: `packages/meta/src/index.ts` (empty re-export barrel)
- Create: `packages/meta/src/types.ts` (empty)

**Step 1: Create `packages/meta/package.json`**

```json
{
  "name": "@ai-git/meta",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "module": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "devDependencies": {
    "@ai-git/config": "workspace:*",
    "@types/bun": "catalog:",
    "oxfmt": "catalog:",
    "oxlint": "catalog:",
    "typescript": "catalog:"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "check": "oxlint && oxfmt --check",
    "check:fix": "oxlint --fix && oxfmt --write",
    "test": "bun test"
  }
}
```

**Step 2: Create `packages/meta/tsconfig.json`**

```json
{
  "extends": "@ai-git/config/tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

**Step 3: Create `packages/meta/.oxlintrc.json`**

```json
{
  "plugins": null,
  "categories": {},
  "rules": {},
  "ignorePatterns": []
}
```

**Step 4: Create `packages/meta/.oxfmtrc.json`**

```json
{
  "ignorePatterns": []
}
```

**Step 5: Create `packages/meta/src/types.ts`**

```typescript
// ==============================================================================
// @ai-git/meta — Shared Types
// ==============================================================================

/**
 * Flag category identifier.
 */
export type FlagCategory = "model" | "workflow" | "info";

/**
 * Definition of a flag category for display.
 */
export interface FlagCategoryDef {
  key: FlagCategory;
  label: string;
  order: number;
}

/**
 * Definition of a CLI flag.
 */
export interface FlagDef {
  long: string;
  short?: string;
  arg?: string;
  description: string;
  category: FlagCategory;
}

/**
 * Definition of a CLI subcommand.
 */
export interface CommandDef {
  name: string;
  description: string;
}

/**
 * Provider type: CLI binary or HTTP API.
 */
export type ProviderType = "cli" | "api";

/**
 * Documentation metadata for a provider.
 * Consumer-agnostic — no runtime logic or rendering.
 */
export interface ProviderDoc {
  id: string;
  name: string;
  type: ProviderType;
  requirementsUrl: string;
  requirementsLabel: string;
}

/**
 * Extended documentation for CLI providers (includes install info).
 */
export interface CLIProviderDoc extends ProviderDoc {
  type: "cli";
  binary: string;
  installCommand: string;
  docsUrl: string;
}

/**
 * Error message template.
 */
export interface ErrorTemplate {
  message: string;
  suggestion: string;
}
```

**Step 6: Create `packages/meta/src/index.ts`**

```typescript
export * from "./types.ts";
```

**Step 7: Add `@ai-git/meta` as dependency to `apps/cli/package.json`**

Add to `dependencies` section:
```
"@ai-git/meta": "workspace:*"
```

**Step 8: Run `bun install` to wire workspace**

Run: `bun install`
Expected: Resolves workspace link, no errors.

**Step 9: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (empty package typechecks fine)

**Step 10: Commit**

```bash
git add packages/meta/ apps/cli/package.json bun.lock
git commit -m "feat: scaffold @ai-git/meta package"
```

---

### Task 2: Implement `@ai-git/meta` — metadata, flags, and commands

**Files:**
- Create: `packages/meta/src/meta.ts`
- Create: `packages/meta/src/flags.ts`
- Create: `packages/meta/src/commands.ts`
- Modify: `packages/meta/src/index.ts`

**Step 1: Create `packages/meta/src/meta.ts`**

```typescript
// ==============================================================================
// @ai-git/meta — CLI Metadata
// ==============================================================================

/**
 * The CLI tool name.
 */
export const CLI_NAME = "ai-git";

/**
 * The top-level CLI description.
 */
export const CLI_DESCRIPTION = "AI-powered Conventional Commits";
```

**Step 2: Create `packages/meta/src/flags.ts`**

```typescript
import type { FlagDef, FlagCategory, FlagCategoryDef } from "./types.ts";

// ==============================================================================
// @ai-git/meta — Flag Definitions
// ==============================================================================

/**
 * Ordered flag category definitions.
 */
export const FLAG_CATEGORIES: FlagCategoryDef[] = [
  { key: "model", label: "Model", order: 1 },
  { key: "workflow", label: "Workflow", order: 2 },
  { key: "info", label: "Info", order: 3 },
];

/**
 * All CLI flag definitions.
 *
 * Custom shorthands are uppercase. Framework shorthands (-v, -h) are lowercase
 * per universal CLI convention.
 */
export const FLAGS = {
  provider: {
    long: "--provider",
    arg: "<id>",
    description: "Use a specific AI provider for this run",
    category: "model" as FlagCategory,
  },
  model: {
    long: "--model",
    arg: "<id>",
    description: "Use a specific model for this run",
    category: "model" as FlagCategory,
  },
  stageAll: {
    short: "-A",
    long: "--stage-all",
    description: "Stage all changes before generating",
    category: "workflow" as FlagCategory,
  },
  commit: {
    short: "-C",
    long: "--commit",
    description: "Commit without confirmation",
    category: "workflow" as FlagCategory,
  },
  push: {
    short: "-P",
    long: "--push",
    description: "Push to remote after committing",
    category: "workflow" as FlagCategory,
  },
  hint: {
    short: "-H",
    long: "--hint",
    arg: "<text>",
    description: "Guide the AI with additional context",
    category: "workflow" as FlagCategory,
  },
  exclude: {
    short: "-X",
    long: "--exclude",
    arg: "<pattern>",
    description: "Skip files when staging (glob, regex, or path)",
    category: "workflow" as FlagCategory,
  },
  dangerouslyAutoApprove: {
    long: "--dangerously-auto-approve",
    description: "Stage, commit, and push without prompts",
    category: "workflow" as FlagCategory,
  },
  dryRun: {
    long: "--dry-run",
    description: "Preview the prompt without calling the AI",
    category: "workflow" as FlagCategory,
  },
  version: {
    short: "-v",
    long: "--version",
    description: "Show version",
    category: "info" as FlagCategory,
  },
  help: {
    short: "-h",
    long: "--help",
    description: "Show help",
    category: "info" as FlagCategory,
  },
} as const satisfies Record<string, FlagDef>;
```

**Step 3: Create `packages/meta/src/commands.ts`**

```typescript
import type { CommandDef } from "./types.ts";

// ==============================================================================
// @ai-git/meta — Command Definitions
// ==============================================================================

/**
 * CLI subcommand definitions.
 */
export const COMMANDS: Record<string, CommandDef> = {
  configure: {
    name: "configure",
    description: "Set up AI provider and model",
  },
  upgrade: {
    name: "upgrade",
    description: "Update ai-git to the latest version",
  },
};
```

**Step 4: Update `packages/meta/src/index.ts`**

```typescript
export * from "./types.ts";
export * from "./meta.ts";
export * from "./flags.ts";
export * from "./commands.ts";
```

**Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/meta/src/
git commit -m "feat(meta): add CLI metadata, flags, and command definitions"
```

---

### Task 3: Implement `@ai-git/meta` — providers and error templates

**Files:**
- Create: `packages/meta/src/providers.ts`
- Create: `packages/meta/src/errors.ts`
- Modify: `packages/meta/src/index.ts`

**Step 1: Create `packages/meta/src/providers.ts`**

```typescript
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
    installCommand: "npm install -g @anthropic-ai/claude-code",
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
    requirementsUrl: "https://ai.google.dev/gemini-api/docs/cli",
    requirementsLabel: "Install CLI",
  },
  codex: {
    id: "codex",
    name: "Codex",
    type: "cli",
    binary: "codex",
    installCommand: "npm install -g @openai/codex",
    docsUrl: "https://developers.openai.com/codex/cli",
    requirementsUrl: "https://developers.openai.com/codex/cli",
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
```

**Step 2: Create `packages/meta/src/errors.ts`**

```typescript
import type { ErrorTemplate } from "./types.ts";
import { CLI_NAME } from "./meta.ts";

// ==============================================================================
// @ai-git/meta — Error Message Templates
// ==============================================================================

/**
 * Error message templates with actionable suggestions.
 * Plain strings only — consumers handle formatting.
 */
export const ERROR_TEMPLATES = {
  noConfig: {
    message: "No configuration found.",
    suggestion: `Run: ${CLI_NAME} configure`,
  } satisfies ErrorTemplate,

  missingProvider: {
    message: "No AI provider configured.",
    suggestion: `Run: ${CLI_NAME} configure to select a provider.`,
  } satisfies ErrorTemplate,

  invalidProvider: (id: string): ErrorTemplate => ({
    message: `Unknown provider '${id}'.`,
    suggestion: `Run: ${CLI_NAME} configure to choose a valid provider.`,
  }),

  missingModel: {
    message: "No model configured.",
    suggestion: `Run: ${CLI_NAME} configure to select a model.`,
  } satisfies ErrorTemplate,

  invalidModel: (modelId: string, providerName: string): ErrorTemplate => ({
    message: `Unknown model '${modelId}' for ${providerName}.`,
    suggestion: `Run: ${CLI_NAME} configure to choose a valid model.`,
  }),

  apiKeyMissing: (providerName: string): ErrorTemplate => ({
    message: `API key for ${providerName} not found in secure storage.`,
    suggestion: `Run: ${CLI_NAME} configure to set up your API key.`,
  }),

  deprecatedModel: (displayName: string, modelId: string, providerId: string): ErrorTemplate => ({
    message: `Configured model '${displayName}' (${modelId}) is deprecated for provider '${providerId}'.`,
    suggestion: `Run: ${CLI_NAME} configure to choose a supported model.`,
  }),

  modelNotFound: (model: string): ErrorTemplate => ({
    message: `The model '${model}' was not found.`,
    suggestion: `Run: ${CLI_NAME} configure to select a different model.`,
  }),

  providerNotAvailable: (providerId: string): ErrorTemplate => ({
    message: `Provider '${providerId}' is not available.`,
    suggestion: "Check your API key configuration.",
  }),

  cliNotInstalled: (binary: string, providerName: string): ErrorTemplate => ({
    message: `'${binary}' CLI is not installed.`,
    suggestion: `The ${providerName} CLI must be installed to use AI Git.`,
  }),
} as const;
```

**Step 3: Update `packages/meta/src/index.ts`**

```typescript
export * from "./types.ts";
export * from "./meta.ts";
export * from "./flags.ts";
export * from "./commands.ts";
export * from "./providers.ts";
export * from "./errors.ts";
```

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/meta/src/
git commit -m "feat(meta): add provider documentation and error templates"
```

---

### Task 4: Implement `@ai-git/meta` — utilities

**Files:**
- Create: `packages/meta/src/utils.ts`
- Create: `packages/meta/src/utils.test.ts`
- Modify: `packages/meta/src/index.ts`

**Step 1: Create `packages/meta/src/utils.ts`**

```typescript
import type { FlagDef, FlagCategory, FlagCategoryDef } from "./types.ts";
import { FLAGS, FLAG_CATEGORIES } from "./flags.ts";

// ==============================================================================
// @ai-git/meta — Utilities
// ==============================================================================

/**
 * Get a random tip based on available flags.
 * Used by the welcome screen to show helpful hints.
 */
export function getRandomTip(): { flag: string; description: string } {
  // Only include flags that have meaningful tips (exclude info flags)
  const tippableFlags = Object.values(FLAGS).filter(
    (f) => f.category !== "info",
  ) as FlagDef[];

  const randomFlag = tippableFlags[Math.floor(Math.random() * tippableFlags.length)];

  if (!randomFlag) {
    return { flag: "--help", description: "Show help" };
  }

  return {
    flag: randomFlag.long,
    description: randomFlag.description,
  };
}

/**
 * Get flags grouped by category, ordered by category order.
 * Returns an array of { category, flags } objects.
 */
export function getFlagsByCategory(): { category: FlagCategoryDef; flags: FlagDef[] }[] {
  const allFlags = Object.values(FLAGS) as FlagDef[];

  return FLAG_CATEGORIES
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      category,
      flags: allFlags.filter((f) => f.category === category.key),
    }));
}
```

**Step 2: Write the failing test**

Create `packages/meta/src/utils.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { getRandomTip, getFlagsByCategory } from "./utils.ts";
import { FLAGS, FLAG_CATEGORIES } from "./flags.ts";

describe("getRandomTip", () => {
  test("returns an object with flag and description", () => {
    const tip = getRandomTip();
    expect(tip).toHaveProperty("flag");
    expect(tip).toHaveProperty("description");
    expect(tip.flag.startsWith("--")).toBe(true);
    expect(tip.description.length).toBeGreaterThan(0);
  });

  test("does not return info flags", () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 50; i++) {
      const tip = getRandomTip();
      expect(tip.flag).not.toBe("--version");
      expect(tip.flag).not.toBe("--help");
    }
  });
});

describe("getFlagsByCategory", () => {
  test("returns all categories in order", () => {
    const grouped = getFlagsByCategory();
    expect(grouped).toHaveLength(FLAG_CATEGORIES.length);
    expect(grouped[0]!.category.key).toBe("model");
    expect(grouped[1]!.category.key).toBe("workflow");
    expect(grouped[2]!.category.key).toBe("info");
  });

  test("every flag is included in exactly one category", () => {
    const grouped = getFlagsByCategory();
    const allGroupedFlags = grouped.flatMap((g) => g.flags);
    const allFlags = Object.values(FLAGS);
    expect(allGroupedFlags).toHaveLength(allFlags.length);
  });

  test("model category contains provider and model flags", () => {
    const grouped = getFlagsByCategory();
    const modelFlags = grouped.find((g) => g.category.key === "model")!.flags;
    const longForms = modelFlags.map((f) => f.long);
    expect(longForms).toContain("--provider");
    expect(longForms).toContain("--model");
  });

  test("workflow category contains stage-all, commit, push, etc.", () => {
    const grouped = getFlagsByCategory();
    const workflowFlags = grouped.find((g) => g.category.key === "workflow")!.flags;
    const longForms = workflowFlags.map((f) => f.long);
    expect(longForms).toContain("--stage-all");
    expect(longForms).toContain("--commit");
    expect(longForms).toContain("--push");
    expect(longForms).toContain("--hint");
    expect(longForms).toContain("--exclude");
    expect(longForms).toContain("--dangerously-auto-approve");
    expect(longForms).toContain("--dry-run");
  });

  test("info category contains version and help", () => {
    const grouped = getFlagsByCategory();
    const infoFlags = grouped.find((g) => g.category.key === "info")!.flags;
    const longForms = infoFlags.map((f) => f.long);
    expect(longForms).toContain("--version");
    expect(longForms).toContain("--help");
  });
});
```

**Step 3: Run test to verify it passes**

Run: `cd packages/meta && bun test`
Expected: PASS (implementation was written in step 1)

**Step 4: Update `packages/meta/src/index.ts`**

```typescript
export * from "./types.ts";
export * from "./meta.ts";
export * from "./flags.ts";
export * from "./commands.ts";
export * from "./providers.ts";
export * from "./errors.ts";
export * from "./utils.ts";
```

**Step 5: Run full typecheck and lint**

Run: `bun run typecheck && bun run check`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/meta/src/
git commit -m "feat(meta): add getRandomTip and getFlagsByCategory utilities"
```

---

### Task 5: Build the custom help renderer in CLI

**Files:**
- Create: `apps/cli/src/lib/help.ts`
- Create: `apps/cli/src/lib/help.test.ts`

**Step 1: Write the failing test**

Create `apps/cli/src/lib/help.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { renderHelp } from "./help.ts";

describe("renderHelp", () => {
  test("includes usage line with [command] and [options]", () => {
    const output = renderHelp();
    expect(output).toContain("$ ai-git [command] [options]");
  });

  test("includes CLI description", () => {
    const output = renderHelp();
    expect(output).toContain("AI-powered Conventional Commits");
  });

  test("includes Commands section with configure and upgrade", () => {
    const output = renderHelp();
    expect(output).toContain("Commands:");
    expect(output).toContain("configure");
    expect(output).toContain("upgrade");
  });

  test("includes Model category with provider and model flags", () => {
    const output = renderHelp();
    expect(output).toContain("Model:");
    expect(output).toContain("--provider");
    expect(output).toContain("--model");
  });

  test("includes Workflow category with all workflow flags", () => {
    const output = renderHelp();
    expect(output).toContain("Workflow:");
    expect(output).toContain("--stage-all");
    expect(output).toContain("--commit");
    expect(output).toContain("--push");
    expect(output).toContain("--hint");
    expect(output).toContain("--exclude");
    expect(output).toContain("--dangerously-auto-approve");
    expect(output).toContain("--dry-run");
  });

  test("includes Info category with version and help", () => {
    const output = renderHelp();
    expect(output).toContain("Info:");
    expect(output).toContain("--version");
    expect(output).toContain("--help");
  });

  test("shows uppercase shorthands for custom flags", () => {
    const output = renderHelp();
    expect(output).toContain("-A, --stage-all");
    expect(output).toContain("-C, --commit");
    expect(output).toContain("-P, --push");
    expect(output).toContain("-H, --hint");
    expect(output).toContain("-X, --exclude");
  });

  test("shows lowercase shorthands for standard flags", () => {
    const output = renderHelp();
    expect(output).toContain("-v, --version");
    expect(output).toContain("-h, --help");
  });

  test("does not include --setup or --init", () => {
    const output = renderHelp();
    expect(output).not.toContain("--setup");
    expect(output).not.toContain("--init");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/lib/help.test.ts`
Expected: FAIL — `help.ts` doesn't exist yet

**Step 3: Write the implementation**

Create `apps/cli/src/lib/help.ts`:

```typescript
import pc from "picocolors";
import {
  CLI_NAME,
  CLI_DESCRIPTION,
  COMMANDS,
  getFlagsByCategory,
  type FlagDef,
  type CommandDef,
} from "@ai-git/meta";

// ==============================================================================
// HELP RENDERER
// ==============================================================================

/**
 * Column width for the left side of flag/command entries.
 * Ensures aligned descriptions.
 */
const COLUMN_WIDTH = 31;

/**
 * Format a flag entry: "  -X, --flag-name <arg>       description"
 */
function formatFlag(flag: FlagDef): string {
  let left: string;
  if (flag.short) {
    left = `${flag.short}, ${flag.long}`;
  } else {
    left = `    ${flag.long}`;
  }
  if (flag.arg) {
    left += ` ${flag.arg}`;
  }
  const padding = Math.max(1, COLUMN_WIDTH - left.length);
  return `  ${left}${" ".repeat(padding)}${flag.description}`;
}

/**
 * Format a command entry: "  name                        description"
 */
function formatCommand(cmd: CommandDef): string {
  const padding = Math.max(1, COLUMN_WIDTH - cmd.name.length);
  return `  ${cmd.name}${" ".repeat(padding)}${cmd.description}`;
}

/**
 * Render the full help output.
 * All data sourced from @ai-git/meta.
 */
export function renderHelp(): string {
  const lines: string[] = [];

  // Usage
  lines.push(`${pc.bold("Usage:")}`);
  lines.push(`  $ ${CLI_NAME} [command] [options]`);
  lines.push("");

  // Description
  lines.push(CLI_DESCRIPTION);
  lines.push("");

  // Commands
  lines.push(`${pc.bold("Commands:")}`);
  for (const cmd of Object.values(COMMANDS)) {
    lines.push(formatCommand(cmd));
  }
  lines.push("");

  // Flags by category
  const grouped = getFlagsByCategory();
  for (const { category, flags } of grouped) {
    lines.push(`${pc.bold(`${category.label}:`)}`);
    for (const flag of flags) {
      lines.push(formatFlag(flag));
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/lib/help.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/lib/help.ts apps/cli/src/lib/help.test.ts
git commit -m "feat(cli): add custom help renderer sourced from @ai-git/meta"
```

---

### Task 6: Wire new help into CLI entry point and remove old flags

**Files:**
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/machines/cli.machine.ts` (CLIOptions interface)

**Step 1: Rewrite `apps/cli/src/index.ts`**

The entry point needs major changes:
- Import flags from `@ai-git/meta` instead of `./lib/flags.ts`
- Remove `--setup` and `--init` option registrations
- Add `configure` command
- Replace cac's help with custom `renderHelp()`
- Update shorthands to uppercase
- Remove `setup`/`init` from the options object passed to the machine

Replace the full file content. Key changes marked with comments:

```typescript
#!/usr/bin/env bun
import { createActor, waitFor } from "xstate";
import cac from "cac";
import pc from "picocolors";
import { VERSION } from "./version.ts";
import type { CLIOptions } from "./machines/cli.machine.ts";
import { wiredCliMachine } from "./machines/cli.wired.ts";
import { upgradeMachine } from "./machines/upgrade.machine.ts";
import { FLAGS, COMMANDS } from "@ai-git/meta";
import { renderHelp } from "./lib/help.ts";
import { runConfigureFlow } from "./lib/configure.ts";

// Suppress AI SDK warning logs (we handle errors ourselves)
(globalThis as Record<string, unknown>).AI_SDK_LOG_WARNINGS = false;

const cli = cac("ai-git");

// ── Configure Subcommand ────────────────────────────────────────────

cli.command("configure", COMMANDS.configure!.description).action(async () => {
  const exitCode = await runConfigureFlow();
  process.exit(exitCode);
});

// ── Upgrade Subcommand ───────────────────────────────────────────────

cli.command("upgrade", COMMANDS.upgrade!.description).action(async () => {
  const actor = createActor(upgradeMachine, { input: { version: VERSION } });
  actor.start();
  const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 600_000 });
  process.exit(snapshot.output!.exitCode);
});

// ── Main Command ─────────────────────────────────────────────────────

cli
  .command("")
  .option(`${FLAGS.provider.long} ${FLAGS.provider.arg}`, FLAGS.provider.description)
  .option(`${FLAGS.model.long} ${FLAGS.model.arg}`, FLAGS.model.description)
  .option(`${FLAGS.stageAll.short}, ${FLAGS.stageAll.long}`, FLAGS.stageAll.description)
  .option(`${FLAGS.commit.short}, ${FLAGS.commit.long}`, FLAGS.commit.description)
  .option(`${FLAGS.push.short}, ${FLAGS.push.long}`, FLAGS.push.description)
  .option(`${FLAGS.hint.short}, ${FLAGS.hint.long} ${FLAGS.hint.arg}`, FLAGS.hint.description)
  .option(
    `${FLAGS.exclude.short}, ${FLAGS.exclude.long} ${FLAGS.exclude.arg}`,
    FLAGS.exclude.description,
  )
  .option(FLAGS.dangerouslyAutoApprove.long, FLAGS.dangerouslyAutoApprove.description)
  .option(FLAGS.dryRun.long, FLAGS.dryRun.description)
  .option(`${FLAGS.version.short}, ${FLAGS.version.long}`, FLAGS.version.description)
  .action(async (options: CLIOptions) => {
    const actor = createActor(wiredCliMachine, {
      input: { options, version: VERSION },
    });
    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 600_000 });
    process.exit(snapshot.output!.exitCode);
  });

// ── Help ─────────────────────────────────────────────────────────────

// Suppress cac's default help output; we render our own
cli.help(() => []);

// ── Entry Point ──────────────────────────────────────────────────────

try {
  const parsed = cli.parse(process.argv, { run: false });

  if (parsed.options.version) {
    console.log(VERSION);
    process.exit(0);
  } else if (parsed.options.help) {
    console.log(renderHelp());
    process.exit(0);
  } else {
    await cli.runMatchedCommand();
  }
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Unknown option")) {
    console.error(pc.red(`Error: ${error.message}`));
    console.error(pc.dim("Use --help to see available options."));
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
}
```

**Step 2: Update `CLIOptions` in `apps/cli/src/machines/cli.machine.ts`**

Remove `setup`, `init`, `version`, `help` from CLIOptions (lines 12-31). The new interface:

```typescript
export interface CLIOptions {
  // AI configuration
  provider?: string;
  model?: string;

  // Workflow options
  stageAll: boolean;
  commit: boolean;
  push: boolean;
  dangerouslyAutoApprove: boolean;
  hint?: string;
  exclude?: string | string[];
  dryRun: boolean;
}
```

**Step 3: Remove the `init` state and `isInitFlag` guard from `cli.machine.ts`**

In `cli.machine.ts`:
- Remove `isInitFlag` guard (line 155)
- Remove `initMachine` actor stub (lines 93-96)
- Remove the `init` state (lines 236-260)
- Update `needsSetup` guard to only check `configResult?.needsSetup` (remove `context.options.setup` check, line 161)
- Update `showWelcome` state input to remove `context.options.setup` reference (line 293)
- Remove the `initContinues` guard (lines 156-159)

The `processFlags` state simplifies to:

```typescript
processFlags: {
  entry: "expandAutoApproveFlags",
  always: {
    target: "loadConfig",
  },
},
```

The `needsSetup` guard simplifies to:

```typescript
needsSetup: ({ context }) => context.configResult?.needsSetup ?? false,
```

The `showWelcome` input simplifies to:

```typescript
input: ({ context }) => ({
  version: context.version,
  configResult: context.configResult,
  needsSetup: context.configResult?.needsSetup ?? false,
}),
```

**Note:** Do NOT run tests yet — several files still reference `--setup`, `--init`, and the old flags. Those will be fixed in subsequent tasks.

**Step 4: Commit**

```bash
git add apps/cli/src/index.ts apps/cli/src/machines/cli.machine.ts
git commit -m "refactor(cli): wire @ai-git/meta flags, remove --setup/--init, simplify cliMachine"
```

---

### Task 7: Create the `configure` flow and update `cli.wired.ts`

**Files:**
- Create: `apps/cli/src/lib/configure.ts`
- Modify: `apps/cli/src/machines/cli.wired.ts`

**Step 1: Create `apps/cli/src/lib/configure.ts`**

```typescript
import { createActor, waitFor, fromPromise } from "xstate";
import { select, isCancel, log } from "@clack/prompts";
import { initMachine } from "../machines/init.machine.ts";
import { runOnboarding } from "./onboarding/index.ts";

// ==============================================================================
// CONFIGURE FLOW
// ==============================================================================

/**
 * Shared configure flow used by both `ai-git configure` command
 * and the first-run auto-trigger in cliMachine.
 *
 * Prompts user to choose Global or Project configuration,
 * then delegates to the appropriate setup flow.
 *
 * @returns exit code (0 = success, 1 = error/cancelled)
 */
export async function runConfigureFlow(): Promise<0 | 1> {
  const choice = await select({
    message: "Where do you want to configure?",
    options: [
      {
        value: "global" as const,
        label: "Global",
        hint: "~/.config/ai-git/config.json",
      },
      {
        value: "project" as const,
        label: "Project",
        hint: ".ai-git.json in current repo",
      },
    ],
  });

  if (isCancel(choice)) {
    return 1;
  }

  if (choice === "global") {
    const result = await runOnboarding({ target: "global" });
    return result.completed ? 0 : 1;
  }

  // Project: run the init machine
  const actor = createActor(initMachine, {
    input: {},
  });
  actor.start();
  const snapshot = await waitFor(actor, (s) => s.status === "done", {
    timeout: 600_000,
  });
  return snapshot.output!.exitCode;
}
```

**Step 2: Update `cli.wired.ts` — runOnboardingActor**

In `apps/cli/src/machines/cli.wired.ts`, the `runOnboardingActor` should now call `runConfigureFlow` instead of directly calling `runOnboarding`. This ensures the first-run auto-trigger shows the same Global/Project prompt.

Replace the `runOnboardingActor` implementation (lines 219-235):

```typescript
runOnboardingActor: fromPromise(async ({ input }: { input: Record<string, unknown> }) => {
  // First-run auto-trigger: show brief intro, then configure flow
  log.warn("No configuration found.");
  const { runConfigureFlow } = await import("../lib/configure.ts");
  const exitCode = await runConfigureFlow();
  return {
    completed: exitCode === 0,
    continueToRun: exitCode === 0,
  } satisfies OnboardingActorResult;
}),
```

**Step 3: Update `cli.wired.ts` — remove `initMachine` import and actor**

- Remove the `initMachine` import (line 17)
- Remove the `initMachine: initMachine` actor wiring (line 116)

**Step 4: Update `cli.wired.ts` — remove `--setup` references in loadAndResolveConfigActor**

In the `loadAndResolveConfigActor` (lines 119-196):
- Remove `options.options.setup` reference (line 150) — just check if config is missing
- Remove `result.needsSetup = options.options.setup;` (line 193) — needsSetup is always based on config completeness
- Update the input type cast to remove `setup` (line 122)

The input type becomes:
```typescript
const options = input as {
  options: { provider?: string; model?: string };
  version: string;
};
```

And line 150 changes from:
```typescript
if (!options.options.setup && bestConfig?.provider && bestConfig?.model) {
```
to:
```typescript
if (bestConfig?.provider && bestConfig?.model) {
```

And remove line 193:
```typescript
result.needsSetup = options.options.setup;
```

**Step 5: Update `cli.wired.ts` — replace `--setup` strings with `configure`**

Replace all remaining `--setup` references in the file:
- Line 85: `"Run \`ai-git --setup\` to select a supported model."` → `"Run \`ai-git configure\` to select a supported model."`
- Line 158: `"Run \`ai-git --setup\` to select a valid provider."` → `"Run \`ai-git configure\` to select a valid provider."`
- Line 168: `"Run \`ai-git --setup\` to select a valid model."` → `"Run \`ai-git configure\` to select a valid model."`
- Line 278: `"  ai-git --setup"` → `"  ai-git configure"`

**Step 6: Commit**

```bash
git add apps/cli/src/lib/configure.ts apps/cli/src/machines/cli.wired.ts
git commit -m "feat(cli): add configure flow, update cliMachine wiring for first-run"
```

---

### Task 8: Update all `--setup`/`--init` references across the codebase

**Files:**
- Modify: `apps/cli/src/lib/onboarding/constants.ts`
- Modify: `apps/cli/src/lib/onboarding/index.ts`
- Modify: `apps/cli/src/lib/generation.ts`
- Modify: `apps/cli/src/config.ts`
- Modify: `apps/cli/src/providers/api/utils.ts`
- Modify: `apps/cli/src/providers/api/models/validation.ts`

**Step 1: Update `apps/cli/src/lib/onboarding/constants.ts`**

This file's `ERROR_MESSAGES` are being replaced by `@ai-git/meta`'s `ERROR_TEMPLATES`. But the `INSTALL_INFO` constant is still used by the wizard. Since `@ai-git/meta` now has provider docs with install info, we can import from there instead.

Rewrite `constants.ts` to import from `@ai-git/meta`:

```typescript
// ==============================================================================
// ONBOARDING CONSTANTS
// Imports from @ai-git/meta for consistency. Re-exports for local convenience.
// ==============================================================================

import { ERROR_TEMPLATES, PROVIDERS, isCLIProviderDoc } from "@ai-git/meta";

/**
 * Installation information for CLI tools.
 * Derived from @ai-git/meta provider docs.
 */
export function getInstallInfo(providerId: string) {
  const doc = PROVIDERS[providerId];
  if (!doc || !isCLIProviderDoc(doc)) return undefined;
  return {
    name: doc.name,
    binary: doc.binary,
    installCommand: doc.installCommand,
    docsUrl: doc.docsUrl,
  };
}

/**
 * Error message templates. Re-exported from @ai-git/meta.
 */
export { ERROR_TEMPLATES as ERROR_MESSAGES };
```

**Step 2: Update `apps/cli/src/lib/onboarding/index.ts`**

Line 58: Replace `"Run ai-git --setup to try again"` with `"Run ai-git configure to try again"`:

```typescript
outro(pc.dim("Run ai-git configure to try again"));
```

**Step 3: Update `apps/cli/src/lib/generation.ts`**

Line 272: Replace `'ai-git --setup'` with `'ai-git configure'`:
```typescript
console.error(pc.dim(`Try running 'ai-git configure' to select a different model.`));
```

Line 280: Replace `'ai-git --setup'` with `'ai-git configure'`:
```typescript
console.error(pc.dim("  - Try a different model (run: ai-git configure)"));
```

**Step 4: Update `apps/cli/src/config.ts`**

Line 286: Replace `"ai-git --setup"` with `"ai-git configure"`:
```typescript
throw new Error("Configuration is incomplete. Please run: ai-git configure");
```

**Step 5: Update `apps/cli/src/providers/api/utils.ts`**

Line 27: Replace `'ai-git --setup'` with `'ai-git configure'`:
```typescript
`No API key found for ${providerId}. ` + `Run 'ai-git configure' to configure your API key.`,
```

**Step 6: Update `apps/cli/src/providers/api/models/validation.ts`**

Line 23: Replace `'ai-git --setup'` with `'ai-git configure'`:
```typescript
`Run 'ai-git configure' to choose a supported model.`,
```

**Step 7: Commit**

```bash
git add apps/cli/src/lib/onboarding/constants.ts apps/cli/src/lib/onboarding/index.ts \
  apps/cli/src/lib/generation.ts apps/cli/src/config.ts \
  apps/cli/src/providers/api/utils.ts apps/cli/src/providers/api/models/validation.ts
git commit -m "refactor(cli): replace all --setup/--init references with configure"
```

---

### Task 9: Delete old `flags.ts` and update imports

**Files:**
- Delete: `apps/cli/src/lib/flags.ts`
- Modify: `apps/cli/src/lib/ui/welcome.ts` (update import)
- Modify: any other files that import from `./lib/flags.ts`

**Step 1: Search for all imports of `flags.ts`**

Run: `grep -rn "from.*flags" apps/cli/src/` (excluding test files and node_modules)

Expected imports to find:
- `apps/cli/src/index.ts` (already updated in Task 6)
- `apps/cli/src/lib/ui/welcome.ts` (imports `getRandomTip`)

**Step 2: Update `apps/cli/src/lib/ui/welcome.ts`**

Replace the import:
```typescript
// Old: import { getRandomTip } from "../flags.ts";
// New:
import { getRandomTip } from "@ai-git/meta";
```

**Step 3: Delete `apps/cli/src/lib/flags.ts`**

```bash
rm apps/cli/src/lib/flags.ts
```

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (all imports resolved)

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(cli): delete flags.ts, import from @ai-git/meta"
```

---

### Task 10: Update tests

**Files:**
- Modify: `apps/cli/src/machines/cli.machine.test.ts`
- Modify: `apps/cli/src/index.test.ts`
- Modify: any other test files that reference `--setup`, `--init`, or old shorthands

**Step 1: Update `apps/cli/src/machines/cli.machine.test.ts`**

The `defaultOptions()` helper needs `setup` and `init` removed. The test for `--init` and `--setup` need to be removed/rewritten.

Update `defaultOptions()`:
```typescript
const defaultOptions = (): CLIInput["options"] => ({
  provider: undefined,
  model: undefined,
  stageAll: false,
  commit: false,
  push: false,
  dangerouslyAutoApprove: false,
  dryRun: false,
});
```

Remove these tests:
- `"--init invokes init machine"` (lines 115-136) — `--init` is gone
- `"--init with continue=true proceeds to normal flow"` (lines 139-158) — `--init` is gone

Update `"--setup flag triggers setup wizard"` test (lines 229-256):
- Remove `setup: true` from input
- Instead, make `loadAndResolveConfigActor` return `needsSetup: true` (it already does)
- Rename test to `"needsSetup triggers onboarding"`
- Remove `input: defaultInput({ setup: true })` and use `input: defaultInput()`

Update `"onboarding not completed exits with code 1"` test:
- Same: remove `setup: true`

Update `"onboarding completes and continues to normal flow"` test:
- Same: remove `setup: true`

**Step 2: Update `apps/cli/src/index.test.ts`**

Line 146: Update help test to match new format:
```typescript
expect(result.stdout).toContain("$ ai-git [command] [options]");
expect(result.stdout).not.toContain("Options:");  // replaced with category labels
expect(result.stdout).toContain("Commands:");
expect(result.stdout).toContain("configure");
```

Lines 258-259: Update deprecated model test assertion:
```typescript
expect(result.stderr).toContain("ai-git configure");
// Remove: expect(result.stderr).toContain("ai-git --setup");
```

Lines 339-357: Update `it.each` test for invalid models:
```typescript
expect(result.stderr).toContain("configure");
// Remove: expect(result.stderr).toContain("--setup");
```

Lines 185-186: Update dry-run shorthand `-a` to `-A`:
```typescript
const result = await runCLI(["--dry-run", "-A"], {
```

Line 272: Same for auto-migrate test:
```typescript
const result = await runCLI(["--dry-run", "-A"], {
```

Line 309: Same for effort-based model test:
```typescript
const result = await runCLI(["--dry-run", "-A"], {
```

Line 329: Same for haiku model test:
```typescript
const result = await runCLI(["--dry-run", "-A"], {
```

**Step 3: Run tests**

Run: `bun test`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/cli/src/machines/cli.machine.test.ts apps/cli/src/index.test.ts
git commit -m "test: update tests for configure command and new flag shorthands"
```

---

### Task 11: Update onboarding constants consumers

**Files:**
- Modify: `apps/cli/src/lib/onboarding/wizard.ts` (if it references INSTALL_INFO directly)
- Modify: `apps/cli/src/lib/onboarding/diagnostics.ts` (if it references ERROR_MESSAGES or INSTALL_INFO)

**Step 1: Check and update `wizard.ts` imports**

The wizard imports `INSTALL_INFO` from `./constants.ts`. Since Task 8 changed `constants.ts` to export `getInstallInfo()` instead, update the wizard to use the function.

Search for `INSTALL_INFO` usage in `wizard.ts` and update to use `getInstallInfo(providerId)`.

**Step 2: Check and update `diagnostics.ts` imports**

The diagnostics file imports `ERROR_MESSAGES` and `INSTALL_INFO` from `./constants.ts`. Update to use the re-exported `ERROR_MESSAGES` (now `ERROR_TEMPLATES`) and `getInstallInfo()`.

**Step 3: Run tests**

Run: `bun test`
Expected: PASS

**Step 4: Run typecheck and lint**

Run: `bun run typecheck && bun run check`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/lib/onboarding/
git commit -m "refactor(cli): update onboarding to use @ai-git/meta via constants re-exports"
```

---

### Task 12: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update CLI reference block (lines 68-89)**

Replace with the new help output:

```
$ ai-git --help
Usage:
  $ ai-git [command] [options]

AI-powered Conventional Commits

Commands:
  configure                    Set up AI provider and model
  upgrade                      Update ai-git to the latest version

Model:
  --provider <id>              Use a specific AI provider for this run
  --model <id>                 Use a specific model for this run

Workflow:
  -A, --stage-all              Stage all changes before generating
  -C, --commit                 Commit without confirmation
  -P, --push                   Push to remote after committing
  -H, --hint <text>            Guide the AI with additional context
  -X, --exclude <pattern>      Skip files when staging (glob, regex, or path)
  --dangerously-auto-approve   Stage, commit, and push without prompts
  --dry-run                    Preview the prompt without calling the AI

Info:
  -v, --version                Show version
  -h, --help                   Show help
```

**Step 2: Update Quick Start section (lines 56-62)**

Replace:
```markdown
> **Reconfigure:** `ai-git configure`
> **Self-update:** `ai-git upgrade`
```

**Step 3: Update provider table footer (line 129)**

Replace `Configure with \`ai-git --setup\`` with `Configure with \`ai-git configure\``

**Step 4: Update examples for new shorthands (lines 93-114)**

- `-a` → `-A` in all examples
- Ensure model examples use sensible model IDs

**Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README with new CLI reference and configure command"
```

---

### Task 13: Update root CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add `@ai-git/meta` to monorepo structure table (line 13)**

Add row after `packages/config`:

```markdown
| `packages/meta` | Shared CLI metadata, flag/command definitions, provider docs (`@ai-git/meta`) |
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add @ai-git/meta to monorepo structure table"
```

---

### Task 14: Final verification

**Step 1: Run full typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 2: Run full lint**

Run: `bun run check`
Expected: PASS (may need `bun run check:fix` first)

**Step 3: Run all tests**

Run: `bun test`
Expected: All tests PASS

**Step 4: Manual smoke test — help output**

Run: `cd apps/cli && bun run src/index.ts -- --help`
Expected: Displays the grouped help output matching the design.

**Step 5: Manual smoke test — unknown option**

Run: `cd apps/cli && bun run src/index.ts -- --setup`
Expected: `Error: Unknown option: --setup`

Run: `cd apps/cli && bun run src/index.ts -- --init`
Expected: `Error: Unknown option: --init`

**Step 6: Manual smoke test — version**

Run: `cd apps/cli && bun run src/index.ts -- --version`
Expected: Prints version string

**Step 7: Verify no remaining --setup/--init references**

Run: `grep -rn "\-\-setup\|\-\-init" apps/cli/src/ --include="*.ts" | grep -v test | grep -v node_modules`
Expected: No matches (except possibly in test files that verify it's gone)

**Step 8: Fix any remaining issues, commit if needed**

```bash
git add -A
git commit -m "chore: final cleanup for CLI options refactor"
```

---

## Task Dependency Graph

```
Task 1 (scaffold)
  └─ Task 2 (meta, flags, commands)
       └─ Task 3 (providers, errors)
            └─ Task 4 (utilities + tests)
                 ├─ Task 5 (help renderer)
                 │    └─ Task 6 (wire index.ts + update CLIOptions)
                 │         └─ Task 7 (configure flow + cli.wired.ts)
                 │              └─ Task 8 (update --setup/--init references)
                 │                   ├─ Task 9 (delete flags.ts)
                 │                   ├─ Task 10 (update tests)
                 │                   └─ Task 11 (update onboarding consumers)
                 │                        └─ Task 12 (README)
                 │                             └─ Task 13 (CLAUDE.md)
                 │                                  └─ Task 14 (final verification)
                 └─ (parallel branch possible for Tasks 5-7 vs Tasks 8-9)
```

## Notes for Implementer

1. **`bun install` after Task 1** — workspace link must be established before imports work.
2. **Tests will fail between Tasks 6 and 10** — this is expected. The machine interface changes before tests are updated.
3. **The `initMachine` is NOT deleted** — it's still used by the `configure` flow for the "Project" path. It's just no longer invoked directly from `cliMachine`.
4. **The onboarding `constants.ts` rewrite (Task 8)** may cause cascading type errors in `wizard.ts` and `diagnostics.ts`. Fix those in Task 11.
5. **oxfmt may reformat files** — run `bun run check:fix` after each task to keep formatting clean. Only commit formatting changes alongside the feature change.
6. **`apps/cli/AGENTS.md`** — this is a symlink to CLAUDE.md. It will update automatically when CLAUDE.md is updated. But also check the content of `apps/cli/AGENTS.md` for any `--setup`/`--init` references that need updating (it's a separate file with its own CLI architecture docs).
