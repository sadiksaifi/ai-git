import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-git.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AI Git - AI-Powered Git Commit Messages",
    template: "%s | AI Git",
  },
  description:
    "Generate semantically correct, Conventional Commits-compliant git commit messages with AI. Supports Claude Code, Gemini CLI, OpenRouter, OpenAI, Anthropic, and more.",
  keywords: [
    "git",
    "commit messages",
    "ai",
    "artificial intelligence",
    "conventional commits",
    "cli",
    "command line",
    "developer tools",
    "git commit",
    "automation",
    "claude",
    "openai",
    "gemini",
    "openrouter",
  ],
  authors: [{ name: "Sadik Saifi", url: "https://sadiksaifi.dev" }],
  creator: "Sadik Saifi",
  publisher: "Sadik Saifi",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "AI Git",
    title: "AI Git - AI-Powered Git Commit Messages",
    description:
      "Generate semantically correct, Conventional Commits-compliant git commit messages with AI. Analyze your changes, understand your intent, commit automatically.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AI Git - AI-Powered Git Commit Messages",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Git - AI-Powered Git Commit Messages",
    description:
      "Generate semantically correct, Conventional Commits-compliant git commit messages with AI.",
    images: ["/og-image.png"],
    creator: "@thesadiksaifi",
  },
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  category: "Developer Tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${jetbrainsMono.variable}`}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
