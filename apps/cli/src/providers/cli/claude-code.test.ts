import { describe, it, expect } from "bun:test";
import { parseClaudeModelId } from "./claude-code.ts";

describe("parseClaudeModelId", () => {
  it("should parse sonnet-low", () => {
    expect(parseClaudeModelId("sonnet-low")).toEqual({
      model: "sonnet",
      effort: "low",
    });
  });

  it("should parse sonnet-medium", () => {
    expect(parseClaudeModelId("sonnet-medium")).toEqual({
      model: "sonnet",
      effort: "medium",
    });
  });

  it("should parse sonnet-high", () => {
    expect(parseClaudeModelId("sonnet-high")).toEqual({
      model: "sonnet",
      effort: "high",
    });
  });

  it("should parse opus-low", () => {
    expect(parseClaudeModelId("opus-low")).toEqual({
      model: "opus",
      effort: "low",
    });
  });

  it("should parse opus-high", () => {
    expect(parseClaudeModelId("opus-high")).toEqual({
      model: "opus",
      effort: "high",
    });
  });

  it("should return plain model without effort for sonnet", () => {
    expect(parseClaudeModelId("sonnet")).toEqual({
      model: "sonnet",
    });
  });

  it("should return plain model without effort for haiku", () => {
    expect(parseClaudeModelId("haiku")).toEqual({
      model: "haiku",
    });
  });

  it("should return plain model without effort for opus", () => {
    expect(parseClaudeModelId("opus")).toEqual({
      model: "opus",
    });
  });
});
