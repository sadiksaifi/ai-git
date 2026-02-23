// ==============================================================================
// @ai-git/content/web — Documentation Structure
// ==============================================================================

export const docs = {
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      pages: ["installation", "quick-start", "first-commit"],
    },
    {
      id: "configuration",
      title: "Configuration",
      pages: ["global-config", "project-config", "custom-prompts"],
    },
    {
      id: "providers",
      title: "Providers",
      pages: ["cli-providers", "api-providers", "switching-providers"],
    },
    {
      id: "reference",
      title: "Reference",
      pages: ["cli-reference", "config-schema", "conventional-commits"],
    },
  ],
} as const;
