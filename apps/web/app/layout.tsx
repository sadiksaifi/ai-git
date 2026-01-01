import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Git - AI-Powered Git Commit Messages",
  description:
    "Generate semantically correct, Conventional Commits-compliant git commit messages with AI. Supports Claude Code, Gemini CLI, OpenRouter, and more.",
  keywords: [
    "git",
    "commit",
    "ai",
    "conventional commits",
    "cli",
    "developer tools",
  ],
  authors: [{ name: "Sadik Saifi" }],
  openGraph: {
    title: "AI Git - AI-Powered Git Commit Messages",
    description:
      "Generate semantically correct, Conventional Commits-compliant git commit messages with AI.",
    type: "website",
  },
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
