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
    title: "ai-git — stop writing commit messages",
    description:
      "A CLI that reads your diff and writes a Conventional Commits-compliant message. Bring your own AI — Claude Code, Gemini CLI, Codex, OpenRouter, OpenAI, Google AI Studio, Anthropic, Cerebras.",
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
// FAQ (2 questions)
// ------------------------------------------------------------------------------

export const faq: readonly FAQItem[] = [
  {
    question: "Does my diff leave my machine?",
    answer: "It goes to whichever provider you pick. Choose one you trust.",
  },
  {
    question: "Where are API keys stored?",
    answer:
      "OS keychain via Bun.secrets (macOS Keychain, libsecret, Windows Credential Manager). Encrypted file fallback on headless systems.",
  },
] as const;

// ------------------------------------------------------------------------------
// Nav
// ------------------------------------------------------------------------------

export const nav: readonly NavLink[] = [
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
