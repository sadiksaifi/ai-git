import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as realSecrets from "../../lib/secrets/index.ts";

mock.module("../../lib/secrets/index.ts", () => ({
  ...realSecrets,
  getApiKey: async () => "test-key",
}));

const { openAIAdapter } = await import("./openai.ts");
const { clearModelCatalogForTests } = await import("./models/index.ts");

const originalFetch = globalThis.fetch;
const originalOverride = process.env.AI_GIT_MODEL_CATALOG_OVERRIDE;
let tempDir = "";

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-git-openai-"));
  const file = path.join(tempDir, "catalog.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      openai: { models: { "gpt-6.1-sol": { name: "GPT-6.1 Sol", reasoning: true } } },
    }),
  );
  process.env.AI_GIT_MODEL_CATALOG_OVERRIDE = file;
  clearModelCatalogForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  if (originalOverride === undefined) delete process.env.AI_GIT_MODEL_CATALOG_OVERRIDE;
  else process.env.AI_GIT_MODEL_CATALOG_OVERRIDE = originalOverride;
  clearModelCatalogForTests();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("openAIAdapter.invoke", () => {
  it("sends the reasoning effort for reasoning families the SDK does not know", async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      throw new Error("stop after capturing the request");
    }) as unknown as typeof fetch;

    await expect(
      openAIAdapter.invoke({ model: "gpt-6.1-sol", system: "system", prompt: "prompt" }),
    ).rejects.toThrow();

    expect(bodies[0]?.reasoning).toEqual({ effort: "low" });
    expect(bodies[0]?.temperature).toBeUndefined();
  });
});
