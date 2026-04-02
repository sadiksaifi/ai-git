import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";

// ── Save real modules before mocking ────────────────────────────────

const realClack = await import("@clack/prompts");
const realOnboarding = await import("./onboarding/index.ts");
const realInitMachine = await import("../machines/init.machine.ts");

// ── Mocks ──────────────────────────────────────────────────────────

const cancelSym = Symbol("cancel");

const mockSelect = mock(() => Promise.resolve("global" as "global" | "project" | symbol));
const mockCancel = mock(() => {});

mock.module("@clack/prompts", () => ({
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

mock.module("./onboarding/index.ts", () => ({
  ...realOnboarding,
  runOnboarding: mockRunOnboarding,
}));

// Mock initMachine with a trivial XState machine
import { setup } from "xstate";

const mockInitMachine = setup({
  types: {
    input: {} as {},
    output: {} as { continueToRun: boolean; exitCode: 0 | 1 },
  },
}).createMachine({
  id: "mockInit",
  initial: "done",
  states: {
    done: {
      type: "final",
    },
  },
  output: () => ({ continueToRun: true, exitCode: 0 as const }),
});

mock.module("../machines/init.machine.ts", () => ({
  initMachine: mockInitMachine,
}));

// ── Import after mocks ─────────────────────────────────────────────

const { runConfigureFlow } = await import("./configure.ts");

// ── Restore mocks after all tests ──────────────────────────────────

afterAll(() => {
  mock.module("@clack/prompts", () => realClack);
  mock.module("./onboarding/index.ts", () => realOnboarding);
  mock.module("../machines/init.machine.ts", () => realInitMachine);
});

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

    const result = await runConfigureFlow();
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
