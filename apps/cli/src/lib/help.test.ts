import { describe, test, expect, beforeAll } from "bun:test";
import { renderHelp } from "./help.ts";

describe("renderHelp", () => {
  let output: string;
  beforeAll(() => {
    output = renderHelp();
  });

  test("includes usage line with [command] and [options]", () => {
    expect(output).toContain("$ ai-git [command] [options]");
  });

  test("includes CLI description", () => {
    expect(output).toContain("AI-powered Conventional Commits");
  });

  test("includes Commands section with configure and upgrade", () => {
    expect(output).toContain("Commands:");
    expect(output).toContain("configure");
    expect(output).toContain("upgrade");
  });

  test("includes Model category with provider and model flags", () => {
    expect(output).toContain("Model:");
    expect(output).toContain("--provider");
    expect(output).toContain("--model");
  });

  test("includes Workflow category with all workflow flags", () => {
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
    expect(output).toContain("Info:");
    expect(output).toContain("--version");
    expect(output).toContain("--help");
  });

  test("shows uppercase shorthands for custom flags", () => {
    expect(output).toContain("-A, --stage-all");
    expect(output).toContain("-C, --commit");
    expect(output).toContain("-P, --push");
    expect(output).toContain("-H, --hint");
    expect(output).toContain("-X, --exclude");
  });

  test("shows lowercase shorthands for standard flags", () => {
    expect(output).toContain("-v, --version");
    expect(output).toContain("-h, --help");
  });

  test("does not include --setup or --init", () => {
    expect(output).not.toContain("--setup");
    expect(output).not.toContain("--init");
  });
});
