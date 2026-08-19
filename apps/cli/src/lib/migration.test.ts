import { describe, it, expect } from "bun:test";
import { migrateConfig, migrateLegacyGeminiCliConfig, migrations } from "./migration.ts";

describe("migrations registry", () => {
  it("should have unique IDs", () => {
    const ids = migrations.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every migration should have id, description, and migrate", () => {
    for (const m of migrations) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.description).toBe("string");
      expect(m.description.length).toBeGreaterThan(0);
      expect(typeof m.migrate).toBe("function");
    }
  });
});

describe("migrateConfig", () => {
  it("should strip legacy 'mode' property", () => {
    const raw = { provider: "gemini-cli", model: "gemini-3-flash-preview", mode: "cli" };
    const result = migrateConfig(raw);
    expect(result.config).toEqual({ provider: "gemini-cli", model: "gemini-3-flash-preview" });
    expect(result.changed).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toContain("mode");
  });

  it("should migrate plain claude-code model IDs to effort defaults", () => {
    const raw = { provider: "claude-code", model: "sonnet" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("sonnet-low");
    expect(result.changed).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toContain("sonnet");
  });

  it("should migrate opus to opus-low", () => {
    const raw = { provider: "claude-code", model: "opus" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("opus-low");
    expect(result.changed).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toContain("opus");
  });

  it("should NOT migrate haiku (no effort support)", () => {
    const raw = { provider: "claude-code", model: "haiku" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("haiku");
    expect(result.changed).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it("should NOT migrate already-effort model IDs", () => {
    const raw = { provider: "claude-code", model: "sonnet-high" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("sonnet-high");
    expect(result.changed).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it("should NOT apply Codex model migration to another provider", () => {
    const raw = { provider: "openai", model: "gpt-5.3-codex-low" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("gpt-5.3-codex-low");
    expect(result.changed).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  const codexFamilyMigrations = [
    ["gpt-5.4-mini", "gpt-5.6-luna", ["low", "medium", "high", "xhigh"]],
    ["gpt-5.4", "gpt-5.6-terra", ["low", "medium", "high", "xhigh"]],
    ["gpt-5.1-codex-mini", "gpt-5.6-terra", ["low", "medium", "high"]],
    ["gpt-5.1-codex", "gpt-5.6-sol", ["low", "medium", "high"]],
    ["gpt-5.1-codex-max", "gpt-5.6-sol", ["low", "medium", "high"]],
    ["gpt-5.2-codex", "gpt-5.6-sol", ["low", "medium", "high", "xhigh"]],
    ["gpt-5.3-codex", "gpt-5.6-sol", ["low", "medium", "high", "xhigh"]],
    ["gpt-5.2", "gpt-5.6-terra", ["low", "medium", "high", "xhigh"]],
  ] as const;

  for (const [legacyFamily, currentFamily, efforts] of codexFamilyMigrations) {
    for (const effort of efforts) {
      it(`migrates ${legacyFamily}-${effort} to ${currentFamily}-${effort}`, () => {
        const result = migrateConfig({ provider: "codex", model: `${legacyFamily}-${effort}` });

        expect(result.config.model).toBe(`${currentFamily}-${effort}`);
        expect(result.changed).toBe(true);
        expect(result.changes[0]).toContain(`${legacyFamily}-${effort}`);
        expect(result.changes[0]).toContain(`${currentFamily}-${effort}`);
      });
    }
  }

  it.each(codexFamilyMigrations.map(([legacy, current]) => [legacy, `${current}-low`] as const))(
    "migrates bare legacy Codex model %s deterministically",
    (legacyModel, expectedModel) => {
      expect(migrateConfig({ provider: "codex", model: legacyModel }).config.model).toBe(
        expectedModel,
      );
    },
  );

  it("matches the full GPT-5.1 Codex Max family before interpreting effort suffixes", () => {
    expect(migrateConfig({ provider: "codex", model: "gpt-5.1-codex-max" }).config.model).toBe(
      "gpt-5.6-sol-low",
    );
  });

  it("does not migrate the current GPT-5.3 Codex Spark family", () => {
    const raw = { provider: "codex", model: "gpt-5.3-codex-spark-low" };
    expect(migrateConfig(raw)).toEqual({ config: raw, changed: false, changes: [] });
  });

  it("is idempotent after a retired Codex model is migrated", () => {
    const first = migrateConfig({ provider: "codex", model: "gpt-5.4-high" });
    expect(migrateConfig(first.config as Record<string, unknown>)).toEqual({
      config: first.config,
      changed: false,
      changes: [],
    });
  });

  it("should handle both mode removal and model migration together", () => {
    const raw = { provider: "claude-code", model: "sonnet", mode: "cli" };
    const result = migrateConfig(raw);
    expect(result.config).toEqual({ provider: "claude-code", model: "sonnet-low" });
    expect(result.changed).toBe(true);
    expect((result.config as any).mode).toBeUndefined();
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0]).toContain("mode");
    expect(result.changes[1]).toContain("sonnet");
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
    expect(result.changes).toHaveLength(0);
  });
});

describe("migrateLegacyGeminiCliConfig", () => {
  it("updates the provider and model together from the live Antigravity catalog", async () => {
    const result = await migrateLegacyGeminiCliConfig(
      { provider: "gemini-cli", model: "gemini-3.1-pro-preview" },
      async () => [
        { id: "gemini-3.7-flash-low", name: "Gemini 3.7 Flash (Low)" },
        { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)" },
      ],
    );

    expect(result).toEqual({
      config: { provider: "antigravity-cli", model: "gemini-3.1-pro-low" },
      changed: true,
      changes: [
        "Migrated provider 'gemini-cli' → 'antigravity-cli' and model 'gemini-3.1-pro-preview' → 'gemini-3.1-pro-low'",
      ],
    });
  });
});
