// ==============================================================================
// @ai-git/content/web — Web Content Types
// ==============================================================================

export interface HeroContent {
  headline: string;
  subheadline: string;
  primaryCTA: { label: string; command: string };
  secondaryCTA: { label: string; href: string };
}

export interface FeatureShowcaseItem {
  featureId: string;
  headline: string;
  detail: string;
}

export interface HowItWorksStep {
  step: number;
  title: string;
  command: string;
  description: string;
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

export interface IconSize {
  size: string;
  path: string;
}

export interface PageSEO {
  title: string;
  description: string;
}
