// @ts-check
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  output: "static",
  site: "https://ai-git.xyz",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
