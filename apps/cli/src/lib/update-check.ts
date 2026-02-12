import * as path from "node:path";
import * as os from "node:os";
import { semver } from "bun";
import { log } from "@clack/prompts";
import pc from "picocolors";

// ==============================================================================
// TYPES
// ==============================================================================

/**
 * Schema for the update cache file stored at ~/.cache/ai-git/update-cache.json
 */
interface UpdateCache {
  /** ISO timestamp of last check */
  lastChecked: string;
  /** Latest version from GitHub Releases (e.g., "0.5.0") */
  latestVersion: string;
  /** Current version at time of check (for cache invalidation) */
  checkedVersion: string;
}

/**
 * Result of an update check operation
 */
export interface UpdateCheckResult {
  /** Whether an update is available */
  updateAvailable: boolean;
  /** Latest version from GitHub (null if check failed) */
  latestVersion: string | null;
  /** Current local version */
  currentVersion: string;
}

/**
 * GitHub Releases API response shape (partial - only fields we need)
 */
interface GitHubRelease {
  tag_name: string;
}

// ==============================================================================
// CONSTANTS
// ==============================================================================

/** Cache directory (XDG-compliant) */
const CACHE_DIR = path.join(os.homedir(), ".cache", "ai-git");

/** Cache file location */
const UPDATE_CACHE_FILE = path.join(CACHE_DIR, "update-cache.json");

/** Cache TTL: 30 minutes in milliseconds */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Fetch timeout: 3 seconds */
const FETCH_TIMEOUT_MS = 3000;

/** GitHub API endpoint */
const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/sadiksaifi/ai-git/releases/latest";

// ==============================================================================
// VERSION COMPARISON
// ==============================================================================

/**
 * Check if latestVersion is newer than currentVersion.
 * Uses Bun's built-in semver module.
 */
function isNewerVersion(currentVersion: string, latestVersion: string): boolean {
  // Strip 'v' prefix and '-dev.X' suffix if present
  // This treats dev versions as their base version (e.g., 2.0.3-dev.2 -> 2.0.3)
  const current = currentVersion.replace(/^v/, "").replace(/-dev\.\d+$/, "");
  const latest = latestVersion.replace(/^v/, "");

  // semver.order returns -1 if first < second, 0 if equal, 1 if first > second
  return semver.order(current, latest) === -1;
}

// ==============================================================================
// CACHE OPERATIONS
// ==============================================================================

/**
 * Load the cached update check result.
 * Returns undefined if cache doesn't exist or is invalid.
 */
async function loadCache(): Promise<UpdateCache | undefined> {
  try {
    const file = Bun.file(UPDATE_CACHE_FILE);
    const exists = await file.exists();
    if (!exists) return undefined;
    const content = await file.text();
    return JSON.parse(content) as UpdateCache;
  } catch {
    return undefined;
  }
}

/**
 * Save update check result to cache.
 * Silently fails on write errors.
 */
async function saveCache(cache: UpdateCache): Promise<void> {
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(CACHE_DIR, { recursive: true });
    await Bun.write(UPDATE_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Silently fail - cache is not critical
  }
}

/**
 * Check if the cache is still valid (within TTL and for current version).
 */
function isCacheValid(cache: UpdateCache, currentVersion: string): boolean {
  // Invalidate if current version changed (user upgraded)
  if (cache.checkedVersion !== currentVersion) return false;

  const lastChecked = new Date(cache.lastChecked).getTime();
  const now = Date.now();
  return now - lastChecked < CACHE_TTL_MS;
}

// ==============================================================================
// GITHUB API
// ==============================================================================

/**
 * Fetch the latest release from GitHub API.
 * Returns null on any error (timeout, network, parse).
 */
async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(GITHUB_RELEASES_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ai-git-cli",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    return data as GitHubRelease;
  } catch {
    // Network error, timeout, or parse error - fail silently
    return null;
  }
}

// ==============================================================================
// MAIN UPDATE CHECK
// ==============================================================================

/**
 * Perform the update check (with caching).
 * This is the main internal function that does the actual work.
 */
async function performUpdateCheck(
  currentVersion: string
): Promise<UpdateCheckResult> {
  // Check cache first
  const cache = await loadCache();
  if (cache && isCacheValid(cache, currentVersion)) {
    return {
      updateAvailable: isNewerVersion(currentVersion, cache.latestVersion),
      latestVersion: cache.latestVersion,
      currentVersion,
    };
  }

  // Fetch from GitHub
  const release = await fetchLatestRelease();
  if (!release) {
    return {
      updateAvailable: false,
      latestVersion: null,
      currentVersion,
    };
  }

  // Strip 'v' prefix from tag_name
  const latestVersion = release.tag_name.replace(/^v/, "");

  // Update cache
  await saveCache({
    lastChecked: new Date().toISOString(),
    latestVersion,
    checkedVersion: currentVersion,
  });

  return {
    updateAvailable: isNewerVersion(currentVersion, latestVersion),
    latestVersion,
    currentVersion,
  };
}

/**
 * Start a non-blocking update check.
 * Returns a Promise that resolves to the check result.
 * Safe to call and ignore - all errors are handled internally.
 *
 * Usage:
 *   const updatePromise = startUpdateCheck("0.4.2");
 *   // ... do other work ...
 *   const result = await updatePromise; // Only when ready to show notification
 */
export function startUpdateCheck(
  currentVersion: string
): Promise<UpdateCheckResult> {
  // Test/CI escape hatch for deterministic runs without network calls.
  if (process.env.AI_GIT_DISABLE_UPDATE_CHECK === "1") {
    return Promise.resolve({
      updateAvailable: false,
      latestVersion: null,
      currentVersion,
    });
  }

  // Fire-and-forget pattern: wrap in a Promise that never rejects
  return performUpdateCheck(currentVersion).catch(() => ({
    updateAvailable: false,
    latestVersion: null,
    currentVersion,
  }));
}

/**
 * Display update notification if an update is available.
 * Uses @clack/prompts for consistent CLI aesthetics.
 */
export function showUpdateNotification(result: UpdateCheckResult): void {
  if (!result.updateAvailable || !result.latestVersion) return;

	log.warn(
		pc.yellow(`Update available: ${result.currentVersion} -> ${result.latestVersion}\n`) +
		pc.dim(`Run: brew upgrade ai-git`)
	);
}
