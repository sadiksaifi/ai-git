// @ts-check
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/astro";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://ai-git.xyz",
  adapter: alchemy(),
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
