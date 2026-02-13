import type { SecretsManager } from "./types.ts";

// ==============================================================================
// BUN SECRETS IMPLEMENTATION
// ==============================================================================

/**
 * Secrets manager using Bun's built-in cross-platform credential API.
 *
 * Uses native keychain services on each platform:
 * - macOS: Keychain Services (same as the `security` CLI)
 * - Linux: libsecret (GNOME Keyring / KDE Wallet)
 * - Windows: Windows Credential Manager
 */
export class BunSecretsManager implements SecretsManager {
  async setSecret(service: string, account: string, secret: string): Promise<void> {
    await Bun.secrets.set({ service, name: account, value: secret });
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    return await Bun.secrets.get({ service, name: account });
  }

  async deleteSecret(service: string, account: string): Promise<boolean> {
    return await Bun.secrets.delete({ service, name: account });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await Bun.secrets.get({ service: "ai-git", name: "__probe__" });
      return true;
    } catch {
      return false;
    }
  }
}
