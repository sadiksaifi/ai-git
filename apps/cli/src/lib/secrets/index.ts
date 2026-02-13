import { BunSecretsManager } from "./bun-secrets.ts";
import { EncryptedFileSecretsManager } from "./encrypted-file.ts";
import {
  type SecretsManager,
  API_KEY_SERVICE,
  getApiKeyAccount,
} from "./types.ts";

// Re-export types and utilities
export { type SecretsManager, API_KEY_SERVICE, getApiKeyAccount };

// ==============================================================================
// PLATFORM DETECTION
// ==============================================================================

/** Cached singleton promise for the secrets manager */
let secretsManagerPromise: Promise<SecretsManager> | null = null;

/**
 * Get the platform-appropriate secrets manager.
 *
 * Probes Bun.secrets (native keychain) first, then falls back to
 * AES-256-GCM encrypted file storage for headless environments.
 * The result is cached as a singleton.
 */
export async function getSecretsManager(): Promise<SecretsManager> {
  if (!secretsManagerPromise) {
    secretsManagerPromise = (async () => {
      const bun = new BunSecretsManager();
      if (await bun.isAvailable()) {
        return bun;
      }
      return new EncryptedFileSecretsManager();
    })();
  }
  return secretsManagerPromise;
}

// ==============================================================================
// CONVENIENCE FUNCTIONS
// ==============================================================================

/**
 * Store an API key for a provider.
 * @param providerId - The provider ID (e.g., "openrouter", "anthropic")
 * @param apiKey - The API key to store
 */
export async function setApiKey(
  providerId: string,
  apiKey: string
): Promise<void> {
  const manager = await getSecretsManager();
  await manager.setSecret(API_KEY_SERVICE, getApiKeyAccount(providerId), apiKey);
}

/**
 * Retrieve an API key for a provider.
 * @param providerId - The provider ID (e.g., "openrouter", "anthropic")
 * @returns The API key, or null if not found
 */
export async function getApiKey(providerId: string): Promise<string | null> {
  const manager = await getSecretsManager();
  return manager.getSecret(API_KEY_SERVICE, getApiKeyAccount(providerId));
}

/**
 * Delete an API key for a provider.
 * @param providerId - The provider ID (e.g., "openrouter", "anthropic")
 * @returns true if deleted, false if not found
 */
export async function deleteApiKey(providerId: string): Promise<boolean> {
  const manager = await getSecretsManager();
  return manager.deleteSecret(API_KEY_SERVICE, getApiKeyAccount(providerId));
}

/**
 * Check if an API key exists for a provider.
 * @param providerId - The provider ID (e.g., "openrouter", "anthropic")
 */
export async function hasApiKey(providerId: string): Promise<boolean> {
  const key = await getApiKey(providerId);
  return key !== null && key.length > 0;
}
