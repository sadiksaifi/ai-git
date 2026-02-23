import type { NavLink, SocialLink } from "./types.ts";

// ==============================================================================
// @ai-git/content/web — Navigation
// ==============================================================================

export const navigation = {
  header: [
    { label: "Features", href: "#features" },
    { label: "Providers", href: "#providers" },
    { label: "Docs", href: "/docs" },
    {
      label: "GitHub",
      href: "https://github.com/sadiksaifi/ai-git",
      external: true,
    },
  ] as readonly NavLink[],
  footer: {
    product: [
      { label: "Features", href: "#features" },
      { label: "Providers", href: "#providers" },
      { label: "Installation", href: "#installation" },
    ] as readonly NavLink[],
    resources: [
      { label: "Documentation", href: "/docs" },
      {
        label: "GitHub",
        href: "https://github.com/sadiksaifi/ai-git",
        external: true,
      },
      {
        label: "Changelog",
        href: "https://github.com/sadiksaifi/ai-git/releases",
        external: true,
      },
    ] as readonly NavLink[],
    social: [
      { label: "X", href: "https://x.com/thesadiksaifi", icon: "x" },
      {
        label: "GitHub",
        href: "https://github.com/sadiksaifi/ai-git",
        icon: "github",
      },
      {
        label: "npm",
        href: "https://www.npmjs.com/package/@ai-git/cli",
        icon: "npm",
      },
    ] as readonly SocialLink[],
  },
} as const;
