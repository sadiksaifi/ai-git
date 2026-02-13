import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import { log, spinner } from "@clack/prompts";
import pc from "picocolors";
import { detectInstallMethod } from "./install-method.ts";
import { fetchLatestRelease, isNewerVersion } from "./update-check.ts";

// ==============================================================================
// CONSTANTS
// ==============================================================================

const GITHUB_RELEASE_BASE =
  "https://github.com/sadiksaifi/ai-git/releases/download";

// ==============================================================================
// PLATFORM DETECTION
// ==============================================================================

interface PlatformInfo {
  os: string;
  arch: string;
  archiveName: string;
}

function detectPlatform(): PlatformInfo | null {
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

async function verifyChecksum(
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
// SELF-UPDATE (for curl/unknown installs)
// ==============================================================================

async function selfUpdate(currentVersion: string): Promise<void> {
  const s = spinner();

  // 1. Fetch latest release
  s.start("Checking for updates...");
  const release = await fetchLatestRelease();
  if (!release) {
    s.stop(pc.red("Failed to fetch latest release from GitHub."));
    process.exit(1);
  }

  const latestVersion = release.tag_name.replace(/^v/, "");
  if (!isNewerVersion(currentVersion, latestVersion)) {
    s.stop(pc.green(`Already on the latest version (${currentVersion}).`));
    return;
  }

  // 2. Detect platform
  const platform = detectPlatform();
  if (!platform) {
    s.stop(
      pc.red(
        `Unsupported platform: ${process.platform}-${process.arch}. Download manually from GitHub Releases.`,
      ),
    );
    process.exit(1);
  }

  // 3. Download tarball + checksums
  s.message(`Downloading ${release.tag_name}...`);
  const tarballUrl = `${GITHUB_RELEASE_BASE}/${release.tag_name}/${platform.archiveName}`;
  const checksumsUrl = `${GITHUB_RELEASE_BASE}/${release.tag_name}/checksums.txt`;

  const tmpDir = path.join(os.tmpdir(), `ai-git-upgrade-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const tarballPath = path.join(tmpDir, platform.archiveName);
  const checksumsPath = path.join(tmpDir, "checksums.txt");

  try {
    const [tarballResp, checksumsResp] = await Promise.all([
      fetch(tarballUrl),
      fetch(checksumsUrl),
    ]);

    if (!tarballResp.ok) {
      s.stop(pc.red(`Failed to download binary (HTTP ${tarballResp.status}).`));
      process.exit(1);
    }
    if (!checksumsResp.ok) {
      s.stop(
        pc.red(
          `Failed to download checksums (HTTP ${checksumsResp.status}).`,
        ),
      );
      process.exit(1);
    }

    await Bun.write(tarballPath, tarballResp);
    const checksumsContent = await checksumsResp.text();
    await Bun.write(checksumsPath, checksumsContent);

    // 4. Verify checksum
    s.message("Verifying checksum...");
    const valid = await verifyChecksum(
      tarballPath,
      checksumsContent,
      platform.archiveName,
    );
    if (!valid) {
      s.stop(pc.red("Checksum verification failed. Aborting upgrade."));
      process.exit(1);
    }

    // 5. Extract binary
    s.message("Extracting...");
    await $`tar -xzf ${tarballPath} -C ${tmpDir}`.quiet();

    const extractedBin = path.join(tmpDir, "ai-git");
    if (!fs.existsSync(extractedBin)) {
      s.stop(pc.red("Extracted binary not found. Aborting upgrade."));
      process.exit(1);
    }

    // 6. Atomic replace
    s.message("Installing...");
    let targetPath: string;
    try {
      targetPath = fs.realpathSync(process.argv[0] ?? "");
    } catch {
      targetPath = path.join(os.homedir(), ".local", "bin", "ai-git");
    }

    // Ensure target directory exists
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    // Copy to temp location next to target, then rename (atomic on same filesystem)
    const tmpTarget = `${targetPath}.tmp`;
    fs.copyFileSync(extractedBin, tmpTarget);
    fs.chmodSync(tmpTarget, 0o755);
    fs.renameSync(tmpTarget, targetPath);

    s.stop(
      pc.green(
        `Upgraded ai-git: ${currentVersion} -> ${latestVersion}`,
      ),
    );
  } finally {
    // Cleanup temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // Best effort
    }
  }
}

// ==============================================================================
// PUBLIC API
// ==============================================================================

export async function runUpgrade(currentVersion: string): Promise<void> {
  const method = detectInstallMethod();

  switch (method) {
    case "brew":
      log.info(pc.yellow('Installed via Homebrew. Run "brew upgrade ai-git" instead.'));
      process.exit(0);
      break;
    case "npm":
      log.info(pc.yellow('Installed via npm. Run "npm update -g @ai-git/cli" instead.'));
      process.exit(0);
      break;
    case "source":
      log.info(
        pc.yellow(
          'Installed from source. Run "git pull && bun install && bun run build" instead.',
        ),
      );
      process.exit(0);
      break;
    case "curl":
    case "unknown":
    default:
      await selfUpdate(currentVersion);
      break;
  }
}
