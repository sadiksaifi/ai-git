import * as fs from "node:fs";
import * as path from "node:path";
import { INSTALL_METHOD_FILE } from "./paths.ts";

// ==============================================================================
// TYPES
// ==============================================================================

export type InstallMethod = "brew" | "npm" | "curl" | "source" | "unknown";

// ==============================================================================
// DETECTION
// ==============================================================================

let cached: InstallMethod | null = null;

/**
 * Detect how ai-git was installed.
 *
 * Strategy (ordered):
 * 1. Marker file at ~/.local/state/ai-git/install-method (written during install)
 * 2. Path heuristic based on the resolved real path of process.argv[0]
 */
export function detectInstallMethod(): InstallMethod {
  if (cached) return cached;

  // 1. Try marker file
  try {
    const marker = fs.readFileSync(INSTALL_METHOD_FILE, "utf-8").trim();
    if (isValidMethod(marker)) {
      cached = marker;
      return cached;
    }
  } catch {
    // No marker file — fall through to heuristic
  }

  // 2. Path heuristic
  let binPath: string;
  try {
    binPath = fs.realpathSync(process.argv[0] ?? "");
  } catch {
    cached = "unknown";
    return cached;
  }

  const lower = binPath.toLowerCase();

  if (lower.includes("/homebrew/") || lower.includes("/cellar/")) {
    cached = "brew";
  } else if (lower.includes("/node_modules/")) {
    cached = "npm";
  } else if (lower.includes("/.local/bin/")) {
    cached = "curl";
  } else {
    cached = "unknown";
  }

  return cached;
}

/**
 * Write the install method marker file.
 * Called by install scripts (curl, npm postinstall) to persist the method.
 */
export async function writeInstallMethod(method: InstallMethod): Promise<void> {
  const dir = path.dirname(INSTALL_METHOD_FILE);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  await Bun.write(INSTALL_METHOD_FILE, method);
}

// ==============================================================================
// HELPERS
// ==============================================================================

function isValidMethod(value: string): value is InstallMethod {
  return ["brew", "npm", "curl", "source", "unknown"].includes(value);
}

/**
 * Reset the cached value (for testing).
 */
export function _resetCache(): void {
  cached = null;
}
