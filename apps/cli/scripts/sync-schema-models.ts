#!/usr/bin/env bun
import * as path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  PROVIDER_MODEL_RULES,
  matchesProviderRules,
} from "../src/providers/api/models/provider-rules.ts";
import { PROVIDERS } from "../src/providers/registry.ts";
import { buildClaudeCodeModels } from "../src/providers/cli/claude-code.ts";
import {
  MODELS_DEV_API_URL,
  createCatalogFromRaw,
} from "../src/providers/api/models/models-dev-client.ts";

type ModelsDevStatus = "alpha" | "beta" | "deprecated";

type ModelsDevModel = {
  status?: ModelsDevStatus;
  release_date?: string;
  last_updated?: string;
};

type ModelsDevProvider = {
  models?: Record<string, ModelsDevModel>;
};

type ModelsDevPayload = Record<string, ModelsDevProvider>;

type Candidate = {
  id: string;
  status?: ModelsDevStatus;
  lastUpdated: string;
  releaseDate: string;
  previewPenalty: number;
};

function statusRank(status?: ModelsDevStatus): number {
  if (status === "beta") return 1;
  if (status === "alpha") return 2;
  return 0;
}

function previewPenalty(modelId: string): number {
  return /preview|experimental|exp|thinking/i.test(modelId) ? 1 : 0;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const updatedDiff = b.lastUpdated.localeCompare(a.lastUpdated);
  if (updatedDiff !== 0) return updatedDiff;

  const releaseDiff = b.releaseDate.localeCompare(a.releaseDate);
  if (releaseDiff !== 0) return releaseDiff;

  const statusDiff = statusRank(a.status) - statusRank(b.status);
  if (statusDiff !== 0) return statusDiff;

  const previewDiff = a.previewPenalty - b.previewPenalty;
  if (previewDiff !== 0) return previewDiff;

  return a.id.localeCompare(b.id);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function pickProviderExample(
  provider: "openai" | "anthropic" | "google",
  payload: ModelsDevPayload,
  filter: (modelId: string) => boolean = () => true,
): string {
  const rawModels = payload[provider]?.models ?? {};

  const ruleProvider = provider === "google" ? "google-ai-studio" : provider;
  const rules = PROVIDER_MODEL_RULES[ruleProvider];

  const candidates: Candidate[] = Object.entries(rawModels)
    .filter(([, model]) => model.status !== "deprecated")
    .filter(([id]) => matchesProviderRules(ruleProvider, id) && filter(id))
    .map(([id, model]) => ({
      id,
      status: model.status,
      lastUpdated: model.last_updated || "",
      releaseDate: model.release_date || "",
      previewPenalty: previewPenalty(id),
    }))
    .sort(compareCandidates);

  const seen = new Set<string>();
  const deduped = candidates.filter((candidate) => {
    const key = rules.dedupeKey(candidate.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const chosen = deduped[0]?.id;
  if (!chosen) {
    throw new Error(`No usable ${provider} models found from models.dev`);
  }

  return chosen;
}

async function fetchModelsDev(): Promise<ModelsDevPayload> {
  const response = await fetch(MODELS_DEV_API_URL, {
    headers: {
      "User-Agent": "ai-git-cli",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev (${response.status})`);
  }

  return (await response.json()) as ModelsDevPayload;
}

function updateProviderDescription(
  schema: Record<string, unknown>,
  providerId: string,
  example: string,
): void {
  const allOf = schema.allOf as Array<Record<string, unknown>>;
  const match = allOf.find((entry) => {
    const ifProps = (entry.if as any)?.properties;
    return ifProps?.provider?.const === providerId;
  });

  if (!match) return;

  const modelSchema = ((match.then as any)?.properties?.model ?? {}) as Record<string, unknown>;

  let providerLabel = providerId;
  if (providerId === "openrouter") providerLabel = "OpenRouter";
  if (providerId === "openai") providerLabel = "OpenAI";
  if (providerId === "google-ai-studio") providerLabel = "Google AI Studio";
  if (providerId === "anthropic") providerLabel = "Anthropic API";

  modelSchema.description = `${providerLabel} model ID (e.g., '${example}'). Models are fetched dynamically.`;

  (match.then as any).properties.model = modelSchema;
}

const CLI_MODEL_DESCRIPTIONS: Record<string, (example: string) => string> = {
  "claude-code": (example) =>
    `Claude Code model: '<alias>#<effort>' (e.g., '${example}'). Aliases and effort levels come from models.dev and \`claude --help\` during \`ai-git configure\`.`,
  "antigravity-cli": (example) =>
    `Antigravity CLI model ID (e.g., '${example}'). Models are fetched dynamically.`,
  codex: (example) =>
    `Codex model: '<model>#<effort>' (e.g., '${example}'). Models are fetched dynamically from \`codex debug models\`.`,
  opencode: () =>
    "OpenCode model ID fetched dynamically from `opencode models --verbose`. Variant selections use '<base-model>#<variant>'.",
  pi: () =>
    "Pi model ID fetched dynamically from Pi's RPC mode. Thinking selections use '<provider/model>#<thinking>'.",
};

function findProviderModelSchema(
  schema: Record<string, unknown>,
  providerId: string,
): Record<string, unknown> | null {
  const allOf = schema.allOf as Array<Record<string, unknown>>;
  const match = allOf.find(
    (entry) => (entry.if as any)?.properties?.provider?.const === providerId,
  );
  return match ? (((match.then as any).properties.model ??= {}) as Record<string, unknown>) : null;
}

function updateCLIModelSchemas(
  schema: Record<string, unknown>,
  examples: Record<string, string>,
): void {
  for (const provider of PROVIDERS.filter((entry) => entry.mode === "cli")) {
    const modelSchema = findProviderModelSchema(schema, provider.id);
    const describe = CLI_MODEL_DESCRIPTIONS[provider.id];
    if (!modelSchema || !describe) continue;

    delete modelSchema.enum;
    modelSchema.type = "string";
    modelSchema.description = describe(examples[provider.id] ?? "");
  }
}

function updateProviderEnum(schema: Record<string, any>): void {
  const ids = PROVIDERS.map((provider) => provider.id);
  schema.properties.provider.enum = ids;
  schema.properties.provider.examples = ids;
}

function pickClaudeCodeExample(payload: ModelsDevPayload): string {
  const catalog = createCatalogFromRaw(payload, "network");
  const models = buildClaudeCodeModels(catalog.providers.anthropic.models, null);
  const example = models.find((model) => model.isRecommended)?.id;
  if (!example) {
    throw new Error("No Claude model families found from models.dev");
  }
  return example;
}

export function updateSchemaModels(
  current: Record<string, any>,
  payload: ModelsDevPayload,
): {
  openRouterExample: string;
  openAIExample: string;
  googleExample: string;
  anthropicExample: string;
  cliExamples: Record<string, string>;
} {
  const openAIExample = pickProviderExample("openai", payload);
  const googleExample = pickProviderExample("google", payload);
  const googleFlashExample = pickProviderExample("google", payload, (id) => /flash/i.test(id));
  const anthropicExample = pickProviderExample("anthropic", payload);
  const openRouterExample = `openai/${openAIExample}`;

  const cliExamples: Record<string, string> = {
    codex: `${openAIExample}#low`,
    "claude-code": pickClaudeCodeExample(payload),
    "antigravity-cli": `${googleFlashExample}-low`,
    opencode: `openai/${openAIExample}#low`,
    pi: `openai-codex/${openAIExample}#low`,
  };

  current.properties.model.examples = unique([
    ...Object.values(cliExamples),
    openRouterExample,
    openAIExample,
    googleExample,
    anthropicExample,
  ]);

  updateProviderEnum(current);
  updateProviderDescription(current, "openrouter", openRouterExample);
  updateProviderDescription(current, "openai", openAIExample);
  updateProviderDescription(current, "google-ai-studio", googleExample);
  updateProviderDescription(current, "anthropic", anthropicExample);
  updateCLIModelSchemas(current, cliExamples);

  return { openRouterExample, openAIExample, googleExample, anthropicExample, cliExamples };
}

async function main(): Promise<void> {
  const payload = await fetchModelsDev();
  const schemaPath = path.resolve(import.meta.dir, "../../../schema.json");
  const current = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, any>;

  const examples = updateSchemaModels(current, payload);

  await writeFile(schemaPath, JSON.stringify(current, null, 2) + "\n", "utf8");

  console.log(`Updated ${schemaPath}`);
  console.log(`openrouter example: ${examples.openRouterExample}`);
  console.log(`openai example: ${examples.openAIExample}`);
  console.log(`google example: ${examples.googleExample}`);
  console.log(`anthropic example: ${examples.anthropicExample}`);
  for (const [providerId, example] of Object.entries(examples.cliExamples)) {
    console.log(`${providerId} example: ${example}`);
  }
}

if (import.meta.main) await main();
