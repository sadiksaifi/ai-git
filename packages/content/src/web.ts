import type {
  FAQItem,
  HeroContent,
  InstallTab,
  NavLink,
  OGImage,
  PageSEO,
  SocialLink,
} from "./types.ts";

// ==============================================================================
// @ai-git/content/web — Marketing Site Content
// ==============================================================================

export const seo = {
  site: {
    name: "ai-git",
    url: "https://ai-git.xyz",
    locale: "en_US",
    themeColor: "#0a0a0a",
  },
  home: {
    title: "AI Git Commit Message Generator CLI | ai-git",
    description:
      "ai-git reads your git diff and writes Conventional Commits-compliant messages with Claude, OpenAI, Gemini, OpenRouter, and local CLI providers.",
  } as PageSEO,
  docs: {
    title: "Docs — ai-git",
    description: "Installation, configuration, providers, and custom prompts for ai-git.",
  } as PageSEO,
  openGraph: {
    type: "website" as const,
    siteName: "ai-git",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "ai-git — stop writing commit messages",
      },
    ] as readonly OGImage[],
  },
  twitter: {
    card: "summary_large_image" as const,
    site: "@thesadiksaifi",
    creator: "@thesadiksaifi",
    image: {
      url: "/twitter.png",
      width: 1200,
      height: 628,
      alt: "ai-git — stop writing commit messages",
    },
  },
  icons: {
    faviconSvg: "/favicon.svg",
    appleTouchIcon: "/apple-touch-icon.png",
  },
} as const;

// ------------------------------------------------------------------------------
// Hero
// ------------------------------------------------------------------------------

export const hero: HeroContent = {
  headline: "Stop writing commit messages.",
  subheadline: "ai-git reads your diff and writes the commit. Works with any AI provider.",
  cta: {
    label: "GitHub",
    href: "https://github.com/sadiksaifi/ai-git",
  },
};

// ------------------------------------------------------------------------------
// Install tabs (hero + install methods section)
// ------------------------------------------------------------------------------

export const installTabs: readonly InstallTab[] = [
  { id: "npm", label: "npm", command: "npm install -g @ai-git/cli" },
  { id: "brew", label: "brew", command: "brew install sadiksaifi/tap/ai-git" },
  { id: "curl", label: "curl", command: "curl -fsSL https://ai-git.xyz/install | bash" },
  {
    id: "source",
    label: "source",
    command:
      "git clone https://github.com/sadiksaifi/ai-git && cd ai-git && bun install && bun run build",
  },
] as const;

// ------------------------------------------------------------------------------
// FAQ
// ------------------------------------------------------------------------------

export const faq: readonly FAQItem[] = [
  {
    question: "Does my diff leave my machine?",
    answer:
      "It goes to whichever provider you pick, and nowhere else. No proxy, no telemetry, no silent fallback. Choose one you trust, or run a local model behind an API shim.",
  },
  {
    question: "Where are API keys stored?",
    answer:
      "OS keychain via Bun.secrets. macOS Keychain, libsecret on Linux, Windows Credential Manager. Encrypted file fallback on headless systems. Never plaintext in your config.",
  },
  {
    question: "Can my team enforce a commit style?",
    answer:
      "Yes. Commit <code>.ai-git.json</code> with <code>prompt.context</code>, <code>prompt.style</code>, and optional <code>prompt.examples</code>. Project config wins over global for every teammate.",
  },
  {
    question: "What if the message is wrong?",
    answer:
      "The TUI shows the generated message and asks <code>Commit / Retry / Edit / Quit</code>. Edit opens your <code>$EDITOR</code>. Retry gets a fresh generation with an optional hint.",
  },
  {
    question: "Does it work without a provider CLI installed?",
    answer:
      "Yes for the API providers. For CLI providers (Claude Code, Gemini CLI, Codex, OpenCode, Pi), the corresponding binary must be on your PATH. <code>--dry-run</code> works without any.",
  },
] as const;

// ------------------------------------------------------------------------------
// Nav
// ------------------------------------------------------------------------------

export const nav: readonly NavLink[] = [
  { label: "How it works", href: "how", internal: true },
  { label: "Providers", href: "providers", internal: true },
  { label: "Config", href: "config", internal: true },
  { label: "FAQ", href: "faq", internal: true },
  { label: "GitHub", href: "https://github.com/sadiksaifi/ai-git", external: true },
] as const;

// ------------------------------------------------------------------------------
// Footer
// ------------------------------------------------------------------------------

export const footer = {
  copyright: `© ${new Date().getFullYear()} Sadik Saifi`,
  license: { label: "MIT", href: "https://github.com/sadiksaifi/ai-git/blob/main/LICENSE" },
  author: { label: "sadiksaifi.dev", href: "https://sadiksaifi.dev" },
  social: [
    { label: "GitHub", href: "https://github.com/sadiksaifi/ai-git", icon: "github" },
    { label: "Twitter", href: "https://x.com/thesadiksaifi", icon: "x" },
  ] as readonly SocialLink[],
} as const;
