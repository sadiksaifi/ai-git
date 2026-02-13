const os = require("os");
const fs = require("fs");
const path = require("path");

const PLATFORMS = {
  darwin: { arm64: "@ai-git/darwin-arm64", x64: "@ai-git/darwin-x64" },
  linux: { arm64: "@ai-git/linux-arm64", x64: "@ai-git/linux-x64" },
  win32: { x64: "@ai-git/win32-x64" },
};

// Write install method marker
function writeMarker() {
  try {
    const isWindows = os.platform() === "win32";
    let stateDir;
    if (isWindows) {
      const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
      stateDir = path.join(base, "ai-git", "state");
    } else {
      const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
      stateDir = path.join(base, "ai-git");
    }
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "install-method"), "npm");
  } catch (err) {
    if (process.env.npm_config_loglevel !== "silent") {
      console.warn(`ai-git: Could not write install method marker: ${err.message}`);
    }
  }
}

// Check if platform binary is available
function checkBinary() {
  const platformPkgs = PLATFORMS[os.platform()];
  if (!platformPkgs) return false;

  const pkg = platformPkgs[os.arch()];
  if (!pkg) return false;

  try {
    require.resolve(`${pkg}/package.json`);
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (checkBinary()) {
    writeMarker();
    return;
  }

  // Platform binary not found (e.g., --ignore-optional was used)
  // Provide guidance rather than silently failing
  console.warn(
    `\nai-git: Platform binary not found for ${os.platform()}-${os.arch()}.`,
  );
  console.warn(
    "If you used --ignore-optional, the platform package was skipped.",
  );
  console.warn(
    "You can install the binary manually: curl -fsSL https://ai-git.xyz/install | bash\n",
  );

  writeMarker();
}

main();
