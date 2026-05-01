import type { CLIProviderAdapter } from "../../providers/types.ts";
import { getAdapter } from "../../providers/index.ts";
import { getModelCatalog } from "../../providers/api/models/index.ts";
import type { ModelCatalog } from "../../providers/api/models/types.ts";
import type { CachedModel } from "../model-cache.ts";
import { rankDynamicCLIModels } from "./dynamic-cli-ranking.ts";

interface LoadDynamicCLIModelsOptions {
  providerName: string;
  adapter?: CLIProviderAdapter;
  loadCatalog?: (options?: { signal?: AbortSignal }) => Promise<ModelCatalog>;
  catalogTimeoutMs?: number;
}

const DYNAMIC_CLI_CATALOG_TIMEOUT_MS = 1500;

async function loadOptionalCatalog(
  loadCatalog: (options?: { signal?: AbortSignal }) => Promise<ModelCatalog>,
  timeoutMs: number,
): Promise<ModelCatalog | null> {
  const controller = new AbortController();
  let timeout: Timer | undefined;

  const catalogPromise = loadCatalog({ signal: controller.signal }).catch(() => null);
  const timeoutPromise = new Promise<null>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });

  try {
    return await Promise.race([catalogPromise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function loadDynamicCLIModelsForSetup(
  providerId: string,
  options: LoadDynamicCLIModelsOptions,
): Promise<CachedModel[]> {
  const adapter = options.adapter ?? getAdapter(providerId);
  const cliAdapter = adapter?.mode === "cli" ? (adapter as CLIProviderAdapter) : undefined;

  if (!cliAdapter?.fetchModels) {
    throw new Error(`${options.providerName} does not support live model listing.`);
  }

  const models = await cliAdapter.fetchModels();
  if (models.length === 0) {
    throw new Error(
      `${options.providerName} returned no usable models. Check your CLI authentication/configuration and try again.`,
    );
  }

  const rows = models.map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
  }));

  const catalog = await loadOptionalCatalog(
    options.loadCatalog ?? getModelCatalog,
    options.catalogTimeoutMs ?? DYNAMIC_CLI_CATALOG_TIMEOUT_MS,
  );
  return rankDynamicCLIModels(rows, catalog);
}
