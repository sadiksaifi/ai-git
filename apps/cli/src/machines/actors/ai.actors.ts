import { fromPromise } from "xstate";
import { spinner } from "@clack/prompts";
import pc from "picocolors";
import type { ProviderAdapter } from "../../providers/types.ts";
import { createSlowWarningTimer } from "../../lib/generation.ts";

// ── Types ────────────────────────────────────────────────────────────

type InvokeAIInput = {
  model: string;
  system: string;
  prompt: string;
  modelName: string;
  slowThresholdMs: number;
  adapter?: ProviderAdapter;
};

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Factory for the AI invocation actor.
 * Includes spinner and slow warning timer colocated with the async call.
 *
 * An optional `resolver` can be injected for testing; when omitted the
 * actor delegates to the `adapter` supplied via input.
 */
export function createInvokeAIActor(
  resolver?: (input: {
    model: string;
    system: string;
    prompt: string;
  }) => Promise<string>,
) {
  return fromPromise(async ({ input }: { input: InvokeAIInput }) => {
    const invoke =
      resolver ??
      (async (opts: { model: string; system: string; prompt: string }) => {
        if (!input.adapter) throw new Error("No adapter provided");
        return input.adapter.invoke(opts);
      });

    const s = spinner();
    s.start(`Analyzing changes with ${input.modelName}...`);

    const cancelSlowWarning = createSlowWarningTimer(
      input.slowThresholdMs,
      () => {
        s.message(
          pc.yellow(
            `Still generating with ${input.modelName}... Speed depends on your selected provider and model.`,
          ),
        );
      },
    );

    try {
      const rawMsg = await invoke({
        model: input.model,
        system: input.system,
        prompt: input.prompt,
      });
      cancelSlowWarning();
      s.stop("Message generated");
      return rawMsg;
    } catch (e) {
      cancelSlowWarning();
      s.stop("Generation failed");
      throw e;
    }
  });
}

// ── Default instance (uses adapter from input) ──────────────────────

export const invokeAIActor = createInvokeAIActor();
