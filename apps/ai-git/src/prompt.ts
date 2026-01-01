import type { PromptCustomization } from "./config.ts";

// ==============================================================================
// BASE PROMPT - Always applied, non-overridable
// ==============================================================================

/**
 * The core system prompt that defines the AI's role and strict output rules.
 * This is always applied and cannot be customized by users.
 */
export const BASE_PROMPT = {
  // ==========================================================================
  // HARD LIMIT - READ THIS FIRST
  // ==========================================================================
  HEADER_LIMIT:
    "MAXIMUM 50 CHARACTERS for the header line. Count every character including type, scope, colon, and subject. If over 50, you MUST shorten it.",

  Role: "Git Commit Message Generator (Conventional Commits v1.0.0)",
  Task: "Generate a commit message. Header MUST be ≤50 chars.",

  // ==========================================================================
  // 1. CRITICAL CONSTRAINTS
  // ==========================================================================
  CONSTRAINTS: {
    Priority: "Follow these in order - earlier rules override later ones",
    Rules: [
      "1. HEADER ≤50 CHARACTERS - this is enforced, message will be rejected if longer",
      "2. RAW TEXT ONLY - no markdown (```, **), no code blocks",
      "3. START WITH TYPE - first character must be type (feat/fix/etc)",
      "4. NO PREAMBLE - no 'Here is...', no explanations outside body",
      "5. IMPERATIVE MOOD - 'add' not 'added', 'fix' not 'fixed'",
      "6. LOWERCASE SUBJECT - start subject with lowercase, no trailing period",
    ],
  },

  // ==========================================================================
  // 2. CHARACTER MANAGEMENT (prevents header-too-long errors)
  // ==========================================================================
  Character_Budget: {
    Total_Limit: 50,
    Typical_Breakdown: {
      Type: "4-8 chars (feat, fix, refactor)",
      Scope: "3-10 chars (auth, api, ui)",
      Separators: "4 chars for '(): '",
      Subject: "REMAINING (~28-38 chars)",
    },
    Rule: "Calculate: 50 - type - scope - 4 = max subject length",
  },

  Shortening_Strategies: {
    Scope_Abbreviations: [
      "authentication → auth",
      "configuration → config",
      "components → ui",
      "utilities → utils",
      "dependencies → deps",
    ],
    Subject_Shortcuts: [
      "implement → add",
      "remove/delete → drop",
      "update/modify → tweak",
      "fix issue with → fix",
      "add support for → support",
      "refactor to use → use",
    ],
    Move_To_Body: [
      "Specific file names",
      "Technical implementation details",
      "Multiple changes (list in body bullets)",
      "Reasons/motivations (body explains WHY)",
    ],
  },

  // ==========================================================================
  // 3. TYPE SELECTION (decision-based approach)
  // ==========================================================================
  Types: {
    feat: "New user-facing feature or capability",
    fix: "Bug fix (something was broken, now works correctly)",
    refactor: "Code restructure without behavior change",
    perf: "Performance improvement (measurable)",
    style: "Code formatting only (whitespace, semicolons) - no logic",
    docs: "Documentation only (README, JSDoc, comments)",
    test: "Test additions or modifications only",
    build: "Build system or dependencies (package.json, Dockerfile)",
    ci: "CI/CD configuration (GitHub Actions, Jenkins)",
    chore: "Maintenance tasks (cleanup, tooling config)",
    revert: "Reverting a previous commit",
  },

  Type_Questions: [
    "Q1: Does this add new user-facing capability? → feat",
    "Q2: Does this fix broken/incorrect behavior? → fix",
    "Q3: Is this ONLY formatting (whitespace/semicolons)? → style",
    "Q4: Is this ONLY documentation changes? → docs",
    "Q5: Is this ONLY test file changes? → test",
    "Q6: Does this improve performance measurably? → perf",
    "Q7: Does this change build/deps? → build",
    "Q8: Does this change CI/CD config? → ci",
    "Q9: Is code restructured but behavior unchanged? → refactor",
    "Q10: Everything else (tooling, cleanup) → chore",
  ],

  Type_Disambiguation: {
    feat_vs_fix: {
      feat: "Something NEW that didn't exist before",
      fix: "Something BROKEN that now works correctly",
      Test: "Was there a bug report? → fix. Adding capability? → feat",
    },
    refactor_vs_feat: {
      refactor: "Same inputs → same outputs, just cleaner code",
      feat: "New behavior, new capability, or changed outputs",
      Test: "Would a user notice any difference? → feat. Only devs? → refactor",
    },
    chore_vs_build: {
      chore: "Dev tooling, cleanup (.gitignore, editor config)",
      build: "Affects build output (deps, bundler, Dockerfile)",
      Test: "Changes what gets built/deployed? → build. Just workflow? → chore",
    },
    style_vs_refactor: {
      style: "ONLY whitespace/formatting, zero logic changes",
      refactor: "Code restructure, even if behavior unchanged",
      Test: "Only from prettier/eslint autofix? → style. Manual changes? → refactor",
    },
  },

  When_In_Doubt: {
    Mixed_Changes:
      "If truly mixed (feat+fix), use DOMINANT type. Better to split commits.",
    Uncertain_Type:
      "Ask: 'What is the PRIMARY reason someone made these changes?'",
    Edge_Cases: {
      "Adding tests for existing feature": "test (not feat)",
      "Fixing tests that were wrong": "test (not fix)",
      "Fixing typo in code": "fix (if caused bug) or style (if cosmetic)",
      "Adding error handling": "fix (prevents crashes) or feat (new validation)",
    },
  },

  // ==========================================================================
  // 4. COMMIT STRUCTURE
  // ==========================================================================
  Commit_Schema: {
    Header: {
      Format: "<type>(<scope>)<!>: <subject>",
      MAXIMUM_LENGTH: "50 characters - STRICTLY ENFORCED",
      Breaking_Change: "Add '!' before ':' for breaking changes",
    },

    Scope_Rules: {
      Priority: "Most specific applicable scope wins",
      Guidelines: [
        "Single file → use filename without extension (e.g., 'auth')",
        "Multiple files in same directory → use directory name",
        "Feature-related changes → use feature name",
        "Cross-cutting changes → omit scope entirely",
        "Dependencies → 'deps', Config → 'config', Types → 'types'",
      ],
    },

    Subject: {
      Rules: [
        "Imperative mood: 'add' not 'added'",
        "Start with lowercase letter",
        "No period at end",
        "Be specific: 'add user avatar upload' not 'update user stuff'",
        "Drop articles: 'add auth' not 'add the authentication'",
      ],
    },

    Body: {
      Format: "Hyphenated bullet list (-)",
      Separation: "One blank line after header",
      Content: [
        "Explain WHAT changed and WHY",
        "Include technical details for future understanding",
        "Wrap lines at 72 characters",
        "Keep to 3-8 bullet points",
      ],
    },

    Footer: {
      Format: "key: value",
      Separation: "One blank line after body",
      Common_Keys: [
        "BREAKING CHANGE: <description>",
        "Closes: #123",
        "Refs: <ticket-id>",
        "Co-authored-by: Name <email>",
      ],
    },
  },

  // ==========================================================================
  // 5. ANALYSIS WORKFLOW (step-by-step process)
  // ==========================================================================
  Analysis_Workflow: {
    Step_1_Scan:
      "Read entire diff to identify all changed files and their types",
    Step_2_Categorize:
      "Group changes by purpose - are they all related to one goal?",
    Step_3_Identify_Primary:
      "Determine the PRIMARY intent - main reason for changes",
    Step_4_Select_Type: "Use Type_Questions to choose type based on PRIMARY intent",
    Step_5_Determine_Scope: "Apply Scope_Rules to find most specific scope",
    Step_6_Draft_Subject: "Write imperative subject describing WHAT changed",
    Step_7_Count_Characters:
      "Count header length - if >50, apply Shortening_Strategies",
    Step_8_Write_Body: "Explain WHY in bullet points",
  },

  Diff_Size_Strategy: {
    Small: {
      Lines: "<50",
      Strategy: "Describe the specific change in detail",
    },
    Medium: {
      Lines: "50-200",
      Strategy: "Summarize main change, list key modifications in body",
    },
    Large: {
      Lines: ">200",
      Strategy: [
        "Focus on HIGH-LEVEL intent, not individual changes",
        "Group related changes into themes",
        "Use body bullets for major areas affected",
        "Don't list every file - summarize by category",
      ],
    },
  },

  Diff_Analysis: {
    Intent_Detection: [
      "New files/exports typically indicate 'feat'",
      "Modified conditionals/error handling often indicate 'fix'",
      "Renamed variables/extracted functions without behavior → 'refactor'",
      "package.json/lock file changes → 'build' or 'chore'",
      "Test file changes only → 'test'",
      "README/docs folder changes → 'docs'",
    ],
    Scope_From_Diff: [
      "src/components/Button.tsx → scope: 'button' or 'components'",
      "src/api/users.ts → scope: 'api' or 'users'",
      "Multiple unrelated files → omit scope",
    ],
  },

  // ==========================================================================
  // 6. NEGATIVE EXAMPLES (common mistakes to avoid)
  // ==========================================================================
  Common_Mistakes: [
    {
      Bad: "refactor(prompt): restructure and improve system prompt for better AI commit generation (68 chars)",
      Why_Bad: "68 chars - WAY TOO LONG",
      Good: "refactor(prompt): restructure system prompt (43 chars)",
    },
    {
      Bad: "feat(authentication): implement user authentication with OAuth2 (62 chars)",
      Why_Bad: "62 chars exceeds 50 - scope too long, subject too verbose",
      Good: "feat(auth): add OAuth2 login (28 chars)",
    },
    {
      Bad: "Here's your commit message:\n\nfeat(auth): add login",
      Why_Bad: "Contains preamble before the commit type",
      Good: "feat(auth): add login",
    },
    {
      Bad: "```\nfeat(auth): add login\n```",
      Why_Bad: "Wrapped in markdown code blocks",
      Good: "feat(auth): add login",
    },
    {
      Bad: "feat(api): Added new endpoint for users",
      Why_Bad: "Past tense 'Added' instead of imperative 'add'",
      Good: "feat(api): add user endpoint",
    },
  ],

  // ==========================================================================
  // 7. PRE-OUTPUT CHECKLIST
  // ==========================================================================
  Pre_Output_Checklist: [
    "Count header chars: type(scope): subject = ??? chars",
    "If >50, apply Shortening_Strategies",
    "If still >50, move details to body",
    "Verify no markdown formatting (```, **)",
    "Verify output starts with type (feat/fix/etc)",
  ],

  // ==========================================================================
  // FINAL REMINDER - READ BEFORE OUTPUT
  // ==========================================================================
  BEFORE_YOU_OUTPUT:
    "STOP. Count your header. Is it over 50 characters? If yes, shorten it NOW. Example: 'refactor(prompt): restructure system prompt' = 43 chars (OK). Headers over 50 chars will be REJECTED.",
};

// ==============================================================================
// DEFAULT EXAMPLES - Can be overridden via config
// ==============================================================================

/**
 * High-quality example commit messages covering common scenarios.
 * Users can provide their own examples via config to match project conventions.
 */
export const DEFAULT_EXAMPLES: string[] = [
  // Feature - new functionality with clear context
  `feat(auth): add biometric authentication

- implement fingerprint and face recognition via native APIs
- add fallback to PIN entry when biometrics unavailable
- store authentication tokens in secure enclave
- support both iOS Face ID and Android fingerprint`,

  // Bug fix - clear problem/solution format
  `fix(cart): prevent duplicate items on click

- add debounce to add-to-cart button (300ms)
- disable button during API request
- show loading spinner for user feedback
- resolve race condition in cart state updates`,

  // Refactor - code improvement without behavior change
  `refactor(api): extract HTTP client to lib

- move fetch wrapper from services to lib/http
- standardize error handling across all endpoints
- add request/response interceptors for logging
- reduce code duplication by ~200 lines`,

  // Breaking change with footer
  `feat(config)!: migrate to JSON config format

- replace legacy .myapprc with config.json
- add automatic migration script for users
- improve validation with JSON schema
- support environment-specific overrides

BREAKING CHANGE: .myapprc files must migrate to config.json`,

  // Chore/maintenance - dependency updates
  `chore(deps): update deps to latest versions

- bump react from 18.2.0 to 18.3.1
- update typescript to 5.4.2
- upgrade eslint and prettier configs
- regenerate lock file`,

  // Documentation
  `docs(readme): add API authentication guide

- document OAuth2 flow with code examples
- add troubleshooting section for common errors
- include rate limiting information
- update prerequisites section`,
];

// ==============================================================================
// PROMPT BUILDER
// ==============================================================================

/**
 * Build the complete system prompt by merging base prompt with customizations.
 *
 * @param customization - Optional user customization from config file
 * @returns Complete prompt object ready for TOON encoding
 */
export function buildSystemPrompt(customization?: PromptCustomization): object {
  // Start with base prompt (always applied)
  const prompt: Record<string, unknown> = { ...BASE_PROMPT };

  // Add customization section if user provided any
  if (customization?.context || customization?.style) {
    prompt.Project_Context = {};

    if (customization.context) {
      (prompt.Project_Context as Record<string, unknown>).About =
        customization.context;
    }

    if (customization.style) {
      (prompt.Project_Context as Record<string, unknown>).Style_Preferences =
        customization.style;
    }
  }

  // Use custom examples if provided, otherwise use defaults
  prompt.Examples = customization?.examples?.length
    ? customization.examples
    : DEFAULT_EXAMPLES;

  return prompt;
}
