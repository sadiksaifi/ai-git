import { describe, test, expect } from "bun:test";
import { PROVIDERS as META_PROVIDERS } from "@ai-git/content/cli";
import { PROVIDERS as REGISTRY_PROVIDERS } from "./registry.ts";

/**
 * Ensures @ai-git/content/cli's PROVIDERS (display metadata) and the runtime
 * registry (adapters, models) stay in sync. A drift here would cause
 * getInstallInfo() to silently return undefined for a valid provider.
 */
describe("provider sync", () => {
  const metaIds = new Set(Object.keys(META_PROVIDERS));
  const registryIds = new Set(REGISTRY_PROVIDERS.map((p) => p.id));

  test("every runtime provider has a matching @ai-git/content/cli entry", () => {
    for (const id of registryIds) {
      expect(metaIds.has(id)).toBe(true);
    }
  });

  test("every @ai-git/content/cli provider has a matching runtime registry entry", () => {
    for (const id of metaIds) {
      expect(registryIds.has(id)).toBe(true);
    }
  });
});
