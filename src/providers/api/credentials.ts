import {
  getApiKeyFromKeychain,
  setApiKeyInKeychain,
  deleteApiKeyFromKeychain,
  isKeychainAvailable,
} from "../../lib/keychain.ts";
import { getProviderById } from "../registry.ts";

// ==============================================================================
// API CREDENTIAL MANAGEMENT
// ==============================================================================

/**
 * Environment variable names for each API provider.
 */
export const API_KEY_ENV_VARS: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
};

/**
 * Get the environment variable name for a provider's API key.
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @returns The environment variable name, or undefined if not a known API provider
 */
export function getEnvVarName(providerId: string): string | undefined {
  const provider = getProviderById(providerId);
  if (provider?.mode === "api" && provider.envVar) {
    return provider.envVar;
  }
  return API_KEY_ENV_VARS[providerId];
}

/**
 * Get an API key for a provider.
 *
 * Resolution order:
 * 1. Environment variable (e.g., OPENROUTER_API_KEY)
 * 2. OS Keychain (secure storage)
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @returns The API key, or undefined if not found
 */
export async function getApiKey(
  providerId: string
): Promise<string | undefined> {
  // 1. Check environment variable first
  const envVar = getEnvVarName(providerId);
  if (envVar) {
    const envValue = process.env[envVar];
    if (envValue) {
      return envValue;
    }
  }

  // 2. Check OS keychain
  const keychainValue = await getApiKeyFromKeychain(providerId);
  if (keychainValue) {
    return keychainValue;
  }

  return undefined;
}

/**
 * Store an API key for a provider in the OS keychain.
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @param apiKey - The API key to store
 * @returns true if successful, false otherwise
 */
export async function setApiKey(
  providerId: string,
  apiKey: string
): Promise<boolean> {
  return setApiKeyInKeychain(providerId, apiKey);
}

/**
 * Delete an API key for a provider from the OS keychain.
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @returns true if successful, false otherwise
 */
export async function deleteApiKey(providerId: string): Promise<boolean> {
  return deleteApiKeyFromKeychain(providerId);
}

/**
 * Check if an API key is available for a provider (from any source).
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @returns true if an API key is available
 */
export async function hasApiKey(providerId: string): Promise<boolean> {
  const apiKey = await getApiKey(providerId);
  return !!apiKey;
}

/**
 * Get the source of an API key (for display purposes).
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @returns "env" if from environment, "keychain" if from keychain, undefined if not found
 */
export async function getApiKeySource(
  providerId: string
): Promise<"env" | "keychain" | undefined> {
  // Check environment first
  const envVar = getEnvVarName(providerId);
  if (envVar && process.env[envVar]) {
    return "env";
  }

  // Check keychain
  const keychainValue = await getApiKeyFromKeychain(providerId);
  if (keychainValue) {
    return "keychain";
  }

  return undefined;
}

/**
 * Check if secure keychain storage is available on this system.
 *
 * @returns true if keychain is available
 */
export { isKeychainAvailable };
