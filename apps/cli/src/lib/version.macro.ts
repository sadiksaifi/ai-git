/**
 * Build-time macro to derive version from git tags.
 *
 * This macro runs at bundle-time (via Bun's macro feature) and inlines
 * the version string directly into the compiled output.
 *
 * Behavior:
 * - On exact tag (v2.0.4): returns "2.0.4"
 * - After tag (v2.0.4-2-g9ff0c17): returns "2.0.4-dev.2"
 * - No tags found: returns "0.0.0-dev"
 */
export function getVersion(): string {
  try {
    const result = Bun.spawnSync(["git", "describe", "--tags", "--always"]);
    if (result.exitCode !== 0) return "0.0.0-dev";

    const describe = result.stdout.toString().trim();

    // Exact tag: v2.0.4 -> 2.0.4
    const exactMatch = describe.match(/^v(\d+\.\d+\.\d+)$/);
    if (exactMatch?.[1]) return exactMatch[1];

    // After tag: v2.0.4-2-g9ff0c17 -> 2.0.4-dev.2
    const devMatch = describe.match(/^v(\d+\.\d+\.\d+)-(\d+)-g[a-fA-F0-9]+$/);
    if (devMatch?.[1] && devMatch[2]) return `${devMatch[1]}-dev.${devMatch[2]}`;

    return "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}
