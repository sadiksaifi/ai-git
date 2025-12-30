// ==============================================================================
// SECRETS MANAGER INTERFACE
// ==============================================================================

/**
 * Interface for secure credential storage.
 * Platform-specific implementations handle the actual storage mechanism.
 */
export interface SecretsManager {
  /**
   * Store a secret securely.
   * @param service - Service identifier (e.g., "ai-git")
   * @param account - Account identifier (e.g., "openrouter-api-key")
   * @param secret - The secret value to store
   */
  setSecret(service: string, account: string, secret: string): Promise<void>;

  /**
   * Retrieve a stored secret.
   * @param service - Service identifier
   * @param account - Account identifier
   * @returns The secret value, or null if not found
   */
  getSecret(service: string, account: string): Promise<string | null>;

  /**
   * Delete a stored secret.
   * @param service - Service identifier
   * @param account - Account identifier
   * @returns true if deleted, false if not found
   */
  deleteSecret(service: string, account: string): Promise<boolean>;

  /**
   * Check if the secrets manager is available on this platform.
   */
  isAvailable(): Promise<boolean>;
}

// ==============================================================================
// CONSTANTS
// ==============================================================================

/** Service name used for all ai-git API keys in the keychain */
export const API_KEY_SERVICE = "ai-git";

/**
 * Generate the account name for a provider's API key.
 * @param providerId - The provider ID (e.g., "openrouter", "anthropic")
 */
export function getApiKeyAccount(providerId: string): string {
  return `${providerId}-api-key`;
}
