// Creates/updates a Cloudflare Single Redirect rule:
//   www.<DOMAIN>/* -> <DOMAIN>/* (301, path + query preserved)
//
// Works around Alchemy 0.91.2 RedirectRule bugs:
//   - requestUrl generates invalid "and ssl" suffix
//   - expression mode only supports static target_url.value (no path capture)
//
// Requires CLOUDFLARE_API_TOKEN and DOMAIN in apps/web/.env.
// Idempotent: if a rule with the same description exists, it's patched.

import { config } from "dotenv";

config({ path: "./.env" });

const token = process.env.CLOUDFLARE_API_TOKEN;
const domain = process.env.DOMAIN;

if (!token) throw new Error("CLOUDFLARE_API_TOKEN missing in apps/web/.env");
if (!domain) throw new Error("DOMAIN missing in apps/web/.env");

const www = `www.${domain}`;
const apex = `https://${domain}`;
const description = "www-to-apex";

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const cf = (path: string, init?: RequestInit) =>
  fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  });

console.log(`Resolving zone for ${domain}...`);
const zRes = await cf(`/zones?name=${encodeURIComponent(domain)}`);
const zJson = (await zRes.json()) as { success: boolean; result: Array<{ id: string }> };
if (!zJson.success || !zJson.result[0]) throw new Error(`Zone not found: ${domain}`);
const zoneId = zJson.result[0].id;
console.log(`  zone id: ${zoneId}`);

console.log(`Locating redirect ruleset (http_request_dynamic_redirect phase)...`);
let ruleset: { id: string; rules: Array<{ id: string; description?: string }> } | null = null;
const rsRes = await cf(`/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);
if (rsRes.ok) {
  const rsJson = (await rsRes.json()) as {
    success: boolean;
    result: { id: string; rules?: Array<{ id: string; description?: string }> };
  };
  if (rsJson.success) {
    ruleset = { id: rsJson.result.id, rules: rsJson.result.rules ?? [] };
    console.log(`  found ruleset ${ruleset.id} with ${ruleset.rules.length} rule(s)`);
  }
}

if (!ruleset) {
  console.log(`  no ruleset; creating...`);
  const createRs = await cf(`/zones/${zoneId}/rulesets`, {
    method: "POST",
    body: JSON.stringify({
      name: "Redirect rules",
      kind: "zone",
      phase: "http_request_dynamic_redirect",
      rules: [],
    }),
  });
  const createJson = (await createRs.json()) as {
    success: boolean;
    result: { id: string; rules?: Array<{ id: string; description?: string }> };
    errors?: unknown;
  };
  if (!createJson.success) {
    console.error(JSON.stringify(createJson, null, 2));
    throw new Error("Failed to create ruleset");
  }
  ruleset = { id: createJson.result.id, rules: createJson.result.rules ?? [] };
  console.log(`  created ruleset ${ruleset.id}`);
}

const ruleBody = {
  action: "redirect",
  description,
  enabled: true,
  expression: `http.host eq "${www}"`,
  action_parameters: {
    from_value: {
      status_code: 301,
      target_url: {
        expression: `concat("${apex}", http.request.uri.path)`,
      },
      preserve_query_string: true,
    },
  },
};

const existing = ruleset.rules.find((r) => r.description === description);

if (existing) {
  console.log(`Updating existing rule ${existing.id}...`);
  const patchRes = await cf(`/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify(ruleBody),
  });
  const patchJson = (await patchRes.json()) as { success: boolean; errors?: unknown };
  if (!patchJson.success) {
    console.error(JSON.stringify(patchJson, null, 2));
    throw new Error("Patch failed");
  }
  console.log(`  ✓ updated`);
} else {
  console.log(`Creating new rule...`);
  const postRes = await cf(`/zones/${zoneId}/rulesets/${ruleset.id}/rules`, {
    method: "POST",
    body: JSON.stringify(ruleBody),
  });
  const postJson = (await postRes.json()) as { success: boolean; errors?: unknown };
  if (!postJson.success) {
    console.error(JSON.stringify(postJson, null, 2));
    throw new Error("Create failed");
  }
  console.log(`  ✓ created`);
}

console.log(`\nDone. Test: curl -sI https://${www}/some-path`);
