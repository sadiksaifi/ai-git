#!/usr/bin/env bun
import * as path from "node:path";

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const PROVIDERS = ["anthropic", "openai", "google"] as const;

type CatalogProviderId = (typeof PROVIDERS)[number];

type RawModel = {
  name?: string;
  status?: "alpha" | "beta" | "deprecated";
  release_date?: string;
  last_updated?: string;
  reasoning?: boolean;
  tool_call?: boolean;
};

type RawProvider = {
  models?: Record<string, RawModel>;
};

type RawResponse = Record<string, RawProvider>;

type SnapshotModel = {
  id: string;
  name: string;
  status?: "alpha" | "beta" | "deprecated";
  releaseDate?: string;
  lastUpdated?: string;
  reasoning: boolean;
  toolCall: boolean;
};

type Snapshot = Record<CatalogProviderId, { models: Record<string, SnapshotModel> }>;

function sortObjectByKeys<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
  );
}

async function fetchModelsDevRaw(): Promise<RawResponse> {
  const response = await fetch(MODELS_DEV_API_URL, {
    headers: {
      "User-Agent": "ai-git-cli",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev catalog (${response.status})`);
  }

  return (await response.json()) as RawResponse;
}

function toSnapshot(raw: RawResponse): Snapshot {
  const snapshot = {} as Snapshot;

  for (const providerId of PROVIDERS) {
    const providerModels = raw[providerId]?.models || {};
    const snapshotModels: Record<string, SnapshotModel> = {};

    for (const [id, model] of Object.entries(providerModels)) {
      snapshotModels[id] = {
        id,
        name: model.name || id,
        ...(model.status ? { status: model.status } : {}),
        ...(model.release_date ? { releaseDate: model.release_date } : {}),
        ...(model.last_updated ? { lastUpdated: model.last_updated } : {}),
        reasoning: model.reasoning ?? false,
        toolCall: model.tool_call ?? false,
      };
    }

    snapshot[providerId] = {
      models: sortObjectByKeys(snapshotModels),
    };
  }

  return snapshot;
}

function renderSnapshotFile(snapshot: Snapshot): string {
  const serialized = JSON.stringify(snapshot, null, 2)
    .replace(/"([a-zA-Z0-9_]+)":/g, "$1:");

  return [
    'import type { CatalogModelDefinition, CatalogProviderId } from "./types.ts";',
    "",
    "export interface SnapshotProviderData {",
    "  models: Record<string, CatalogModelDefinition>;",
    "}",
    "",
    "export const MODEL_CATALOG_SNAPSHOT: Record<CatalogProviderId, SnapshotProviderData> = " +
      serialized +
      ";",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const raw = await fetchModelsDevRaw();
  const snapshot = toSnapshot(raw);

  const targetFile = path.resolve(
    import.meta.dir,
    "../src/providers/api/models/snapshot.ts"
  );

  await Bun.write(targetFile, renderSnapshotFile(snapshot));

  for (const providerId of PROVIDERS) {
    const count = Object.keys(snapshot[providerId].models).length;
    console.log(`${providerId}: ${count} models`);
  }

  console.log(`Updated ${targetFile}`);
}

await main();
