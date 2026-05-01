import type { CLIProviderAdapter } from "../../providers/types.ts";
import { getAdapter } from "../../providers/index.ts";
import type { CachedModel } from "../model-cache.ts";

interface LoadDynamicCLIModelsOptions {
  providerName: string;
  adapter?: CLIProviderAdapter;
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

  return models.map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
  }));
}
