import { describe, it, expect } from "bun:test";
import { migrateConfig, type MigrationResult } from "./migration.ts";

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

  it("should NOT migrate non-claude-code providers", () => {
    const raw = { provider: "codex", model: "gpt-5.3-codex-low" };
    const result = migrateConfig(raw);
    expect(result.config.model).toBe("gpt-5.3-codex-low");
    expect(result.changed).toBe(false);
    expect(result.changes).toHaveLength(0);
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
