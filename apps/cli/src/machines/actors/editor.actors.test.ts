import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { resolveEditor } from "./editor.actors.ts";
import { NoEditorError } from "../../lib/errors.ts";

describe("resolveEditor", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VISUAL;
    delete process.env.EDITOR;
  });

  afterEach(() => {
    process.env.VISUAL = originalEnv.VISUAL;
    process.env.EDITOR = originalEnv.EDITOR;
  });

  test("returns config editor when available", async () => {
    const which = async () => "/usr/bin/vim";
    const result = await resolveEditor("vim", which);
    expect(result).toBe("vim");
  });

  test("falls back to $VISUAL when no config editor", async () => {
    process.env.VISUAL = "code --wait";
    const which = async () => "/usr/bin/code";
    const result = await resolveEditor(undefined, which);
    expect(result).toBe("code --wait");
  });

  test("falls back to $EDITOR when no config or $VISUAL", async () => {
    process.env.EDITOR = "nano";
    const which = async () => "/usr/bin/nano";
    const result = await resolveEditor(undefined, which);
    expect(result).toBe("nano");
  });

  test("tries platform fallbacks when env vars unset", async () => {
    // Mock which: only "vi" exists
    const which = async (cmd: string) => (cmd === "vi" ? "/usr/bin/vi" : null);
    const result = await resolveEditor(undefined, which);
    expect(result).toBe("vi");
  });

  test("throws NoEditorError when nothing found", async () => {
    const which = async () => null;
    expect(resolveEditor(undefined, which)).rejects.toBeInstanceOf(NoEditorError);
  });

  test("checks only first token of multi-word commands", async () => {
    process.env.VISUAL = "code --wait";
    const calls: string[] = [];
    const which = async (cmd: string) => {
      calls.push(cmd);
      return cmd === "code" ? "/usr/bin/code" : null;
    };
    await resolveEditor(undefined, which);
    expect(calls[0]).toBe("code");
  });

  test("skips config editor if binary not found", async () => {
    process.env.EDITOR = "nano";
    const which = async (cmd: string) => (cmd === "nano" ? "/usr/bin/nano" : null);
    const result = await resolveEditor("nonexistent", which);
    expect(result).toBe("nano");
  });
});
