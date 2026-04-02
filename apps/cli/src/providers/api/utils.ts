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

// ==============================================================================
// ERROR FORMATTING
// ==============================================================================

export interface ProviderError {
  userMessage: string;
  suggestion: string;
}

/**
 * Format an API error into a user-facing message with actionable suggestion.
 */
export function formatProviderError(provider: string, status: number, body: string): ProviderError {
  switch (true) {
    case status === 401 || status === 403:
      return {
        userMessage: `${provider} authentication failed`,
        suggestion: "Check your API key — run 'ai-git configure'",
      };
    case status === 404:
      return {
        userMessage: `${provider} model not found`,
        suggestion: "Run 'ai-git configure' to select a valid model",
      };
    case status === 429:
      return {
        userMessage: `${provider} rate limit exceeded`,
        suggestion: "Wait a moment or try a different model",
      };
    case status >= 500 && status < 600:
      return {
        userMessage: `${provider} server error`,
        suggestion: `Check ${provider} status page and try again later`,
      };
    default: {
      const truncated = body.length > 200 ? `${body.slice(0, 200)}...` : body;
      return {
        userMessage: `${provider} API error (${status})`,
        suggestion: truncated || "No additional details available",
      };
    }
  }
}
