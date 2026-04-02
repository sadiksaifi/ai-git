import { describe, expect, test } from "bun:test";
import { formatProviderError } from "./utils.ts";

describe("formatProviderError", () => {
	test("401 returns auth error with API key suggestion", () => {
		const err = formatProviderError("Anthropic", 401, "Unauthorized");
		expect(err.userMessage).toBe("Anthropic authentication failed");
		expect(err.suggestion).toBe("Check your API key — run 'ai-git configure'");
	});

	test("403 returns auth error with API key suggestion", () => {
		const err = formatProviderError("OpenAI", 403, "Forbidden");
		expect(err.userMessage).toBe("OpenAI authentication failed");
		expect(err.suggestion).toBe("Check your API key — run 'ai-git configure'");
	});

	test("404 returns model not found with configure suggestion", () => {
		const err = formatProviderError("OpenRouter", 404, "Not Found");
		expect(err.userMessage).toBe("OpenRouter model not found");
		expect(err.suggestion).toBe("Run 'ai-git configure' to select a valid model");
	});

	test("429 returns rate limit with wait suggestion", () => {
		const err = formatProviderError("Cerebras", 429, "Too Many Requests");
		expect(err.userMessage).toBe("Cerebras rate limit exceeded");
		expect(err.suggestion).toBe("Wait a moment or try a different model");
	});

	test("500 returns server error with status page suggestion", () => {
		const err = formatProviderError("Anthropic", 500, "Internal Server Error");
		expect(err.userMessage).toBe("Anthropic server error");
		expect(err.suggestion).toBe("Check Anthropic status page and try again later");
	});

	test("503 returns server error with status page suggestion", () => {
		const err = formatProviderError("OpenAI", 503, "Service Unavailable");
		expect(err.userMessage).toBe("OpenAI server error");
		expect(err.suggestion).toBe("Check OpenAI status page and try again later");
	});

	test("unknown status returns generic error with body as detail", () => {
		const err = formatProviderError("Gemini", 418, "I'm a teapot");
		expect(err.userMessage).toBe("Gemini API error (418)");
		expect(err.suggestion).toBe("I'm a teapot");
	});
});
