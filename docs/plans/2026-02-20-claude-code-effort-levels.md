# Claude Code Effort-Level Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add effort-level support (low/medium/high) to the claude-code CLI provider using virtual model IDs, matching the existing Codex pattern.

**Architecture:** Introduce virtual model IDs with effort suffixes (`sonnet-low`, `opus-high`, etc.) that are parsed by the claude-code adapter to invoke `claude -p --model <base> --effort <level>`. Plain model IDs (`sonnet`, `haiku`, `opus`) remain valid and don't pass `--effort`. A config migration system runs at load time to handle legacy properties and future model ID changes.

**Tech Stack:** TypeScript, Bun runtime, Bun test runner

---

### Task 1: Add `parseClaudeModelId()` function with tests

**Files:**
- Create: `apps/cli/src/providers/cli/claude-code.test.ts`
- Modify: `apps/cli/src/providers/cli/claude-code.ts`

**Step 1: Write the failing test**

Create `apps/cli/src/providers/cli/claude-code.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { parseClaudeModelId } from "./claude-code.ts";

describe("parseClaudeModelId", () => {
  it("should parse sonnet-low", () => {
    expect(parseClaudeModelId("sonnet-low")).toEqual({
      model: "sonnet",
      effort: "low",
    });
  });

  it("should parse sonnet-medium", () => {
    expect(parseClaudeModelId("sonnet-medium")).toEqual({
      model: "sonnet",
      effort: "medium",
    });
  });

  it("should parse sonnet-high", () => {
    expect(parseClaudeModelId("sonnet-high")).toEqual({
      model: "sonnet",
      effort: "high",
    });
  });

  it("should parse opus-low", () => {
    expect(parseClaudeModelId("opus-low")).toEqual({
      model: "opus",
      effort: "low",
    });
  });

  it("should parse opus-high", () => {
    expect(parseClaudeModelId("opus-high")).toEqual({
      model: "opus",
      effort: "high",
    });
  });

  it("should return plain model without effort for sonnet", () => {
    expect(parseClaudeModelId("sonnet")).toEqual({
      model: "sonnet",
    });
  });

  it("should return plain model without effort for haiku", () => {
    expect(parseClaudeModelId("haiku")).toEqual({
      model: "haiku",
    });
  });

  it("should return plain model without effort for opus", () => {
    expect(parseClaudeModelId("opus")).toEqual({
      model: "opus",
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/providers/cli/claude-code.test.ts`
Expected: FAIL — `parseClaudeModelId` is not exported from `./claude-code.ts`

**Step 3: Write minimal implementation**

Add to `apps/cli/src/providers/cli/claude-code.ts` (before the adapter export):

```typescript
type ClaudeEffortLevel = "low" | "medium" | "high";

/**
 * Parse a virtual Claude model ID into its base model and optional effort level.
 * e.g. "sonnet-high" → { model: "sonnet", effort: "high" }
 * Falls back to using the full ID as model with no effort.
 */
export function parseClaudeModelId(virtualId: string): {
  model: string;
  effort?: ClaudeEffortLevel;
} {
  const match = virtualId.match(/^(.+)-(low|medium|high)$/);
  if (match?.[1] && match[2]) {
    return { model: match[1], effort: match[2] as ClaudeEffortLevel };
  }
  return { model: virtualId };
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/providers/cli/claude-code.test.ts`
Expected: PASS — all 8 tests pass

**Step 5: Commit**

```bash
git add apps/cli/src/providers/cli/claude-code.ts apps/cli/src/providers/cli/claude-code.test.ts
git commit -m "feat(claude-code): add virtual model ID parser for effort levels"
```

---

### Task 2: Update claude-code adapter to pass `--effort` flag

**Files:**
- Modify: `apps/cli/src/providers/cli/claude-code.ts`
- Modify: `apps/cli/src/providers/cli/claude-code.test.ts`

**Step 1: Write the failing test**

Add to `apps/cli/src/providers/cli/claude-code.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { parseClaudeModelId } from "./claude-code.ts";

// ... existing parseClaudeModelId tests ...

describe("claudeCodeAdapter.invoke", () => {
  let spawnCalls: { cmd: string[]; opts: unknown }[] = [];
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    spawnCalls = [];
    originalSpawn = Bun.spawn;

    // Mock Bun.spawn to capture arguments
    (Bun as any).spawn = (cmd: string[], opts: unknown) => {
      spawnCalls.push({ cmd, opts });
      // Return a mock process
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("feat: test commit"));
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        exited: Promise.resolve(0),
      };
    };
  });

  afterEach(() => {
    (Bun as any).spawn = originalSpawn;
  });

  it("should pass --effort flag for effort-based model IDs", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "sonnet-high",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0].cmd;
    expect(cmd).toContain("--effort");
    expect(cmd).toContain("high");
    // Base model should be "sonnet", not "sonnet-high"
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("sonnet");
  });

  it("should NOT pass --effort flag for plain model IDs", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "sonnet",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0].cmd;
    expect(cmd).not.toContain("--effort");
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("sonnet");
  });

  it("should NOT pass --effort flag for haiku", async () => {
    const { claudeCodeAdapter } = await import("./claude-code.ts");
    await claudeCodeAdapter.invoke({
      model: "haiku",
      system: "test system",
      prompt: "test prompt",
    });

    expect(spawnCalls).toHaveLength(1);
    const cmd = spawnCalls[0].cmd;
    expect(cmd).not.toContain("--effort");
    const modelIndex = cmd.indexOf("--model");
    expect(cmd[modelIndex + 1]).toBe("haiku");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/providers/cli/claude-code.test.ts`
Expected: FAIL — adapter doesn't use `parseClaudeModelId` yet, so `--effort` is never passed

**Step 3: Update adapter implementation**

Replace the `invoke` method in `apps/cli/src/providers/cli/claude-code.ts`:

```typescript
export const claudeCodeAdapter: CLIProviderAdapter = {
  providerId: "claude-code",
  mode: "cli",
  binary: "claude",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const { model: baseModel, effort } = parseClaudeModelId(model);

    const args = [
      "claude",
      "-p",
      "--model", baseModel,
      "--system-prompt", system,
      "--tools", "",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--strict-mcp-config",
    ];

    if (effort) {
      args.push("--effort", effort);
    }

    args.push(prompt);

    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`Claude CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return stdout;
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("claude"));
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/providers/cli/claude-code.test.ts`
Expected: PASS — all tests pass

**Step 5: Commit**

```bash
git add apps/cli/src/providers/cli/claude-code.ts apps/cli/src/providers/cli/claude-code.test.ts
git commit -m "feat(claude-code): pass --effort flag for effort-based virtual model IDs"
```

---

### Task 3: Update provider registry with effort model variants

**Files:**
- Modify: `apps/cli/src/providers/registry.ts`

**Step 1: Write the failing test**

Add to `apps/cli/src/providers/cli/claude-code.test.ts`:

```typescript
import { getProviderById, getModelIds } from "../../providers/registry.ts";

describe("claude-code registry", () => {
  it("should include effort variants for sonnet", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).toContain("sonnet-low");
    expect(modelIds).toContain("sonnet-medium");
    expect(modelIds).toContain("sonnet-high");
  });

  it("should include effort variants for opus", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).toContain("opus-low");
    expect(modelIds).toContain("opus-medium");
    expect(modelIds).toContain("opus-high");
  });

  it("should keep backward-compatible plain model IDs", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).toContain("sonnet");
    expect(modelIds).toContain("haiku");
    expect(modelIds).toContain("opus");
  });

  it("should NOT include effort variants for haiku", () => {
    const modelIds = getModelIds("claude-code");
    expect(modelIds).not.toContain("haiku-low");
    expect(modelIds).not.toContain("haiku-medium");
    expect(modelIds).not.toContain("haiku-high");
  });

  it("should have sonnet-low as the default model", () => {
    const provider = getProviderById("claude-code");
    const defaultModel = provider?.models.find((m) => m.isDefault);
    expect(defaultModel?.id).toBe("sonnet-low");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/providers/cli/claude-code.test.ts`
Expected: FAIL — effort variants don't exist in registry yet

**Step 3: Update registry**

In `apps/cli/src/providers/registry.ts`, replace the `claude-code` provider entry:

```typescript
  {
    id: "claude-code",
    name: "Claude Code",
    mode: "cli",
    binary: "claude",
    models: [
      // sonnet (low, medium, high)
      { id: "sonnet-low", name: "Claude Sonnet (low)", isDefault: true },
      { id: "sonnet-medium", name: "Claude Sonnet (medium)" },
      { id: "sonnet-high", name: "Claude Sonnet (high)" },
      // opus (low, medium, high)
      { id: "opus-low", name: "Claude Opus (low)" },
      { id: "opus-medium", name: "Claude Opus (medium)" },
      { id: "opus-high", name: "Claude Opus (high)" },
      // plain model IDs (backward compatibility, no --effort passed)
      { id: "sonnet", name: "Claude Sonnet" },
      { id: "haiku", name: "Claude Haiku" },
      { id: "opus", name: "Claude Opus" },
    ],
  },
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/providers/cli/claude-code.test.ts`
Expected: PASS — all registry tests pass

**Step 5: Commit**

```bash
git add apps/cli/src/providers/registry.ts apps/cli/src/providers/cli/claude-code.test.ts
git commit -m "feat(registry): add claude-code effort-level virtual model IDs"
```

---

### Task 4: Add config migration system

**Files:**
- Create: `apps/cli/src/lib/migration.ts`
- Create: `apps/cli/src/lib/migration.test.ts`
- Modify: `apps/cli/src/config.ts`

**Step 1: Write the failing test**

Create `apps/cli/src/lib/migration.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { migrateConfig, type MigrationResult } from "./migration.ts";

describe("migrateConfig", () => {
  it("should strip legacy 'mode' property", () => {
    const raw = { provider: "claude-code", model: "sonnet", mode: "cli" };
    const result = migrateConfig(raw);
    expect(result.config).toEqual({ provider: "claude-code", model: "sonnet" });
    expect(result.changed).toBe(true);
  });

  it("should migrate plain claude-code model IDs to effort defaults", () => {
    const raw = { provider: "claude-code", model: "sonnet" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("sonnet-low");
    expect(result.changed).toBe(true);
  });

  it("should migrate opus to opus-low", () => {
    const raw = { provider: "claude-code", model: "opus" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("opus-low");
    expect(result.changed).toBe(true);
  });

  it("should NOT migrate haiku (no effort support)", () => {
    const raw = { provider: "claude-code", model: "haiku" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("haiku");
    expect(result.changed).toBe(false);
  });

  it("should NOT migrate already-effort model IDs", () => {
    const raw = { provider: "claude-code", model: "sonnet-high" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("sonnet-high");
    expect(result.changed).toBe(false);
  });

  it("should NOT migrate non-claude-code providers", () => {
    const raw = { provider: "codex", model: "gpt-5.3-codex-low" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("gpt-5.3-codex-low");
    expect(result.changed).toBe(false);
  });

  it("should handle both mode removal and model migration together", () => {
    const raw = { provider: "claude-code", model: "sonnet", mode: "cli" };
    const result = migrateConfig(raw);
    expect(result.config).toEqual({ provider: "claude-code", model: "sonnet-low" });
    expect(result.changed).toBe(true);
    expect((result.config as any).mode).toBeUndefined();
  });

  it("should preserve other config properties", () => {
    const raw = {
      provider: "claude-code",
      model: "sonnet",
      defaults: { stageAll: true },
      prompt: { context: "test" },
      editor: "vim",
    };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("sonnet-low");
    expect(result.config.defaults).toEqual({ stageAll: true });
    expect(result.config.prompt).toEqual({ context: "test" });
    expect(result.config.editor).toBe("vim");
  });

  it("should return unchanged for a fully valid config", () => {
    const raw = { provider: "gemini-cli", model: "gemini-3-flash-preview" };
    const result = migrateConfig(raw);
    expect(result.config).toEqual(raw);
    expect(result.changed).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/cli && bun test src/lib/migration.test.ts`
Expected: FAIL — module `./migration.ts` does not exist

**Step 3: Write the migration module**

Create `apps/cli/src/lib/migration.ts`:

```typescript
import type { UserConfig } from "../config.ts";

/**
 * Claude Code models that support effort levels.
 * Plain IDs for these models are migrated to their default effort variant.
 */
const CLAUDE_EFFORT_MODEL_MIGRATION: Record<string, string> = {
  sonnet: "sonnet-low",
  opus: "opus-low",
};

export interface MigrationResult {
  config: UserConfig;
  changed: boolean;
}

/**
 * Migrate a raw config object to the current format.
 * Runs at config load time to ensure existing configs stay valid.
 *
 * Migrations:
 * 1. Strip legacy 'mode' property
 * 2. Migrate plain claude-code model IDs to effort defaults (sonnet → sonnet-low)
 */
export function migrateConfig(raw: Record<string, unknown>): MigrationResult {
  let changed = false;
  const config = { ...raw };

  // Migration 1: Strip legacy 'mode' property
  if ("mode" in config) {
    delete config.mode;
    changed = true;
  }

  // Migration 2: Migrate plain claude-code model IDs to effort defaults
  if (
    config.provider === "claude-code" &&
    typeof config.model === "string" &&
    config.model in CLAUDE_EFFORT_MODEL_MIGRATION
  ) {
    config.model = CLAUDE_EFFORT_MODEL_MIGRATION[config.model];
    changed = true;
  }

  return { config: config as UserConfig, changed };
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/cli && bun test src/lib/migration.test.ts`
Expected: PASS — all 9 tests pass

**Step 5: Integrate migration into config loading**

In `apps/cli/src/config.ts`:

Add import at top:
```typescript
import { migrateConfig } from "./lib/migration.ts";
```

Replace `loadUserConfig()`:
```typescript
export async function loadUserConfig(): Promise<UserConfig | undefined> {
  try {
    const file = Bun.file(CONFIG_FILE);
    const exists = await file.exists();
    if (!exists) {
      return undefined;
    }
    const content = await file.text();
    const raw = JSON.parse(content);

    const { config, changed } = migrateConfig(raw);
    if (changed) {
      await saveUserConfig(config);
    }

    return config;
  } catch {
    return undefined;
  }
}
```

Replace `loadProjectConfig()`:
```typescript
export async function loadProjectConfig(): Promise<UserConfig | undefined> {
  try {
    const configPath = await getProjectConfigPath();
    const file = Bun.file(configPath);
    const exists = await file.exists();
    if (!exists) {
      return undefined;
    }
    const content = await file.text();
    const raw = JSON.parse(content);

    const { config, changed } = migrateConfig(raw);
    if (changed) {
      await saveProjectConfig(config);
    }

    return config;
  } catch {
    return undefined;
  }
}
```

Remove the legacy `mode` stripping from `saveUserConfig()` — change:
```typescript
  // Remove legacy 'mode' property if present (migration)
  const { mode: _legacyMode, ...cleanConfig } = config as UserConfig & { mode?: unknown };
```
to:
```typescript
  const cleanConfig = config;
```

Remove the legacy `mode` stripping from `saveProjectConfig()` — same change as above.

**Step 6: Run all tests to verify nothing broke**

Run: `cd apps/cli && bun test`
Expected: PASS — all tests pass

**Step 7: Commit**

```bash
git add apps/cli/src/lib/migration.ts apps/cli/src/lib/migration.test.ts apps/cli/src/config.ts
git commit -m "feat(config): add startup migration for legacy configs and effort model defaults"
```

---

### Task 5: Update schema.json

**Files:**
- Modify: `schema.json`

**Step 1: Update the claude-code model enum**

In `schema.json`, find the `claude-code` conditional block and replace the `model` `enum`:

```json
{
  "if": {
    "properties": {
      "provider": {
        "const": "claude-code"
      }
    }
  },
  "then": {
    "properties": {
      "model": {
        "enum": [
          "sonnet-low",
          "sonnet-medium",
          "sonnet-high",
          "opus-low",
          "opus-medium",
          "opus-high",
          "haiku"
        ],
        "description": "Claude Code virtual model ID. Effort levels: low, medium, high. Format: '<base>-<effort>'. 'sonnet-low' is recommended for speed and cost. 'haiku' has no effort levels."
      }
    }
  }
}
```

Also update the top-level `model` examples to include claude-code effort models:

```json
"examples": [
  "sonnet-low",
  "sonnet-high",
  "opus-low",
  "haiku",
  "gemini-3-flash-preview",
  "gpt-5.3-codex-low",
  "gpt-5.2-codex-high",
  "gpt-5.1-codex-max-medium",
  "openai/gpt-5.3-codex",
  "claude-sonnet-4-6"
]
```

**Step 2: Verify schema is valid JSON**

Run: `cd /Users/sdk/Projects/ai-git && bun -e "JSON.parse(require('fs').readFileSync('schema.json','utf8')); console.log('valid')"`
Expected: `valid`

**Step 3: Commit**

```bash
git add schema.json
git commit -m "feat(schema): add claude-code effort-level model IDs to config schema"
```

---

### Task 6: Integration tests

**Files:**
- Modify: `apps/cli/src/index.test.ts`

**Step 1: Add integration test for migrated config backward compatibility**

Add to the existing `describe("ai-git CLI", ...)` block in `apps/cli/src/index.test.ts`:

```typescript
  it("should auto-migrate legacy claude-code config and run dry-run", async () => {
    // Create a config with the old plain "sonnet" model ID
    const homeDir = createTestHome({
      provider: "claude-code",
      model: "sonnet",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    fs.writeFileSync(path.join(repoDir, "README.md"), "updated\n");

    const result = await runCLI(["--dry-run", "-a"], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    // Should work (migration converts "sonnet" → "sonnet-low")
    expect(result.stdout).toContain("DRY RUN: SYSTEM PROMPT");
    expect(result.exitCode).toBe(0);

    // Verify config was migrated on disk
    const configPath = path.join(homeDir, ".config", "ai-git", "config.json");
    const migratedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(migratedConfig.model).toBe("sonnet-low");
  });

  it("should work with effort-based model IDs in dry-run", async () => {
    const homeDir = createTestHome({
      provider: "claude-code",
      model: "sonnet-high",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    fs.writeFileSync(path.join(repoDir, "README.md"), "updated\n");

    const result = await runCLI(["--dry-run", "-a"], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stdout).toContain("DRY RUN: SYSTEM PROMPT");
    expect(result.exitCode).toBe(0);
  });

  it("should work with haiku model ID (no effort)", async () => {
    const homeDir = createTestHome({
      provider: "claude-code",
      model: "haiku",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    fs.writeFileSync(path.join(repoDir, "README.md"), "updated\n");

    const result = await runCLI(["--dry-run", "-a"], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    expect(result.stdout).toContain("DRY RUN: SYSTEM PROMPT");
    expect(result.exitCode).toBe(0);
  });

  it("should reject invalid effort model like haiku-high", async () => {
    const homeDir = createTestHome({
      provider: "claude-code",
      model: "haiku-high",
    });
    const noProviderPath = await createPathWithoutProviderCLI();
    const repoDir = createGitRepo();

    const result = await runCLI([], {
      cwd: repoDir,
      homeDir,
      pathEnv: noProviderPath,
    });

    // Config validation should fail because haiku-high is not in the registry
    expect(result.stderr).toContain("incomplete");
    expect(result.exitCode).toBe(1);
  });
```

**Step 2: Run integration tests**

Run: `cd apps/cli && bun test src/index.test.ts`
Expected: PASS — all tests pass (existing + new)

**Step 3: Run full test suite**

Run: `cd apps/cli && bun test`
Expected: PASS — all tests across the project pass

**Step 4: Commit**

```bash
git add apps/cli/src/index.test.ts
git commit -m "test: add integration tests for claude-code effort levels and config migration"
```

---

### Task 7: Run typecheck and final validation

**Files:** None (validation only)

**Step 1: Run typecheck**

Run: `cd apps/cli && bun run typecheck`
Expected: No type errors

**Step 2: Run full test suite**

Run: `cd apps/cli && bun test`
Expected: All tests pass

**Step 3: Test dry-run manually with effort model**

Run: `cd apps/cli && bun start --dry-run -a -M sonnet-high`
Expected: Dry run output showing system and user prompts

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: fixups from final validation"
```
