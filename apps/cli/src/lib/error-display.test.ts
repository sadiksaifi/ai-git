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
});
