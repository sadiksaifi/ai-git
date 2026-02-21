import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import { fetchLatestRelease, isNewerVersion, GITHUB_REPO } from "./update-check.ts";
import { CLIError } from "./errors.ts";

// ==============================================================================
// CONSTANTS
// ==============================================================================

export const GITHUB_RELEASE_BASE =
  `https://github.com/${GITHUB_REPO}/releases/download`;

// ==============================================================================
// TYPES
// ==============================================================================

export interface PlatformInfo {
  os: string;
  arch: string;
  archiveName: string;
}

// ==============================================================================
// PLATFORM DETECTION
// ==============================================================================

export function detectPlatform(): PlatformInfo | null {
  const platform = process.platform;
  const arch = process.arch;

  let osName: string;
  switch (platform) {
    case "darwin":
      osName = "darwin";
      break;
    case "linux":
      osName = "linux";
      break;
    default:
      return null;
  }

  let archName: string;
  switch (arch) {
    case "arm64":
      archName = "arm64";
      break;
    case "x64":
      archName = "x64";
      break;
    default:
      return null;
  }

  return {
    os: osName,
    arch: archName,
    archiveName: `ai-git-${osName}-${archName}.tar.gz`,
  };
}

// ==============================================================================
// CHECKSUM VERIFICATION
// ==============================================================================

export async function verifyChecksum(
  filePath: string,
  checksumFileContent: string,
  expectedFileName: string,
): Promise<boolean> {
  const lines = checksumFileContent.trim().split("\n");
  const entry = lines.find((line) => line.includes(expectedFileName));
  if (!entry) return false;

  const expectedHash = entry.split(/\s+/)[0];
  if (!expectedHash) return false;

  const file = Bun.file(filePath);
  const hasher = new Bun.CryptoHasher("sha256");
  const stream = file.stream();
  for await (const chunk of stream) {
    hasher.update(chunk);
  }
  const actualHash = hasher.digest("hex");

  return actualHash === expectedHash;
}

// ==============================================================================
// FETCH AND CHECK VERSION
// ==============================================================================

/**
 * Fetch the latest release and check if it's newer than the current version.
 * Returns version info if an update is available, null if already latest.
 * Throws CLIError if the fetch fails.
 */
export async function fetchAndCheckVersion(
  currentVersion: string,
): Promise<{ latestVersion: string; tag: string } | null> {
  const release = await fetchLatestRelease();
  if (!release) {
    throw new CLIError("Failed to fetch latest release from GitHub.");
  }

  const latestVersion = release.tag_name.replace(/^v/, "");
  if (!isNewerVersion(currentVersion, latestVersion)) {
    return null; // Already on latest
  }

  return { latestVersion, tag: release.tag_name };
}

// ==============================================================================
// DOWNLOAD RELEASE
// ==============================================================================

/**
 * Download the release tarball and checksums file.
 * Returns paths to the downloaded files and the temp directory.
 * Throws CLIError on HTTP errors.
 */
export async function downloadRelease(
  tag: string,
  platform: PlatformInfo,
): Promise<{ tarballPath: string; checksumsContent: string; tmpDir: string }> {
  const tarballUrl = `${GITHUB_RELEASE_BASE}/${tag}/${platform.archiveName}`;
  const checksumsUrl = `${GITHUB_RELEASE_BASE}/${tag}/checksums.txt`;

  const tmpDir = path.join(os.tmpdir(), `ai-git-upgrade-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const tarballPath = path.join(tmpDir, platform.archiveName);

  try {
    const [tarballResp, checksumsResp] = await Promise.all([
      fetch(tarballUrl),
      fetch(checksumsUrl),
    ]);

    if (!tarballResp.ok) {
      throw new CLIError(`Failed to download binary (HTTP ${tarballResp.status}).`);
    }
    if (!checksumsResp.ok) {
      throw new CLIError(`Failed to download checksums (HTTP ${checksumsResp.status}).`);
    }

    await Bun.write(tarballPath, tarballResp);
    const checksumsContent = await checksumsResp.text();

    return { tarballPath, checksumsContent, tmpDir };
  } catch (err) {
    cleanupTmpDir(tmpDir);
    throw err;
  }
}

// ==============================================================================
// EXTRACT BINARY
// ==============================================================================

/**
 * Extract the binary from the tarball.
 * Returns the path to the extracted binary.
 * Throws CLIError if the binary is not found after extraction.
 */
export async function extractBinary(
  tarballPath: string,
  tmpDir: string,
): Promise<string> {
  await $`tar -xzf ${tarballPath} -C ${tmpDir}`.quiet();

  const extractedBinPath = path.join(tmpDir, "ai-git");
  if (!fs.existsSync(extractedBinPath)) {
    throw new CLIError("Extracted binary not found. Aborting upgrade.");
  }

  return extractedBinPath;
}

// ==============================================================================
// INSTALL BINARY
// ==============================================================================

/**
 * Install the extracted binary by atomically replacing the current one.
 * Throws CLIError on permission denied.
 */
export function installBinary(extractedBinPath: string): void {
  let targetPath: string;
  try {
    targetPath = fs.realpathSync(process.argv[0] ?? "");
  } catch {
    targetPath = path.join(os.homedir(), ".local", "bin", "ai-git");
  }

  // Ensure target directory exists
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  // Check write permission before attempting replace
  try {
    fs.accessSync(path.dirname(targetPath), fs.constants.W_OK);
  } catch {
    throw new CLIError(
      `Permission denied: cannot write to ${path.dirname(targetPath)}.`,
      1,
      "Try: sudo ai-git upgrade",
    );
  }

  // Copy to temp location next to target, then rename (atomic on same filesystem)
  const tmpTarget = `${targetPath}.tmp.${process.pid}`;
  fs.copyFileSync(extractedBinPath, tmpTarget);
  fs.chmodSync(tmpTarget, 0o755);
  fs.renameSync(tmpTarget, targetPath);
}

// ==============================================================================
// CLEANUP
// ==============================================================================

/**
 * Clean up the temporary directory. Best effort — never throws.
 */
export function cleanupTmpDir(tmpDir: string): void {
  if (!tmpDir) return;
  try {
    fs.rmSync(tmpDir, { recursive: true });
  } catch {
    // Best effort
  }
}
