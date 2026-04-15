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

export const site = await Website("site", {
  name: `ai-git-${APP_NAME}`,
  build: "bun run build",
  assets: "./dist",
  spa: false,
  url: true,
  adopt: true,
  ...workerDomainConfig(env),
});

// Note: www → apex redirect rule is set up via scripts/setup-www-redirect.ts.
// Alchemy 0.91.2's RedirectRule generates invalid wirefilter ("and ssl") and
// doesn't expose target_url.expression for path capture, so we run it as a
// post-deploy step against CF's REST API directly.

console.info(`Web -> ${displayUrl(env, site.url ?? "http://localhost:4321")}`);

await app.finalize();
