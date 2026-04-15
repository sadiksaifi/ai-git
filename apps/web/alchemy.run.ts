import alchemy from "alchemy";
import { Website } from "alchemy/cloudflare";
import { config } from "dotenv";
import { type AlchemyEnv, alchemyEnvSchema, createEnvValidator } from "./src/env.ts";

const APP_NAME = "web";

function workerDomainConfig(env: AlchemyEnv) {
  if (!env.DOMAIN) return {};
  return {
    domains: [
      { domainName: env.DOMAIN, adopt: true as const },
      { domainName: `www.${env.DOMAIN}`, adopt: true as const },
    ],
  };
}

function displayUrl(env: AlchemyEnv, fallback: string): string {
  return env.DOMAIN ? `https://${env.DOMAIN}` : fallback;
}

// --- Env ---

config({ path: "./.env" });

const env = createEnvValidator(alchemyEnvSchema)(process.env);

// --- Alchemy ---

const app = await alchemy(APP_NAME, {
  password: env.ALCHEMY_PASSWORD,
  adopt: true,
});

// --- Resources ---

// `build` is intentionally omitted — Alchemy's Website resource spawns the
// build command as a Node subprocess during deploy, which breaks on runners
// where Node is < 22.12 (Astro's minimum). Instead, the caller (local user
// or CI) runs `bun run build` beforehand and Alchemy just uploads `./dist`.
// This matches Alchemy's own pr-preview workflow.
export const site = await Website("site", {
  name: `ai-git-${APP_NAME}`,
  assets: "./dist",
  spa: false,
  url: true,
  adopt: true,
  ...workerDomainConfig(env),
});

// Note: www → apex redirect rule is a one-time setup via
// scripts/setup-www-redirect.ts (run locally with a CF token that has
// Rulesets read/write). Alchemy 0.91.2's RedirectRule generates invalid
// wirefilter ("and ssl") and doesn't expose target_url.expression for
// path capture, so we configure it against CF's REST API directly.

console.info(`Web -> ${displayUrl(env, site.url ?? "http://localhost:4321")}`);

await app.finalize();
