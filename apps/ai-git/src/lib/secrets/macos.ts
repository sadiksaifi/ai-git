import { $ } from "bun";
import type { SecretsManager } from "./types.ts";

// ==============================================================================
// macOS KEYCHAIN IMPLEMENTATION
// ==============================================================================

/**
 * Secrets manager implementation using macOS Keychain via the `security` CLI.
 *
 * Uses generic password items in the user's login keychain.
 * The service and account are used to uniquely identify each secret.
 */
export class MacOSSecretsManager implements SecretsManager {
  async setSecret(
    service: string,
    account: string,
    secret: string
  ): Promise<void> {
    try {
      // Use -U flag to update if exists, otherwise add
      // -a: account name
      // -s: service name
      // -w: password (secret)
      // -U: update existing item or add if not found
      await $`security add-generic-password -a ${account} -s ${service} -w ${secret} -U`.quiet();
    } catch (error) {
      // If the add fails, try to delete first and re-add
      // This handles edge cases where -U doesn't work as expected
      try {
        await $`security delete-generic-password -a ${account} -s ${service}`.quiet();
      } catch {
        // Ignore delete errors (item might not exist)
      }

      // Try adding again
      try {
        await $`security add-generic-password -a ${account} -s ${service} -w ${secret}`.quiet();
      } catch (addError) {
        throw new Error(
          `Failed to store secret in keychain: ${addError instanceof Error ? addError.message : "Unknown error"}`
        );
      }
    }
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    try {
      // -w flag outputs only the password
      const result =
        await $`security find-generic-password -a ${account} -s ${service} -w`.text();
      return result.trim();
    } catch {
      // Item not found or other error
      return null;
    }
  }

  async deleteSecret(service: string, account: string): Promise<boolean> {
    try {
      await $`security delete-generic-password -a ${account} -s ${service}`.quiet();
      return true;
    } catch {
      // Item not found or other error
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if security command is available
      await $`which security`.quiet();
      return true;
    } catch {
      return false;
    }
  }
}
