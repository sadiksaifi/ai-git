import { describe, test, expect } from "bun:test";
import { buildRetryContext, validateCommitMessage } from "./validation.ts";

describe("validateCommitMessage", () => {
  // Critical: header length
  test("rejects header over 50 chars", () => {
    const result = validateCommitMessage(
      "feat(authentication): implement user authentication with OAuth2 flow",
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "header-length")).toBe(true);
  });

  test("accepts header at exactly 50 chars", () => {
    // "fix(auth): correct biometric token expiry handlers" = 50 chars
    const msg = "fix(auth): correct biometric token expiry handlers";
    expect(msg.length).toBe(50);
    const result = validateCommitMessage(msg);
    expect(result.errors.some((e) => e.rule === "header-length")).toBe(false);
  });

  // Critical: valid type
  test("rejects invalid type", () => {
    const result = validateCommitMessage("update(auth): add login");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "valid-type")).toBe(true);
  });

  test("accepts all valid types", () => {
    const types = [
      "feat",
      "fix",
      "refactor",
      "perf",
      "style",
      "docs",
      "test",
      "build",
      "ci",
      "chore",
      "revert",
    ];
    for (const type of types) {
      const result = validateCommitMessage(`${type}: do something`);
      expect(result.errors.some((e) => e.rule === "valid-type")).toBe(false);
    }
  });

  test("accepts type with scope", () => {
    const result = validateCommitMessage("feat(auth): add login");
    expect(result.errors.some((e) => e.rule === "valid-type")).toBe(false);
  });

  test("accepts breaking change type", () => {
    const result = validateCommitMessage("feat(api)!: remove v1 endpoints");
    expect(result.errors.some((e) => e.rule === "valid-type")).toBe(false);
  });

  // Critical: no markdown
  test("rejects markdown code blocks", () => {
    const result = validateCommitMessage("feat: add login\n\n```\nsome code\n```");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "no-markdown")).toBe(true);
  });

  test("rejects bold markdown", () => {
    const result = validateCommitMessage("feat: add **bold** login");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "no-markdown")).toBe(true);
  });

  test("allows glob patterns with **", () => {
    const result = validateCommitMessage("fix(glob): support src/**/routes");
    expect(result.errors.some((e) => e.rule === "no-markdown")).toBe(false);
  });

  test("allows double-glob paths like **/routes/**", () => {
    const result = validateCommitMessage("fix(glob): support **/routes/**");
    expect(result.errors.some((e) => e.rule === "no-markdown")).toBe(false);
  });

  // Critical: no preamble
  test("rejects preamble text", () => {
    const result = validateCommitMessage("Here is your commit message:\n\nfeat: add login");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "valid-type")).toBe(true);
  });

  // Important: imperative mood
  test("warns on past tense subject", () => {
    const result = validateCommitMessage("feat(auth): added login");
    expect(result.errors.some((e) => e.rule === "imperative-mood")).toBe(true);
    // Important, not critical — still valid
    expect(result.valid).toBe(true);
  });

  // Important: lowercase subject
  test("warns on uppercase subject", () => {
    const result = validateCommitMessage("feat(auth): Add login");
    expect(result.errors.some((e) => e.rule === "lowercase-subject")).toBe(true);
    expect(result.valid).toBe(true);
  });

  // Minor: no trailing period
  test("notes trailing period", () => {
    const result = validateCommitMessage("feat(auth): add login.");
    expect(result.errors.some((e) => e.rule === "no-period")).toBe(true);
    expect(result.valid).toBe(true);
  });

  // Valid messages
  test("accepts valid header-only message", () => {
    const result = validateCommitMessage("fix(auth): correct token expiry");
    expect(result.valid).toBe(true);
    expect(result.errors.filter((e) => e.severity === "critical")).toHaveLength(0);
  });

  test("accepts valid message with body", () => {
    const msg =
      "feat(auth): add biometric auth\n\n- implement fingerprint recognition\n- add fallback to PIN";
    const result = validateCommitMessage(msg);
    expect(result.valid).toBe(true);
  });

  // No false positive on ! in subject
  test("does not flag ! in subject as breaking change", () => {
    const result = validateCommitMessage("fix: handle !important flag");
    expect(result.errors.some((e) => e.rule === "breaking-change-consistency")).toBe(false);
  });

  // Breaking change consistency
  test("warns when ! in header but no BREAKING CHANGE footer", () => {
    const result = validateCommitMessage("feat(api)!: remove v1 endpoints");
    expect(result.errors.some((e) => e.rule === "breaking-change-consistency")).toBe(true);
  });

  test("no warning when both ! and BREAKING CHANGE present", () => {
    const msg =
      "feat(api)!: remove v1 endpoints\n\n- remove all v1 routes\n\nBREAKING CHANGE: v1 API no longer available";
    const result = validateCommitMessage(msg);
    expect(result.errors.some((e) => e.rule === "breaking-change-consistency")).toBe(false);
  });
});

describe("buildRetryContext", () => {
  test("includes exact header budget details for length-only failures", () => {
    const previousMsg = "feat(cli)!: require budget-aware migration output for config v2";
    const result = validateCommitMessage(previousMsg);

    const context = buildRetryContext(result.errors, previousMsg);

    expect(context).toContain(
      'Previous output:\n"feat(cli)!: require budget-aware migration output for config v2"',
    );
    expect(context).toContain("- Current header length: 63");
    expect(context).toContain("- Over limit by: 13");
    expect(context).toContain('- Fixed prefix: "feat(cli)!: " (12 chars)');
    expect(context).toContain("- Remaining subject budget: 38 chars");
    expect(context).toContain("- Rewrite only the subject so the full header fits.");
  });

  test("does not add prefix-preservation guidance for mixed critical failures", () => {
    const previousMsg = "Here is your commit message:\n\nfeat(cli): add config doctor";
    const result = validateCommitMessage(previousMsg);

    const context = buildRetryContext(result.errors, previousMsg);

    expect(context).not.toContain("Remaining subject budget");
    expect(context).not.toContain("Keep the current type, scope, and ! marker");
  });
});
