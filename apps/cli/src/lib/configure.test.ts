import { describe, test, expect, mock, beforeEach } from "bun:test";
import { setup } from "xstate";

// ── Mocks ──────────────────────────────────────────────────────────

const cancelSym = Symbol("cancel");

const mockSelect = mock(() => Promise.resolve("global" as "global" | "project" | symbol));
const mockCancel = mock(() => {});

const realClack = await import("@clack/prompts");
mock.module("@clack/prompts", () => ({
  ...realClack,
  select: mockSelect,
  isCancel: (val: unknown) => val === cancelSym,
  cancel: mockCancel,
}));

const mockRunOnboarding = mock(() =>
  Promise.resolve({
    config: { provider: "openai", model: "gpt-4o" },
    completed: true,
    continueToRun: true,
    exitCode: 0 as const,
  }),
);

const realOnboarding = await import("./onboarding/index.ts");
mock.module("./onboarding/index.ts", () => ({
  ...realOnboarding,
  runOnboarding: mockRunOnboarding,
}));

// ── Mock init machine (passed via parameter, not module mock) ──────

const mockInitMachine = setup({
  types: {
    input: {} as {},
    output: {} as { continueToRun: boolean; exitCode: 0 | 1 },
  },
}).createMachine({
  id: "mockInit",
  initial: "done",
  states: {
    done: { type: "final" },
  },
  output: () => ({ continueToRun: true, exitCode: 0 as const }),
});

// ── Import after mocks ─────────────────────────────────────────────

const { runConfigureFlow } = await import("./configure.ts");

// ── Tests ──────────────────────────────────────────────────────────

describe("runConfigureFlow", () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockCancel.mockClear();
    mockRunOnboarding.mockClear();
  });

  test("global path success", async () => {
    mockSelect.mockResolvedValueOnce("global");
    mockRunOnboarding.mockResolvedValueOnce({
      config: { provider: "openai", model: "gpt-4o" },
      completed: true,
      continueToRun: true,
      exitCode: 0,
    });

    const result = await runConfigureFlow();
    expect(result.exitCode).toBe(0);
    expect(result.continueToRun).toBe(true);
  });

  test("project path success", async () => {
    mockSelect.mockResolvedValueOnce("project");

    // Pass mock machine via parameter to avoid module-level mock leaking
    const result = await runConfigureFlow(mockInitMachine as any);
    expect(result.exitCode).toBe(0);
    expect(result.continueToRun).toBe(true);
  });

  test("cancel at select", async () => {
    mockSelect.mockResolvedValueOnce(cancelSym);

    const result = await runConfigureFlow();
    expect(result.exitCode).toBe(1);
    expect(result.continueToRun).toBe(false);
    expect(mockCancel).toHaveBeenCalled();
  });

  test("error in onboarding returns exitCode 1", async () => {
    mockSelect.mockResolvedValueOnce("global");
    mockRunOnboarding.mockRejectedValueOnce(new Error("network failure"));

    const result = await runConfigureFlow();
    expect(result.exitCode).toBe(1);
    expect(result.continueToRun).toBe(false);
  });
});
