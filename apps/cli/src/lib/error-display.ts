import type { ProviderAdapter } from "../providers/types.ts";
import { extractErrorMessage } from "./errors.ts";
import { getProviderById } from "../providers/registry.ts";

// ── Types ────────────────────────────────────────────────────────────

export type ErrorCategory = "model-not-found" | "api-error" | "cli-error";

export interface CategorizedError {
  category: ErrorCategory;
  message: string;
  providerName: string;
  model?: string;
}

// ── Categorization ───────────────────────────────────────────────────

function getStatusCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    if ("statusCode" in error && typeof (error as { statusCode: unknown }).statusCode === "number") {
      return (error as { statusCode: number }).statusCode;
    }
    if ("status" in error && typeof (error as { status: unknown }).status === "number") {
      return (error as { status: number }).status;
    }
  }
  return undefined;
}

function getProviderDisplayName(adapter?: ProviderAdapter): string {
  if (!adapter) return "AI provider";
  return getProviderById(adapter.providerId)?.name ?? adapter.providerId;
}

export function categorizeError(
  error: unknown,
  adapter?: ProviderAdapter,
  model?: string,
): CategorizedError {
  const message = extractErrorMessage(error);
  const providerName = getProviderDisplayName(adapter);
  const statusCode = getStatusCode(error);

  if (statusCode === 404 || /model.not.found/i.test(message)) {
    return { category: "model-not-found", message, providerName, model };
  }

  if (adapter?.mode === "api" || statusCode !== undefined) {
    return { category: "api-error", message, providerName, model };
  }

  return { category: "cli-error", message, providerName, model };
}
