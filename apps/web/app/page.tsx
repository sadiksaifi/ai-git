import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Providers } from "@/components/landing/providers";
import { Installation } from "@/components/landing/installation";
import { Footer } from "@/components/landing/footer";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-git.dev";

// JSON-LD structured data for SEO
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AI Git",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Linux, Windows",
  description:
    "AI-powered CLI tool that generates semantically correct, Conventional Commits-compliant git commit messages. Supports multiple AI providers including Claude Code, Gemini CLI, OpenRouter, OpenAI, and Anthropic.",
  url: siteUrl,
  author: {
    "@type": "Person",
    name: "Sadik Saifi",
    url: "https://sadiksaifi.dev",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  license: "https://opensource.org/licenses/MIT",
  downloadUrl: "https://github.com/sadiksaifi/ai-git",
  softwareVersion: "2.0.0",
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5",
    ratingCount: "1",
  },
  featureList: [
    "AI-powered commit message generation",
    "Conventional Commits compliance",
    "Multiple AI provider support",
    "Interactive terminal UI",
    "Secure API key storage",
    "Token-efficient prompts",
  ],
};

export default function Page() {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Providers />
        <Installation />
      </main>
      <Footer />
    </>
  );
}
