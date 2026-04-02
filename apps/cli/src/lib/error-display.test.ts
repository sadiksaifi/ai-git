import { describe, test, expect } from "bun:test";
import { categorizeError } from "./error-display.ts";
import type { ProviderAdapter } from "../providers/types.ts";

const apiAdapter: ProviderAdapter = {
  providerId: "openai",
  mode: "api",
  invoke: async () => "",
  checkAvailable: async () => true,
};

describe("categorizeError", () => {
  test("statusCode 404 → model-not-found", () => {
    const error = Object.assign(new Error("Not Found"), { statusCode: 404 });
    const result = categorizeError(error, apiAdapter, "gpt-99-turbo");
    expect(result.category).toBe("model-not-found");
    expect(result.model).toBe("gpt-99-turbo");
  });

  test("message containing 'model not found' → model-not-found", () => {
    const error = new Error("OpenAI model not found: Run 'ai-git configure'");
    const result = categorizeError(error, apiAdapter, "gpt-99-turbo");
    expect(result.category).toBe("model-not-found");
    expect(result.providerName).toBe("OpenAI");
  });

  test("API adapter with 401 → api-error", () => {
    const error = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    const result = categorizeError(error, apiAdapter);
    expect(result.category).toBe("api-error");
    expect(result.providerName).toBe("OpenAI");
    expect(result.message).toBe("Unauthorized");
  });

  test("CLI adapter → cli-error", () => {
    const cliAdapter: ProviderAdapter = {
      providerId: "gemini-cli",
      mode: "cli",
      invoke: async () => "",
      checkAvailable: async () => true,
    };
    const error = new Error("Gemini CLI error (exit code 1):\ncommand not found");
    const result = categorizeError(error, cliAdapter);
    expect(result.category).toBe("cli-error");
    expect(result.providerName).toBe("Gemini CLI");
  });

  test("no adapter → cli-error with fallback provider name", () => {
    const error = new Error("No adapter provided");
    const result = categorizeError(error, undefined);
    expect(result.category).toBe("cli-error");
    expect(result.providerName).toBe("AI provider");
  });
});
