import type { OGImage, IconSize, PageSEO } from "./types.ts";

// ==============================================================================
// @ai-git/content/web — SEO Metadata
// ==============================================================================

export const seo = {
  site: {
    name: "AI Git",
    url: "https://ai-git.xyz",
    locale: "en_US",
    themeColor: "#0a0a0a",
  },
  home: {
    title: "AI Git — AI-Powered Conventional Commits",
    description:
      "Generate perfect Conventional Commits from your staged changes. 8+ AI providers, interactive TUI, zero config. Open source CLI tool.",
  } as PageSEO,
  docs: {
    title: "Documentation — AI Git",
    description: "Installation guides, configuration reference, and provider setup for AI Git.",
  } as PageSEO,
  openGraph: {
    type: "website" as const,
    siteName: "AI Git",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AI Git — AI-Powered Conventional Commits",
      },
    ] as readonly OGImage[],
  },
  twitter: {
    card: "summary_large_image" as const,
    site: "@thesadiksaifi",
    creator: "@thesadiksaifi",
  },
  icons: {
    favicon: "/favicon.ico",
    faviconSvg: "/favicon.svg",
    appleTouchIcon: "/apple-touch-icon.png",
    sizes: [
      { size: "16x16", path: "/favicon-16x16.png" },
      { size: "32x32", path: "/favicon-32x32.png" },
      { size: "180x180", path: "/apple-touch-icon.png" },
      { size: "192x192", path: "/android-chrome-192x192.png" },
      { size: "512x512", path: "/android-chrome-512x512.png" },
    ] as readonly IconSize[],
  },
  manifest: "/site.webmanifest",
} as const;
