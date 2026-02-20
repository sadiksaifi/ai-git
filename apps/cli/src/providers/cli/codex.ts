import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";

type ReasoningEffort = "xhigh" | "high" | "medium" | "low";

/**
 * Parse a virtual model ID into its base model and reasoning effort.
 * e.g. "gpt-5.3-codex-high" → { model: "gpt-5.3-codex", effort: "high" }
 * Falls back to using the full ID as model with "medium" effort.
 */
function parseModelId(virtualId: string): {
  model: string;
  effort: ReasoningEffort;
} {
  const match = virtualId.match(/^(.+)-(xhigh|high|medium|low)$/);
  if (match?.[1] && match[2]) {
    return { model: match[1], effort: match[2] as ReasoningEffort };
  }
  return { model: virtualId, effort: "medium" };
}

/**
 * Codex CLI adapter.
 * Handles invocation of the `codex` CLI tool.
 *
 * System prompt injection uses `-c developer_instructions=...` which injects
 * at the `developer` authority level (high priority, below system prompt).
 *
 * CLI Pattern:
 *   codex exec --model <base> --sandbox read-only -a never \
 *     --disable shell_tool -c model_reasoning_effort=<effort> \
 *     -c 'developer_instructions=<system>' -c 'web_search="disabled"' "<prompt>"
 *
 * - `exec` is non-interactive mode
 * - `--sandbox read-only` enforces OS-level read-only filesystem
 * - `-a never` prevents interactive approval prompts
 * - `--disable shell_tool` removes shell tool from model's available tools
 * - `-c web_search="disabled"` disables web search
 */
export const codexAdapter: CLIProviderAdapter = {
  providerId: "codex",
  mode: "cli",
  binary: "codex",

  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    const { model: baseModel, effort } = parseModelId(model);
    const proc = Bun.spawn(
      [
        "codex",
        "exec",
        "--model", baseModel,
        "--sandbox", "read-only",
        "-a", "never",
        "--disable", "shell_tool",
        "-c", `model_reasoning_effort=${effort}`,
        "-c", `developer_instructions=${system}`,
        "-c", `web_search="disabled"`,
        prompt,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`Codex CLI error (exit code ${exitCode}):\n${errorMessage}`);
    }

    return stdout;
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("codex"));
  },
};
