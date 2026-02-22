// @ts-check
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/astro";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  adapter: alchemy(),
  vite: {
    plugins: [tailwindcss()],
  },
});
