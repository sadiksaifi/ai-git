#!/usr/bin/env bun
import * as path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  PROVIDER_MODEL_RULES,
  matchesProviderRules,
} from "../src/providers/api/models/provider-rules.ts";
import { PROVIDERS } from "../src/providers/registry.ts";

const MODELS_DEV_API_URL = "https://models.dev/api.json";

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
): string {
  const rawModels = payload[provider]?.models ?? {};

  const ruleProvider = provider === "google" ? "google-ai-studio" : provider;
  const rules = PROVIDER_MODEL_RULES[ruleProvider];

  const candidates: Candidate[] = Object.entries(rawModels)
    .filter(([, model]) => model.status !== "deprecated")
    .filter(([id]) => matchesProviderRules(ruleProvider, id))
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

function updateStaticCLIModels(schema: Record<string, unknown>): void {
  const allOf = schema.allOf as Array<Record<string, unknown>>;
  const descriptions: Record<string, string> = {
    "claude-code":
      "Claude Code virtual model ID. Fable, Sonnet, and Opus support low, medium, high, xhigh, and max. Haiku has no effort level and is recommended for this latency-sensitive workload.",
    codex:
      "Codex CLI virtual model ID: '<base-model>-<effort>'. Supported effort levels depend on the model and include low, medium, high, xhigh, and max. Default: 'gpt-5.6-luna-low'. Ultra is not a model effort and is not supported.",
    "gemini-cli": "Gemini CLI model to use. 'gemini-3-flash-preview' is recommended for speed.",
  };

  for (const provider of PROVIDERS.filter(
    (entry) => entry.mode === "cli" && !entry.dynamicModels,
  )) {
    const match = allOf.find(
      (entry) => (entry.if as any)?.properties?.provider?.const === provider.id,
    );
    if (!match) continue;

    const modelSchema = ((match.then as any)?.properties?.model ?? {}) as Record<string, unknown>;
    modelSchema.enum = provider.models.map((model) => model.id);
    modelSchema.description = descriptions[provider.id];
    (match.then as any).properties.model = modelSchema;
  }
}

async function main(): Promise<void> {
  const payload = await fetchModelsDev();

  const openAIExample = pickProviderExample("openai", payload);
  const googleExample = pickProviderExample("google", payload);
  const anthropicExample = pickProviderExample("anthropic", payload);
  const openRouterExample = `openai/${openAIExample}`;

  const schemaPath = path.resolve(import.meta.dir, "../../../schema.json");
  const current = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, any>;

  const staticCliExamples = PROVIDERS.filter(
    (provider) => provider.mode === "cli" && !provider.dynamicModels,
  ).flatMap((provider) =>
    provider.models.filter((model) => model.isRecommended).map((model) => model.id),
  );

  current.properties.model.examples = unique([
    ...staticCliExamples,
    "opencode/gpt-5-nano#minimal",
    "openai-codex/gpt-5.6-luna#low",
    openRouterExample,
    openAIExample,
    googleExample,
    anthropicExample,
  ]);

  updateProviderDescription(current, "openrouter", openRouterExample);
  updateProviderDescription(current, "openai", openAIExample);
  updateProviderDescription(current, "google-ai-studio", googleExample);
  updateProviderDescription(current, "anthropic", anthropicExample);
  updateStaticCLIModels(current);

  await writeFile(schemaPath, JSON.stringify(current, null, 2) + "\n", "utf8");

  console.log(`Updated ${schemaPath}`);
  console.log(`openrouter example: ${openRouterExample}`);
  console.log(`openai example: ${openAIExample}`);
  console.log(`google example: ${googleExample}`);
  console.log(`anthropic example: ${anthropicExample}`);
}

await main();
