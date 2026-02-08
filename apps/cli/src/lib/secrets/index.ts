import { MacOSSecretsManager } from "./macos.ts";
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

/** Singleton instance of the secrets manager */
let secretsManagerInstance: SecretsManager | null = null;

/**
 * Get the platform-appropriate secrets manager.
 *
 * Currently only macOS is supported. Linux and Windows support is planned.
 *
 * @throws Error if the current platform is not supported
 */
export function getSecretsManager(): SecretsManager {
  if (secretsManagerInstance) {
    return secretsManagerInstance;
  }

  if (process.platform === "darwin") {
    secretsManagerInstance = new MacOSSecretsManager();
    return secretsManagerInstance;
  }

  // Linux and Windows support coming soon
  throw new Error(
    "API mode is currently only available on macOS. " +
      "Support for Linux and Windows is coming soon.\n\n" +
      "For now, please use CLI mode with an installed AI CLI tool."
  );
}

/**
 * Check if secrets management is available on this platform.
 */
export function isSecretsAvailable(): boolean {
  return process.platform === "darwin";
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
  const manager = getSecretsManager();
  await manager.setSecret(API_KEY_SERVICE, getApiKeyAccount(providerId), apiKey);
}

/**
 * Retrieve an API key for a provider.
 * @param providerId - The provider ID (e.g., "openrouter", "anthropic")
 * @returns The API key, or null if not found
 */
export async function getApiKey(providerId: string): Promise<string | null> {
  const manager = getSecretsManager();
  return manager.getSecret(API_KEY_SERVICE, getApiKeyAccount(providerId));
}

/**
 * Delete an API key for a provider.
 * @param providerId - The provider ID (e.g., "openrouter", "anthropic")
 * @returns true if deleted, false if not found
 */
export async function deleteApiKey(providerId: string): Promise<boolean> {
  const manager = getSecretsManager();
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
