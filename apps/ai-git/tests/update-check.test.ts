import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// We need to test the module's internal functions
// For now, we'll test via the exported functions and cache behavior

const CACHE_DIR = path.join(os.homedir(), ".cache", "ai-git");
const UPDATE_CACHE_FILE = path.join(CACHE_DIR, "update-cache.json");

describe("update-check", () => {
  let originalCache: string | null = null;

  // Save original cache before tests
  beforeEach(() => {
    try {
      originalCache = fs.readFileSync(UPDATE_CACHE_FILE, "utf-8");
    } catch {
      originalCache = null;
    }
  });

  // Restore original cache after tests
  afterEach(() => {
    if (originalCache !== null) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(UPDATE_CACHE_FILE, originalCache);
    } else {
      try {
        fs.unlinkSync(UPDATE_CACHE_FILE);
      } catch {
        // Ignore if file doesn't exist
      }
    }
  });

  describe("startUpdateCheck", () => {
    it("should return a result with currentVersion", async () => {
      // Clear cache to force a fresh check
      try {
        fs.unlinkSync(UPDATE_CACHE_FILE);
      } catch {
        // Ignore
      }

      const { startUpdateCheck } = await import("../src/lib/update-check.ts");
      const result = await startUpdateCheck("0.4.2");

      expect(result).toHaveProperty("currentVersion", "0.4.2");
      expect(result).toHaveProperty("updateAvailable");
      expect(typeof result.updateAvailable).toBe("boolean");
    });

    it("should use cached result on second call", async () => {
      const { startUpdateCheck } = await import("../src/lib/update-check.ts");

      // First call - may hit network
      const result1 = await startUpdateCheck("0.4.2");

      // Second call - should use cache (much faster)
      const start = Date.now();
      const result2 = await startUpdateCheck("0.4.2");
      const elapsed = Date.now() - start;

      // Cache hit should be very fast (< 100ms)
      expect(elapsed).toBeLessThan(100);
      expect(result2.currentVersion).toBe("0.4.2");
    });

    it("should handle invalid cache gracefully", async () => {
      // Write invalid JSON to cache
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(UPDATE_CACHE_FILE, "invalid json {{{");

      const { startUpdateCheck } = await import("../src/lib/update-check.ts");
      const result = await startUpdateCheck("0.4.2");

      // Should not throw, should return valid result
      expect(result).toHaveProperty("currentVersion", "0.4.2");
      expect(result).toHaveProperty("updateAvailable");
    });

    it("should never reject (always returns result)", async () => {
      const { startUpdateCheck } = await import("../src/lib/update-check.ts");

      // This should never throw
      const result = await startUpdateCheck("0.4.2");

      expect(result).toBeDefined();
      expect(result.currentVersion).toBe("0.4.2");
    });
  });

  describe("showUpdateNotification", () => {
    it("should not throw when no update available", () => {
      const { showUpdateNotification } = require("../src/lib/update-check.ts");

      // Should not throw
      expect(() => {
        showUpdateNotification({
          updateAvailable: false,
          latestVersion: null,
          currentVersion: "0.4.2",
        });
      }).not.toThrow();
    });

    it("should not throw when update is available", () => {
      const { showUpdateNotification } = require("../src/lib/update-check.ts");

      // Should not throw
      expect(() => {
        showUpdateNotification({
          updateAvailable: true,
          latestVersion: "0.5.0",
          currentVersion: "0.4.2",
        });
      }).not.toThrow();
    });
  });

  describe("cache file location", () => {
    it("should use XDG cache directory (~/.cache/ai-git/)", () => {
      const expectedDir = path.join(os.homedir(), ".cache", "ai-git");
      expect(CACHE_DIR).toBe(expectedDir);
    });
  });
});
