import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { GEMINI_SETTINGS_FILE, DATA_DIR, CACHE_DIR } from "../../lib/paths.ts";
import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

/**
 * Optimized Gemini CLI settings for headless invocation.
 * Injected via GEMINI_CLI_SYSTEM_SETTINGS_PATH (precedence level 5,
 * overrides user settings without touching ~/.gemini/settings.json).
 *
 * Only overrides settings whose defaults are suboptimal for headless mode.
 * Verified against settings.schema.json defaults.
 */
export const GEMINI_OPTIMIZED_SETTINGS = {
  general: {
    enableAutoUpdate: false,
    enableAutoUpdateNotification: false,
  },
  context: {
    includeDirectoryTree: false,
    discoveryMaxDirs: 0,
  },
  telemetry: { enabled: false },
  privacy: { usageStatisticsEnabled: false },
  skills: { enabled: false },
  hooksConfig: { enabled: false },
} as const;

/**
 * Ensure the optimized Gemini settings file exists and is up-to-date.
 * Compares content to handle stale or malformed files.
 * Best-effort — silently skips on read-only filesystems (CI, containers).
 */
export async function ensureGeminiSettings(): Promise<void> {
  try {
    const expected = JSON.stringify(GEMINI_OPTIMIZED_SETTINGS, null, 2);
    const file = Bun.file(GEMINI_SETTINGS_FILE);
    if (await file.exists()) {
      try {
        const content = await file.text();
        if (content === expected) return;
      } catch {
        // File unreadable — rewrite below
      }
    }
    await mkdir(DATA_DIR, { recursive: true });
    await Bun.write(GEMINI_SETTINGS_FILE, expected);
  } catch {
    // Best-effort: skip if DATA_DIR is not writable (CI, containers, Nix)
  }
}

/**
 * Gemini CLI adapter.
 * Handles invocation of the `gemini` CLI tool.
 *
 * System prompt injection uses GEMINI_SYSTEM_MD environment variable
 * pointing to a temporary file. This is the only mechanism that places
 * content in the actual system message (not conversation context).
 *
 * CLI Pattern:
 *   GEMINI_SYSTEM_MD=/tmp/ai-git-system-xxx.md \
 *     gemini --model <model> --output-format text --sandbox -e none -p "<prompt>"
 *
 * - `-p <prompt>` runs in non-interactive (headless) mode with the given prompt
 * - `--output-format text` ensures clean text output
 * - `--sandbox` enables sandboxed execution for tool isolation
 * - `-e none` disables all extensions (pure text generation)
 * - No `--allowed-tools` means no tools auto-approved; headless mode can't
 *   prompt for confirmation, so tools are effectively blocked
 * - GEMINI_SYSTEM_MD replaces the entire default system prompt
 */
export const geminiCliAdapter: CLIProviderAdapter = {
  providerId: "gemini-cli",
  mode: "cli",
  binary: "gemini",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    // Write system prompt to temp file for GEMINI_SYSTEM_MD
    const tmpFile = join(
      tmpdir(),
      `ai-git-system-${Date.now()}-${randomBytes(4).toString("hex")}.md`,
    );

    try {
      // Respect externally-managed settings (e.g. enterprise Gemini installations)
      const externalSettings = process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
      await Promise.all([
        Bun.write(tmpFile, system),
        ...(externalSettings ? [] : [ensureGeminiSettings()]),
      ]);

      const proc = Bun.spawn(
        [
          "gemini",
          "--model",
          model,
          "--output-format",
          "text",
          "--sandbox",
          "-e",
          "none",
          "-p",
          prompt,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            GEMINI_SYSTEM_MD: tmpFile,
            GEMINI_CLI_SYSTEM_SETTINGS_PATH: externalSettings || GEMINI_SETTINGS_FILE,
            // Node.js v22.1+ bytecode cache; silently ignored on older versions
            NODE_COMPILE_CACHE: join(CACHE_DIR, "gemini-compile-cache"),
          },
        },
      );

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
        throw new Error(`Gemini CLI error (exit code ${exitCode}):\n${errorMessage}`);
      }

      return stdout;
    } finally {
      // Cleanup temp file — silently ignore errors
      await unlink(tmpFile).catch(() => {});
    }
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("gemini"));
  },
};
