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
  resolveConfigDir,
  resolveCacheDir,
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
        const localAppdata =
          process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
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

  describe("resolver functions", () => {
    if (isWindows) {
      const originalAppdata = process.env.APPDATA;
      const originalLocalAppdata = process.env.LOCALAPPDATA;

      afterEach(() => {
        if (originalAppdata === undefined) {
          delete process.env.APPDATA;
        } else {
          process.env.APPDATA = originalAppdata;
        }
        if (originalLocalAppdata === undefined) {
          delete process.env.LOCALAPPDATA;
        } else {
          process.env.LOCALAPPDATA = originalLocalAppdata;
        }
      });

      it("resolveConfigDir uses APPDATA when set", () => {
        process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
        expect(resolveConfigDir()).toBe("C:\\Users\\test\\AppData\\Roaming\\ai-git");
      });

      it("resolveConfigDir falls back to homedir when APPDATA is unset", () => {
        delete process.env.APPDATA;
        expect(resolveConfigDir()).toBe(path.join(os.homedir(), "AppData", "Roaming", "ai-git"));
      });

      it("resolveCacheDir uses LOCALAPPDATA when set", () => {
        process.env.LOCALAPPDATA = "C:\\Users\\test\\AppData\\Local";
        expect(resolveCacheDir()).toBe("C:\\Users\\test\\AppData\\Local\\ai-git");
      });

      it("resolveCacheDir falls back to homedir when LOCALAPPDATA is unset", () => {
        delete process.env.LOCALAPPDATA;
        expect(resolveCacheDir()).toBe(path.join(os.homedir(), "AppData", "Local", "ai-git"));
      });
    } else {
      const originalXdgConfig = process.env.XDG_CONFIG_HOME;
      const originalXdgCache = process.env.XDG_CACHE_HOME;

      afterEach(() => {
        if (originalXdgConfig === undefined) {
          delete process.env.XDG_CONFIG_HOME;
        } else {
          process.env.XDG_CONFIG_HOME = originalXdgConfig;
        }
        if (originalXdgCache === undefined) {
          delete process.env.XDG_CACHE_HOME;
        } else {
          process.env.XDG_CACHE_HOME = originalXdgCache;
        }
      });

      it("resolveConfigDir respects XDG_CONFIG_HOME", () => {
        process.env.XDG_CONFIG_HOME = "/tmp/xdg-config";
        expect(resolveConfigDir()).toBe("/tmp/xdg-config/ai-git");
      });

      it("resolveConfigDir falls back to ~/.config when XDG_CONFIG_HOME is unset", () => {
        delete process.env.XDG_CONFIG_HOME;
        expect(resolveConfigDir()).toBe(path.join(os.homedir(), ".config", "ai-git"));
      });

      it("resolveCacheDir respects XDG_CACHE_HOME", () => {
        process.env.XDG_CACHE_HOME = "/tmp/xdg-cache";
        expect(resolveCacheDir()).toBe("/tmp/xdg-cache/ai-git");
      });

      it("resolveCacheDir falls back to ~/.cache when XDG_CACHE_HOME is unset", () => {
        delete process.env.XDG_CACHE_HOME;
        expect(resolveCacheDir()).toBe(path.join(os.homedir(), ".cache", "ai-git"));
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
      expect(getModelCacheFile("openrouter")).toBe(path.join(CACHE_DIR, "models-openrouter.json"));
      expect(getModelCacheFile("anthropic")).toBe(path.join(CACHE_DIR, "models-anthropic.json"));
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
        expect(getModelsDevCacheFilePath()).toBe(path.join(CACHE_DIR, "models-dev-catalog.json"));
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
