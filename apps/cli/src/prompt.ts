import type { PromptCustomization } from "./config.ts";

// ==============================================================================
// SYSTEM PROMPT — XML-Tagged Natural Language
// ==============================================================================

/**
 * The core system prompt as XML-tagged natural language.
 * Replaces the TOON-encoded JSON object.
 * ~120 lines vs the previous ~295 lines.
 */
const SYSTEM_PROMPT = `<role>
You generate git commit messages following Conventional Commits v1.0.0.
Output ONLY the raw commit message. No markdown, no code blocks, no preamble.
</role>

<constraints>
- Header MUST be ≤50 characters (strictly enforced, will be rejected if longer)
- Start with type: feat|fix|refactor|perf|style|docs|test|build|ci|chore|revert
- Imperative mood: "add" not "added", "fix" not "fixed"
- Lowercase subject, no trailing period
- No markdown formatting (\`\`\`, **, etc.)
- Do not output a header you have not checked against the 50 character limit
</constraints>

<format>
Header: <type>(<scope>): <subject>
- Add ! before : for breaking changes: feat(api)!: remove v1 endpoints
- Scope is optional. Use when specific: filename, directory, or feature name
- Omit scope for cross-cutting changes

Body (only for non-trivial changes):
- Blank line after header
- Bulleted with hyphens (-)
- Explain WHAT and WHY, not HOW
- 3-6 bullets, wrap at 72 chars

Footer (only when applicable):
- BREAKING CHANGE: <description>
- Closes: #<number>
- Refs: <ticket-id>
</format>

<type-guide>
feat     → New user-facing capability
fix      → Bug fix (broken → works)
refactor → Code restructure, same behavior
perf     → Measurable performance improvement
style    → Formatting only (whitespace, semicolons)
docs     → Documentation only
test     → Test additions/changes only
build    → Build system, dependencies
ci       → CI/CD configuration
chore    → Maintenance, tooling
revert   → Reverting a previous commit

When unsure: Ask "what is the PRIMARY reason for these changes?"
</type-guide>

<scope-rules>
- Single file → filename without extension
- Multiple files in same dir → directory name
- Feature-related → feature name
- Cross-cutting → omit scope
- Abbreviate: authentication→auth, configuration→config, dependencies→deps
</scope-rules>

<header-budgeting>
Generate the header as a constrained formatting task:
1. Choose the correct type.
2. Choose a scope only when it is semantically useful.
3. Add ! only for a real breaking change.
4. Build the exact prefix: <type>(<scope>)!: or <type>(<scope>): or <type>:
5. Count remaining subject budget from the final prefix and the required space after the colon.
6. Write the subject to fit the remaining budget.
7. If the full header is over 50 chars, rewrite ONLY the subject shorter and check again.

Compression rules for the subject:
- Prefer action + object.
- Drop qualifiers, secondary clauses, and implementation detail first.
- Prefer short concrete words over abstract wording like "support", "handling", "workflow", or "integration" unless essential.
- Keep semantically required scope; shorten the subject instead.
</header-budgeting>

<adaptive-body>
- Trivial changes (rename, typo, single-line fix): header only, no body
- Small changes (<30 lines): header only unless context is needed
- Medium changes (30-150 lines): header + 3-4 bullets
- Large changes (>150 lines): header + 5-6 bullets, group by theme
</adaptive-body>`;

// ==============================================================================
// DEFAULT EXAMPLES
// ==============================================================================

const DEFAULT_EXAMPLES = `<examples>
fix(auth): correct token expiry check

style: apply prettier formatting

chore(deps): bump react to 18.3.1

feat(auth): add biometric authentication

- implement fingerprint and face recognition
- add fallback to PIN when unavailable
- store tokens in secure enclave

fix(cart): prevent duplicate items on click

- add 300ms debounce to add-to-cart button
- disable button during API request

refactor(api): extract HTTP client to lib

- move fetch wrapper from services to lib/http
- standardize error handling across endpoints
- reduce duplication by ~200 lines

feat(config)!: migrate to JSON config format

- replace .myapprc with config.json
- add automatic migration script

BREAKING CHANGE: .myapprc files must migrate to config.json

fix(cli): trim retry prompt context

feat(cli): show config doctor output

feat(cli)!: migrate flags to config

BREAKING CHANGE: legacy CLI flags now require config values
</examples>`;

// ==============================================================================
// PROMPT BUILDER
// ==============================================================================

/**
 * Build the system prompt string with optional user customizations.
 * Returns an XML-tagged string ready to use as a system message.
 */
export function buildSystemPrompt(customization?: PromptCustomization): string {
  let prompt = SYSTEM_PROMPT;

  // Add project context if provided
  if (customization?.context || customization?.style) {
    prompt += "\n\n<project-context>";
    if (customization.context) {
      prompt += `\nAbout: ${customization.context}`;
    }
    if (customization.style) {
      prompt += `\nStyle: ${customization.style}`;
    }
    prompt += "\n</project-context>";
  }

  // Add examples (custom or default)
  if (customization?.examples?.length) {
    prompt += `\n\n<examples>\n${customization.examples.join("\n\n")}\n</examples>`;
  } else {
    prompt += `\n\n${DEFAULT_EXAMPLES}`;
  }

  return prompt;
}

/**
 * Build the user prompt with dynamic context and diff.
 */
export function buildUserPrompt(options: {
  branchName: string;
  hint?: string;
  recentCommits?: string[];
  stagedFileList?: string;
  errors?: string;
  refinements?: { lastMessage: string; instructions: string[] };
  diff: string;
}): string {
  let prompt = "";

  prompt += `# BRANCH\n${options.branchName}\n\n`;

  if (options.recentCommits && options.recentCommits.length > 0) {
    prompt += `# RECENT COMMITS\n${options.recentCommits.join("\n")}\n\n`;
  }

  if (options.stagedFileList) {
    prompt += `# CHANGED FILES\n${options.stagedFileList}\n\n`;
  }

  if (options.hint) {
    prompt += `# USER HINT\n${options.hint}\n\n`;
  }

  if (options.errors) {
    prompt += `${options.errors}\n\n`;
  }

  if (options.refinements) {
    prompt += `# PREVIOUS GENERATED MESSAGE\n${options.refinements.lastMessage}\n\n`;
    prompt += `# USER REFINEMENT INSTRUCTIONS\n${options.refinements.instructions.join("\n")}\n\n`;
    prompt += `IMPORTANT: Still adhere to Conventional Commits and ≤50 char header limit.\n\n`;
  }

  prompt += `# STAGED DIFF\n${options.diff}`;

  return prompt;
}
