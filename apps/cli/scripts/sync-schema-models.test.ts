import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { updateSchemaModels } from "./sync-schema-models.ts";

describe("updateSchemaModels", () => {
  it("preserves Antigravity examples and provider guidance", () => {
    const schema = JSON.parse(
      readFileSync(resolve(import.meta.dir, "../../../schema.json"), "utf8"),
    );
    const payload = {
      openai: {
        models: {
          "gpt-5.6": { release_date: "2026-08-01", last_updated: "2026-08-01" },
        },
      },
      google: {
        models: {
          "gemini-3.7-flash": { release_date: "2026-08-01", last_updated: "2026-08-01" },
        },
      },
      anthropic: {
        models: {
          "claude-opus-5": { release_date: "2026-08-01", last_updated: "2026-08-01" },
        },
      },
    };

    updateSchemaModels(schema, payload);

    expect(schema.properties.model.examples).toContain("gemini-3.7-flash-low");
    const antigravitySchema = schema.allOf.find(
      (entry: any) => entry.if?.properties?.provider?.const === "antigravity-cli",
    );
    expect(antigravitySchema.then.properties.model.description).toContain(
      "Antigravity CLI model ID",
    );
  });
});
