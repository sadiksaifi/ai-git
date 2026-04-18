import { extname } from "node:path";

const DEFAULT_OUTFILE = "dist/ai-git";
const OUTFILE_FLAG = "--outfile";
const TARGET_FLAG = "--target";

function parseBuildFlagValue(argv: string[], flag: string): string | undefined {
  const flagWithEquals = `${flag}=`;
  let value: string | undefined;
  let sawFlag = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === flag) {
      sawFlag = true;

      const nextArg = argv[index + 1];
      value = nextArg && !nextArg.startsWith("-") ? nextArg : undefined;
      continue;
    }

    if (arg.startsWith(flagWithEquals)) {
      sawFlag = true;

      const inlineValue = arg.slice(flagWithEquals.length);
      value = inlineValue ? inlineValue : undefined;
    }
  }

  return sawFlag ? value : undefined;
}

export function parseBuildTarget(argv: string[]): string | undefined {
  return parseBuildFlagValue(argv, TARGET_FLAG);
}

export function parseBuildOutfile(argv: string[]): string | undefined {
  return parseBuildFlagValue(argv, OUTFILE_FLAG);
}

export function getHostCompileTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  const normalizedPlatform =
    platform === "win32"
      ? "windows"
      : platform === "darwin" || platform === "linux"
        ? platform
        : undefined;

  if (!normalizedPlatform) return undefined;
  if (arch !== "x64" && arch !== "arm64") return undefined;

  return `bun-${normalizedPlatform}-${arch}`;
}

export function shouldSmokeTestBuiltBinary(
  target: string | undefined,
  hostTarget: string | undefined,
): boolean {
  if (!hostTarget) return false;
  return !target || target === hostTarget;
}

export function getHostBinaryPath(
  platform: NodeJS.Platform = process.platform,
  outfile: string = DEFAULT_OUTFILE,
): string {
  // Keep the default path explicitly executable from cwd; custom outfiles are
  // preserved as-is because tests rely on that asymmetry.
  const normalizedOutfile = outfile === DEFAULT_OUTFILE ? `./${DEFAULT_OUTFILE}` : outfile;

  if (platform !== "win32") return normalizedOutfile;
  return extname(normalizedOutfile) ? normalizedOutfile : `${normalizedOutfile}.exe`;
}

export function getSmokeTestBinaryPath(
  argv: string[],
  platform: NodeJS.Platform = process.platform,
): string {
  return getHostBinaryPath(platform, parseBuildOutfile(argv));
}
