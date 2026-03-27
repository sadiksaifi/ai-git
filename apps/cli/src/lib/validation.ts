// ==============================================================================
// COMMIT MESSAGE VALIDATION PIPELINE
// ==============================================================================

export interface ValidationError {
  rule: string;
  severity: "critical" | "important" | "minor";
  message: string;
  suggestion: string;
}

export interface ValidationResult {
  /** true if no critical errors */
  valid: boolean;
  errors: ValidationError[];
}

const VALID_TYPES = [
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

function getHeaderParts(header: string): { prefix: string; subject: string } | null {
  const match = header.match(/^(\w+(?:\([^)]*\))?!?: )(.+)$/);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1]!,
    subject: match[2]!,
  };
}

/**
 * Validate a commit message against Conventional Commits rules.
 * Returns validation result with errors categorized by severity.
 *
 * Severity levels:
 * - critical: auto-retry (message is rejected)
 * - important: show warning, let user decide
 * - minor: show as note, don't block
 */
export function validateCommitMessage(msg: string): ValidationResult {
  const errors: ValidationError[] = [];
  const lines = msg.split("\n");
  const header = lines[0] || "";

  // Critical: Header length
  if (header.length > 50) {
    errors.push({
      rule: "header-length",
      severity: "critical",
      message: `Header is ${header.length} chars (max 50)`,
      suggestion: `Shorten to ≤50 characters`,
    });
  }

  // Critical: Valid type
  const typeMatch = header.match(/^(\w+)(?:\(.*?\))?!?:/);
  if (!typeMatch || !VALID_TYPES.includes(typeMatch[1]!)) {
    errors.push({
      rule: "valid-type",
      severity: "critical",
      message: `Header must start with a valid type: ${VALID_TYPES.join(", ")}`,
      suggestion: "Remove any preamble text before the type",
    });
  }

  // Critical: No markdown
  // Bold regex requires non-/ after opening ** to avoid flagging glob paths (src/**/routes)
  if (/```/.test(msg) || /\*\*[^*/][^*]*\*\*/.test(msg)) {
    errors.push({
      rule: "no-markdown",
      severity: "critical",
      message: "Message contains markdown formatting",
      suggestion: "Output raw text only, no code blocks or bold markers",
    });
  }

  // Important: Imperative mood (heuristic)
  const subject = header.replace(/^.*?:\s*/, "");
  if (/^(added|fixed|updated|removed|changed|implemented|created)\b/i.test(subject)) {
    errors.push({
      rule: "imperative-mood",
      severity: "important",
      message: "Subject uses past tense instead of imperative",
      suggestion: "Use imperative mood: 'add' not 'added', 'fix' not 'fixed'",
    });
  }

  // Important: Lowercase subject
  if (subject && /^[A-Z]/.test(subject)) {
    errors.push({
      rule: "lowercase-subject",
      severity: "important",
      message: "Subject should start with lowercase",
      suggestion: `Change to: "${subject[0]!.toLowerCase()}${subject.slice(1)}"`,
    });
  }

  // Minor: No trailing period
  if (subject.endsWith(".")) {
    errors.push({
      rule: "no-period",
      severity: "minor",
      message: "Subject should not end with a period",
      suggestion: "Remove trailing period",
    });
  }

  // Important: Breaking change consistency
  const hasExclamation = /^[\w]+(?:\([^)]*\))?!:/.test(header);
  const hasFooter = /^BREAKING CHANGE:/m.test(msg);
  if (hasExclamation !== hasFooter && (hasExclamation || hasFooter)) {
    errors.push({
      rule: "breaking-change-consistency",
      severity: "important",
      message: hasExclamation
        ? "Header has ! but no BREAKING CHANGE footer"
        : "Has BREAKING CHANGE footer but no ! in header",
      suggestion: "Use both ! in header AND BREAKING CHANGE: in footer",
    });
  }

  return {
    valid: !errors.some((e) => e.severity === "critical"),
    errors,
  };
}

/**
 * Build a targeted retry context from validation errors.
 * Injected into the next AI generation attempt.
 */
export function buildRetryContext(errors: ValidationError[], previousMsg: string): string {
  const criticalErrors = errors.filter((e) => e.severity === "critical");
  const header = previousMsg.split("\n")[0] ?? "";
  const headerParts = getHeaderParts(header);
  const hasOnlyHeaderLengthError =
    criticalErrors.length === 1 && criticalErrors[0]?.rule === "header-length";

  let context = `# VALIDATION ERRORS IN PREVIOUS ATTEMPT\n`;
  context += `Previous output:\n"${header}"\n\n`;

  if (hasOnlyHeaderLengthError && headerParts) {
    const overBy = Math.max(header.length - 50, 0);
    const subjectBudget = Math.max(50 - headerParts.prefix.length, 0);

    context += `Header budget:\n`;
    context += `- Current header length: ${header.length}\n`;
    context += `- Over limit by: ${overBy}\n`;
    context += `- Fixed prefix: "${headerParts.prefix}" (${headerParts.prefix.length} chars)\n`;
    context += `- Remaining subject budget: ${subjectBudget} chars\n`;
    context += `- Keep the current type, scope, and ! marker if they are semantically correct.\n`;
    context += `- Rewrite only the subject so the full header fits.\n\n`;
  }

  context += `Issues:\n`;

  for (const err of criticalErrors) {
    context += `- ${err.message}. Fix: ${err.suggestion}\n`;
  }

  return context;
}
