import { getCatalogModelMetadata, getModelCatalog, isDeprecatedModel } from "./catalog.ts";
import type { APIModelDefinition } from "../../types.ts";
import type { SupportedAPIProviderId } from "./types.ts";

function toModelDefinition(modelId: string): APIModelDefinition {
  return {
    id: modelId,
    name: modelId,
  };
}

export async function assertConfiguredModelAllowed(
  providerId: SupportedAPIProviderId,
  modelId: string,
): Promise<void> {
  const catalog = await getModelCatalog();
  const metadata = getCatalogModelMetadata(providerId, toModelDefinition(modelId), catalog);

  if (isDeprecatedModel(metadata)) {
    const displayName = metadata?.name || modelId;
    throw new Error(
      `Configured model '${displayName}' (${modelId}) is deprecated for provider '${providerId}'. ` +
        "Run 'ai-git configure' to choose a supported model.",
    );
  }
}
