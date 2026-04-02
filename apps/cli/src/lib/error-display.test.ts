import { describe, test, expect } from "bun:test";
import { categorizeError, displayAIError, type CategorizedError } from "./error-display.ts";
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

describe("displayAIError", () => {
  test("model-not-found includes model name and configure suggestion", () => {
    const lines: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      displayAIError({
        category: "model-not-found",
        message: "Not Found",
        providerName: "OpenAI",
        model: "gpt-99-turbo",
      });
    } finally {
      console.error = origError;
    }
    const output = lines.join("\n");
    expect(output).toContain("gpt-99-turbo");
    expect(output).toContain("ai-git configure");
  });

  test("api-error includes provider name and 'not ai-git' guidance", () => {
    const lines: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      displayAIError({
        category: "api-error",
        message: "authentication failed",
        providerName: "OpenAI",
      });
    } finally {
      console.error = origError;
    }
    const output = lines.join("\n");
    expect(output).toContain("OpenAI");
    expect(output).toContain("authentication failed");
    expect(output).toContain("not ai-git");
    expect(output).toContain("API key");
    expect(output).toContain("status page");
  });

  test("cli-error shows raw error message", () => {
    const lines: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => lines.push(args.join(" "));
    try {
      displayAIError({
        category: "cli-error",
        message: "Gemini CLI error (exit code 1):\ncommand not found",
        providerName: "Gemini CLI",
      });
    } finally {
      console.error = origError;
    }
    const output = lines.join("\n");
    expect(output).toContain("Gemini CLI error (exit code 1):");
    expect(output).toContain("command not found");
  });
});
