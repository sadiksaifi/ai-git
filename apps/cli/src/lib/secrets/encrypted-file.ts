import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import * as os from "node:os";
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
 * Key derivation: scrypt of machine-specific identifiers with a random salt
 * Encryption: AES-256-GCM with unique IV per entry
 *
 * Threat model: protects secrets at rest from casual exposure. Not designed to
 * resist a determined attacker with local access to both the secrets file and
 * the machine-id / hostname used for key derivation.
 */

interface EncryptedEntry {
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

interface SecretsFile {
  version: 1;
  salt: string; // base64, 16-byte random, generated on first use
  secrets: Record<string, EncryptedEntry>;
}

const DEFAULT_SECRETS_PATH = path.join(
  os.homedir(),
  ".config",
  "ai-git",
  "secrets.enc"
);

function makeKey(service: string, account: string): string {
  return `${service}:${account}`;
}

function deriveEncryptionKey(salt: Buffer): Buffer {
  let machineId = "";

  // Try /etc/machine-id (Linux)
  try {
    machineId = readFileSync("/etc/machine-id", "utf8").trim();
  } catch {
    // Fallback: hostname + username
    machineId = `${hostname()}:${userInfo().username}`;
  }

  return scryptSync(`ai-git-secrets:${machineId}`, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
  });
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

async function readStore(secretsPath: string): Promise<SecretsFile> {
  try {
    const file = Bun.file(secretsPath);
    if (!(await file.exists())) {
      return { version: 1, salt: "", secrets: {} };
    }
    const data = (await file.json()) as SecretsFile;
    // Backfill salt for files created before scrypt migration
    if (!data.salt) {
      data.salt = "";
    }
    return data;
  } catch (err) {
    console.warn(
      `[ai-git] Warning: failed to read secrets file at ${secretsPath} — starting fresh.`,
      err instanceof Error ? err.message : err
    );
    return { version: 1, salt: "", secrets: {} };
  }
}

async function writeStore(
  secretsPath: string,
  store: SecretsFile
): Promise<void> {
  const dir = path.dirname(secretsPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Directory may already exist
  }
  await Bun.write(secretsPath, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

export class EncryptedFileSecretsManager implements SecretsManager {
  private readonly secretsPath: string;
  private cachedKey: Buffer | null = null;
  private cachedSalt: string | null = null;

  constructor(secretsPath?: string) {
    this.secretsPath = secretsPath ?? DEFAULT_SECRETS_PATH;
  }

  private getKey(salt: Buffer): Buffer {
    const saltStr = salt.toString("base64");
    if (this.cachedKey && this.cachedSalt === saltStr) {
      return this.cachedKey;
    }
    this.cachedKey = deriveEncryptionKey(salt);
    this.cachedSalt = saltStr;
    return this.cachedKey;
  }

  private ensureSalt(store: SecretsFile): Buffer {
    if (store.salt) {
      return Buffer.from(store.salt, "base64");
    }
    const salt = randomBytes(16);
    store.salt = salt.toString("base64");
    return salt;
  }

  async setSecret(
    service: string,
    account: string,
    secret: string
  ): Promise<void> {
    const store = await readStore(this.secretsPath);
    const salt = this.ensureSalt(store);
    const key = this.getKey(salt);
    store.secrets[makeKey(service, account)] = encrypt(secret, key);
    await writeStore(this.secretsPath, store);
  }

  async getSecret(service: string, account: string): Promise<string | null> {
    const store = await readStore(this.secretsPath);
    if (!store.salt) return null;
    const salt = Buffer.from(store.salt, "base64");
    const key = this.getKey(salt);
    const entry = store.secrets[makeKey(service, account)];
    if (!entry) return null;
    try {
      return decrypt(entry, key);
    } catch {
      return null;
    }
  }

  async deleteSecret(service: string, account: string): Promise<boolean> {
    const store = await readStore(this.secretsPath);
    const k = makeKey(service, account);
    if (!(k in store.secrets)) return false;
    delete store.secrets[k];
    await writeStore(this.secretsPath, store);
    return true;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
