import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://ai-git.xyz",
  output: "static",
  trailingSlash: "never",
  build: {
    format: "file",
    inlineStylesheets: "auto",
    assets: "_assets",
  },
  fonts: [
    {
      name: "Geist",
      cssVariable: "--font-sans",
      provider: fontProviders.google(),
      weights: [400, 500, 600, 700],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
    },
    {
      name: "Geist Mono",
      cssVariable: "--font-mono",
      provider: fontProviders.google(),
      weights: [400, 500],
      subsets: ["latin"],
      fallbacks: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
    },
  ],
  integrations: [sitemap()],
  vite: {
    build: {
      cssMinify: "lightningcss",
    },
  },
});
