import { $ } from "bun";

// ==============================================================================
// CROSS-PLATFORM KEYCHAIN WRAPPER
// ==============================================================================

/**
 * Cross-platform secure credential storage using native OS keychain APIs.
 *
 * Supported platforms:
 * - macOS: Uses `security` command (Keychain Access)
 * - Windows: Uses `cmdkey` command (Credential Manager)
 * - Linux: Uses `secret-tool` command (libsecret/GNOME Keyring)
 *
 * Falls back gracefully if keychain is unavailable.
 */

const SERVICE_NAME = "ai-git";

type Platform = "darwin" | "win32" | "linux";

/**
 * Get the current platform.
 */
function getPlatform(): Platform {
  const platform = process.platform;
  if (platform === "darwin" || platform === "win32" || platform === "linux") {
    return platform;
  }
  // Default to linux for other unix-like systems
  return "linux";
}

/**
 * Check if keychain tools are available on the current platform.
 */
export async function isKeychainAvailable(): Promise<boolean> {
  const platform = getPlatform();

  try {
    switch (platform) {
      case "darwin":
        await $`which security`.quiet();
        return true;
      case "win32":
        // cmdkey is built into Windows, should always be available
        await $`where cmdkey`.quiet();
        return true;
      case "linux":
        await $`which secret-tool`.quiet();
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Retrieve a secret from the OS keychain.
 *
 * @param service - Service name (usually "ai-git")
 * @param account - Account/key name (e.g., "openrouter-api-key")
 * @returns The secret value, or undefined if not found
 */
export async function getSecret(
  service: string,
  account: string
): Promise<string | undefined> {
  const platform = getPlatform();

  try {
    switch (platform) {
      case "darwin": {
        // macOS: security find-generic-password -s <service> -a <account> -w
        const proc = Bun.spawn(
          ["security", "find-generic-password", "-s", service, "-a", account, "-w"],
          { stdout: "pipe", stderr: "pipe" }
        );
        const stdout = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        if (exitCode !== 0) return undefined;
        return stdout.trim();
      }

      case "win32": {
        // Windows: Use PowerShell to read from Credential Manager
        // cmdkey only lists, doesn't retrieve - need PowerShell CredentialManager
        const target = `${service}:${account}`;
        const proc = Bun.spawn(
          [
            "powershell",
            "-Command",
            `$cred = Get-StoredCredential -Target '${target}'; if ($cred) { $cred.GetNetworkCredential().Password } else { exit 1 }`,
          ],
          { stdout: "pipe", stderr: "pipe" }
        );
        const stdout = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        if (exitCode !== 0) return undefined;
        return stdout.trim();
      }

      case "linux": {
        // Linux: secret-tool lookup service <service> account <account>
        const proc = Bun.spawn(
          ["secret-tool", "lookup", "service", service, "account", account],
          { stdout: "pipe", stderr: "pipe" }
        );
        const stdout = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        if (exitCode !== 0) return undefined;
        return stdout.trim();
      }

      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Store a secret in the OS keychain.
 *
 * @param service - Service name (usually "ai-git")
 * @param account - Account/key name (e.g., "openrouter-api-key")
 * @param password - The secret value to store
 * @returns true if successful, false otherwise
 */
export async function setSecret(
  service: string,
  account: string,
  password: string
): Promise<boolean> {
  const platform = getPlatform();

  try {
    switch (platform) {
      case "darwin": {
        // macOS: First delete existing (ignore errors), then add new
        // security delete-generic-password -s <service> -a <account>
        // security add-generic-password -s <service> -a <account> -w <password>
        try {
          await $`security delete-generic-password -s ${service} -a ${account}`.quiet();
        } catch {
          // Ignore - might not exist
        }

        const proc = Bun.spawn(
          [
            "security",
            "add-generic-password",
            "-s",
            service,
            "-a",
            account,
            "-w",
            password,
          ],
          { stdout: "pipe", stderr: "pipe" }
        );
        const exitCode = await proc.exited;
        return exitCode === 0;
      }

      case "win32": {
        // Windows: Use cmdkey to add credential
        // cmdkey /generic:<target> /user:<account> /pass:<password>
        const target = `${service}:${account}`;

        // First try to delete existing
        try {
          await $`cmdkey /delete:${target}`.quiet();
        } catch {
          // Ignore - might not exist
        }

        const proc = Bun.spawn(
          ["cmdkey", `/generic:${target}`, `/user:${account}`, `/pass:${password}`],
          { stdout: "pipe", stderr: "pipe" }
        );
        const exitCode = await proc.exited;
        return exitCode === 0;
      }

      case "linux": {
        // Linux: secret-tool store --label=<label> service <service> account <account>
        // Password is read from stdin
        const label = `${service} - ${account}`;
        const proc = Bun.spawn(
          [
            "secret-tool",
            "store",
            `--label=${label}`,
            "service",
            service,
            "account",
            account,
          ],
          {
            stdin: new TextEncoder().encode(password),
            stdout: "pipe",
            stderr: "pipe",
          }
        );
        const exitCode = await proc.exited;
        return exitCode === 0;
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Delete a secret from the OS keychain.
 *
 * @param service - Service name (usually "ai-git")
 * @param account - Account/key name (e.g., "openrouter-api-key")
 * @returns true if successful (or not found), false on error
 */
export async function deleteSecret(
  service: string,
  account: string
): Promise<boolean> {
  const platform = getPlatform();

  try {
    switch (platform) {
      case "darwin": {
        // macOS: security delete-generic-password -s <service> -a <account>
        const proc = Bun.spawn(
          ["security", "delete-generic-password", "-s", service, "-a", account],
          { stdout: "pipe", stderr: "pipe" }
        );
        const exitCode = await proc.exited;
        // Exit code 44 means "not found", which is fine
        return exitCode === 0 || exitCode === 44;
      }

      case "win32": {
        // Windows: cmdkey /delete:<target>
        const target = `${service}:${account}`;
        const proc = Bun.spawn(["cmdkey", `/delete:${target}`], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const exitCode = await proc.exited;
        return exitCode === 0;
      }

      case "linux": {
        // Linux: secret-tool clear service <service> account <account>
        const proc = Bun.spawn(
          ["secret-tool", "clear", "service", service, "account", account],
          { stdout: "pipe", stderr: "pipe" }
        );
        const exitCode = await proc.exited;
        return exitCode === 0;
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ==============================================================================
// CONVENIENCE FUNCTIONS FOR AI-GIT
// ==============================================================================

/**
 * Get an API key for a provider from the keychain.
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @returns The API key, or undefined if not found
 */
export async function getApiKeyFromKeychain(
  providerId: string
): Promise<string | undefined> {
  return getSecret(SERVICE_NAME, `${providerId}-api-key`);
}

/**
 * Store an API key for a provider in the keychain.
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @param apiKey - The API key to store
 * @returns true if successful, false otherwise
 */
export async function setApiKeyInKeychain(
  providerId: string,
  apiKey: string
): Promise<boolean> {
  return setSecret(SERVICE_NAME, `${providerId}-api-key`, apiKey);
}

/**
 * Delete an API key for a provider from the keychain.
 *
 * @param providerId - Provider ID (e.g., "openrouter", "openai")
 * @returns true if successful, false otherwise
 */
export async function deleteApiKeyFromKeychain(
  providerId: string
): Promise<boolean> {
  return deleteSecret(SERVICE_NAME, `${providerId}-api-key`);
}
