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
 * Virtual model IDs encode reasoning effort (e.g. "gpt-5.3-codex-high").
 * The adapter parses the ID, then invokes:
 *   codex --model <base> -c model_reasoning_effort=<effort> --yolo exec <prompt>
 */
export const codexAdapter: CLIProviderAdapter = {
  providerId: "codex",
  mode: "cli",
  binary: "codex",

  async invoke({ model, prompt }: InvokeOptions): Promise<string> {
    const { model: baseModel, effort } = parseModelId(model);
    const proc = Bun.spawn(
      [
        "codex",
        "--model",
        baseModel,
        "-c",
        `model_reasoning_effort=${effort}`,
        "--yolo",
        "exec",
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
