// ==============================================================================
// @ai-git/content — Shared Content Types
// ==============================================================================

export interface HeroContent {
  headline: string;
  subheadline: string;
  cta: { label: string; href: string };
}

export interface InstallTab {
  id: "npm" | "brew" | "curl" | "source";
  label: string;
  command: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface SocialLink {
  label: string;
  href: string;
  icon: string;
}

export interface OGImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface PageSEO {
  title: string;
  description: string;
}
