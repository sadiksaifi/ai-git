const TARGET_FLAG = "--target";

export function parseBuildTarget(argv: string[]): string | undefined {
  const targetIndex = argv.indexOf(TARGET_FLAG);
  if (targetIndex === -1) return undefined;

  const target = argv[targetIndex + 1];
  if (!target || target.startsWith("-")) return undefined;
  return target;
}

export function getHostCompileTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | undefined {
  const normalizedPlatform =
    platform === "win32" ? "windows" : platform === "darwin" || platform === "linux" ? platform : undefined;

  if (!normalizedPlatform) return undefined;
  if (arch !== "x64" && arch !== "arm64") return undefined;

  return `bun-${normalizedPlatform}-${arch}`;
}

export function shouldSmokeTestBuiltBinary(
  target: string | undefined,
  hostTarget: string | undefined = getHostCompileTarget(),
): boolean {
  if (!hostTarget) return false;
  return !target || target === hostTarget;
}

export function getHostBinaryPath(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "./dist/ai-git.exe" : "./dist/ai-git";
}
