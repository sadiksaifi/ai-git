import { describe, it, expect, afterEach } from "bun:test";
import * as path from "node:path";
import * as os from "node:os";

import {
  CONFIG_DIR,
  CACHE_DIR,
  CONFIG_FILE,
  UPDATE_CACHE_FILE,
  getModelCacheFile,
  getModelsDevCacheFilePath,
  SECRETS_FILE,
  TEMP_MSG_FILE,
} from "./paths.ts";

const isWindows = process.platform === "win32";

describe("paths", () => {
  describe("base directories", () => {
    if (isWindows) {
      it("CONFIG_DIR uses APPDATA on Windows", () => {
        const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        expect(CONFIG_DIR).toBe(path.join(appdata, "ai-git"));
      });

      it("CACHE_DIR uses LOCALAPPDATA on Windows", () => {
        const localAppdata = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
        expect(CACHE_DIR).toBe(path.join(localAppdata, "ai-git"));
      });
    } else {
      it("CONFIG_DIR uses ~/.config/ai-git on Unix", () => {
        expect(CONFIG_DIR).toBe(path.join(os.homedir(), ".config", "ai-git"));
      });

      it("CACHE_DIR uses ~/.cache/ai-git on Unix", () => {
        expect(CACHE_DIR).toBe(path.join(os.homedir(), ".cache", "ai-git"));
      });
    }
  });

  describe("config files", () => {
    it("CONFIG_FILE is config.json inside CONFIG_DIR", () => {
      expect(CONFIG_FILE).toBe(path.join(CONFIG_DIR, "config.json"));
    });
  });

  describe("cache files", () => {
    it("UPDATE_CACHE_FILE is update-cache.json inside CACHE_DIR", () => {
      expect(UPDATE_CACHE_FILE).toBe(path.join(CACHE_DIR, "update-cache.json"));
    });

    it("getModelCacheFile returns provider-specific path", () => {
      expect(getModelCacheFile("openrouter")).toBe(
        path.join(CACHE_DIR, "models-openrouter.json")
      );
      expect(getModelCacheFile("anthropic")).toBe(
        path.join(CACHE_DIR, "models-anthropic.json")
      );
    });

    describe("getModelsDevCacheFilePath", () => {
      const originalEnv = process.env.AI_GIT_MODELS_DEV_CACHE_FILE;

      afterEach(() => {
        if (originalEnv === undefined) {
          delete process.env.AI_GIT_MODELS_DEV_CACHE_FILE;
        } else {
          process.env.AI_GIT_MODELS_DEV_CACHE_FILE = originalEnv;
        }
      });

      it("returns default path when env var is not set", () => {
        delete process.env.AI_GIT_MODELS_DEV_CACHE_FILE;
        expect(getModelsDevCacheFilePath()).toBe(
          path.join(CACHE_DIR, "models-dev-catalog.json")
        );
      });

      it("respects AI_GIT_MODELS_DEV_CACHE_FILE override", () => {
        process.env.AI_GIT_MODELS_DEV_CACHE_FILE = "/tmp/custom-cache.json";
        expect(getModelsDevCacheFilePath()).toBe("/tmp/custom-cache.json");
      });
    });
  });

  describe("secrets", () => {
    it("SECRETS_FILE is secrets.enc inside CONFIG_DIR", () => {
      expect(SECRETS_FILE).toBe(path.join(CONFIG_DIR, "secrets.enc"));
    });
  });

  describe("temporary files", () => {
    it("TEMP_MSG_FILE is in the OS temp directory", () => {
      expect(TEMP_MSG_FILE).toBe(path.join(os.tmpdir(), "ai-git-msg.txt"));
    });
  });
});
