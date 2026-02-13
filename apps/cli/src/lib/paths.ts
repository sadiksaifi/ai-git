import * as path from "node:path";
import * as os from "node:os";

const isWindows = process.platform === "win32";

// ── Base Directories ────────────────────────────────────────────────
// macOS/Linux: ~/.config/ai-git, ~/.cache/ai-git
// Windows:     %APPDATA%\ai-git, %LOCALAPPDATA%\ai-git

export const CONFIG_DIR = isWindows
  ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "ai-git")
  : path.join(os.homedir(), ".config", "ai-git");

export const CACHE_DIR = isWindows
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "ai-git")
  : path.join(os.homedir(), ".cache", "ai-git");

// ── Config Files ────────────────────────────────────────────────────

export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// ── Cache Files ─────────────────────────────────────────────────────

export const UPDATE_CACHE_FILE = path.join(CACHE_DIR, "update-cache.json");

export function getModelCacheFile(provider: string): string {
  return path.join(CACHE_DIR, `models-${provider}.json`);
}

export function getModelsDevCacheFilePath(): string {
  const override = process.env.AI_GIT_MODELS_DEV_CACHE_FILE;
  if (override) return override;
  return path.join(CACHE_DIR, "models-dev-catalog.json");
}

// ── Secrets ─────────────────────────────────────────────────────────

export const SECRETS_FILE = path.join(CONFIG_DIR, "secrets.enc");

// ── Temporary Files ─────────────────────────────────────────────────

export const TEMP_MSG_FILE = path.join(os.tmpdir(), "ai-git-msg.txt");
