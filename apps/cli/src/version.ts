import { getVersion } from "./lib/version.macro.ts" with { type: "macro" };

/**
 * Application version derived from git tags at build time.
 *
 * - Production (from tag v2.0.4): "2.0.4"
 * - Development (2 commits after v2.0.4): "2.0.4-dev.2"
 */
export const VERSION = getVersion();
