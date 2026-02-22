import { getApiKey as getApiKeyFromSecrets } from "../../lib/secrets/index.ts";

// ==============================================================================
// API UTILITIES
// ==============================================================================

/**
 * Get the API key for a provider.
 * First checks if a key was provided directly (for setup validation),
 * then falls back to the secrets manager.
 *
 * @param providerId - The provider ID (e.g., "openrouter", "anthropic")
 * @param providedKey - Optional key provided directly (for validation)
 * @returns The API key
 * @throws Error if no API key is found
 */
export async function getApiKey(providerId: string, providedKey?: string): Promise<string> {
  // If key is provided directly (during setup validation), use it
  if (providedKey) {
    return providedKey;
  }

  // Otherwise, get from secrets manager
  const key = await getApiKeyFromSecrets(providerId);
  if (!key) {
    throw new Error(
      `No API key found for ${providerId}. ` + `Run 'ai-git configure' to configure your API key.`,
    );
  }
  return key;
}

/**
 * API request timeout in milliseconds.
 */
export const API_TIMEOUT_MS = 60000;

/**
 * Create an AbortController with timeout.
 * @param timeoutMs - Timeout in milliseconds (default: 60s)
 * @returns Abort controller and cleanup function
 */
export function createTimeoutController(timeoutMs: number = API_TIMEOUT_MS): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Common headers for API requests.
 */
export const COMMON_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "ai-git-cli",
};
