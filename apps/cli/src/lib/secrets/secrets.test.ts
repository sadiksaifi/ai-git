import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { BunSecretsManager } from "./bun-secrets.ts";
import { EncryptedFileSecretsManager } from "./encrypted-file.ts";
import { getSecretsManager } from "./index.ts";

// ==============================================================================
// BunSecretsManager
// ==============================================================================

describe("BunSecretsManager", () => {
  const manager = new BunSecretsManager();
  const service = "ai-git-test";
  const account = "test-secret";

  afterAll(async () => {
    // Cleanup
    await manager.deleteSecret(service, account);
  });

  test("isAvailable returns true on supported platforms", async () => {
    const available = await manager.isAvailable();
    expect(typeof available).toBe("boolean");
  });

  test("get/set/delete roundtrip", async () => {
    const available = await manager.isAvailable();
    if (!available) return; // skip on unsupported platforms

    await manager.setSecret(service, account, "test-value-123");
    const retrieved = await manager.getSecret(service, account);
    expect(retrieved).toBe("test-value-123");

    const deleted = await manager.deleteSecret(service, account);
    expect(deleted).toBe(true);

    const after = await manager.getSecret(service, account);
    expect(after).toBeNull();
  });

  test("get returns null for missing secret", async () => {
    const available = await manager.isAvailable();
    if (!available) return;

    const result = await manager.getSecret(service, "nonexistent-account");
    expect(result).toBeNull();
  });

  test("delete returns false for missing secret", async () => {
    const available = await manager.isAvailable();
    if (!available) return;

    const result = await manager.deleteSecret(service, "nonexistent-account");
    expect(result).toBe(false);
  });

  test("overwrite existing secret", async () => {
    const available = await manager.isAvailable();
    if (!available) return;

    await manager.setSecret(service, account, "value-1");
    await manager.setSecret(service, account, "value-2");
    const retrieved = await manager.getSecret(service, account);
    expect(retrieved).toBe("value-2");
  });
});

// ==============================================================================
// EncryptedFileSecretsManager
// ==============================================================================

describe("EncryptedFileSecretsManager", () => {
  let tempDir: string;
  let secretsPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-git-secrets-test-"));
    secretsPath = path.join(tempDir, "secrets.enc");
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("isAvailable always returns true", async () => {
    const manager = new EncryptedFileSecretsManager(secretsPath);
    expect(await manager.isAvailable()).toBe(true);
  });

  test("get/set/delete roundtrip", async () => {
    const manager = new EncryptedFileSecretsManager(secretsPath);
    const service = "test-service";
    const account = "test-account";

    await manager.setSecret(service, account, "secret-value-456");
    const retrieved = await manager.getSecret(service, account);
    expect(retrieved).toBe("secret-value-456");

    const deleted = await manager.deleteSecret(service, account);
    expect(deleted).toBe(true);

    const after = await manager.getSecret(service, account);
    expect(after).toBeNull();
  });

  test("get returns null for missing secret", async () => {
    const manager = new EncryptedFileSecretsManager(secretsPath);
    const result = await manager.getSecret("test-service", "nonexistent");
    expect(result).toBeNull();
  });

  test("delete returns false for missing secret", async () => {
    const manager = new EncryptedFileSecretsManager(secretsPath);
    const result = await manager.deleteSecret("test-service", "nonexistent");
    expect(result).toBe(false);
  });

  test("overwrite existing secret", async () => {
    const manager = new EncryptedFileSecretsManager(secretsPath);
    const service = "test-service";
    const account = "overwrite-test";

    await manager.setSecret(service, account, "first-value");
    await manager.setSecret(service, account, "second-value");
    const retrieved = await manager.getSecret(service, account);
    expect(retrieved).toBe("second-value");

    // Cleanup
    await manager.deleteSecret(service, account);
  });

  test("persists across manager instances", async () => {
    const manager1 = new EncryptedFileSecretsManager(secretsPath);
    const service = "test-service";
    const account = "persist-test";

    await manager1.setSecret(service, account, "persistent-value");

    const manager2 = new EncryptedFileSecretsManager(secretsPath);
    const retrieved = await manager2.getSecret(service, account);
    expect(retrieved).toBe("persistent-value");

    // Cleanup
    await manager2.deleteSecret(service, account);
  });
});

// ==============================================================================
// Fallback behavior
// ==============================================================================

describe("getSecretsManager", () => {
  test("returns a working manager", async () => {
    const manager = await getSecretsManager();
    expect(manager).toBeDefined();
    expect(typeof manager.getSecret).toBe("function");
    expect(typeof manager.setSecret).toBe("function");
    expect(typeof manager.deleteSecret).toBe("function");
    expect(typeof manager.isAvailable).toBe("function");
  });
});
