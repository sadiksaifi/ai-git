import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { hostname, userInfo } from "node:os";
import * as path from "node:path";
import type { SecretsManager } from "./types.ts";

// ==============================================================================
// ENCRYPTED FILE SECRETS IMPLEMENTATION
// ==============================================================================

/**
 * AES-256-GCM encrypted file fallback for environments without a keyring daemon
 * (containers, headless servers, WSL).
 *
 * Storage: ~/.config/ai-git/secrets.enc
 * Key derivation: SHA-256 of machine-specific identifiers
 * Encryption: AES-256-GCM with unique IV per entry
 */

interface EncryptedEntry {
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

interface SecretsFile {
  version: 1;
  secrets: Record<string, EncryptedEntry>;
}

const SECRETS_PATH = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".config",
  "ai-git",
  "secrets.enc"
);

function makeKey(service: string, account: string): string {
  return `${service}:${account}`;
}

async function deriveEncryptionKey(): Promise<Buffer> {
  let machineId = "";

  // Try /etc/machine-id (Linux)
  try {
    const file = Bun.file("/etc/machine-id");
    machineId = (await file.text()).trim();
  } catch {
    // Fallback: hostname + username
    machineId = `${hostname()}:${userInfo().username}`;
  }

  return createHash("sha256")
    .update(`ai-git-secrets:${machineId}`)
    .digest();
}

function encrypt(plaintext: string, key: Buffer): EncryptedEntry {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decrypt(entry: EncryptedEntry, key: Buffer): string {
  const iv = Buffer.from(entry.iv, "base64");
  const tag = Buffer.from(entry.tag, "base64");
  const data = Buffer.from(entry.data, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

async function readStore(): Promise<SecretsFile> {
  try {
    const file = Bun.file(SECRETS_PATH);
    if (!(await file.exists())) {
      return { version: 1, secrets: {} };
    }
    return (await file.json()) as SecretsFile;
  } catch {
    return { version: 1, secrets: {} };
  }
}

async function writeStore(store: SecretsFile): Promise<void> {
  // Ensure parent directory exists
  const dir = path.dirname(SECRETS_PATH);
  const { mkdirSync } = await import("node:fs");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Directory may already exist
  }
  await Bun.write(SECRETS_PATH, JSON.stringify(store, null, 2));
}

export class EncryptedFileSecretsManager implements SecretsManager {
  private keyPromise: Promise<Buffer> | null = null;

  private getKey(): Promise<Buffer> {
    if (!this.keyPromise) {
      this.keyPromise = deriveEncryptionKey();
    }
    return this.keyPromise;
  }

  async setSecret(
    service: string,
    account: string,
    secret: string
  ): Promise<void> {
    const key = await this.getKey();
    const store = await readStore();
    store.secrets[makeKey(service, account)] = encrypt(secret, key);
    await writeStore(store);
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    const key = await this.getKey();
    const store = await readStore();
    const entry = store.secrets[makeKey(service, account)];
    if (!entry) return null;
    try {
      return decrypt(entry, key);
    } catch {
      return null;
    }
  }

  async deleteSecret(service: string, account: string): Promise<boolean> {
    const store = await readStore();
    const k = makeKey(service, account);
    if (!(k in store.secrets)) return false;
    delete store.secrets[k];
    await writeStore(store);
    return true;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
