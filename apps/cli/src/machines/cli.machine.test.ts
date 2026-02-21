import { describe, test, expect } from "bun:test";
import { createActor, waitFor, fromPromise } from "xstate";
import { cliMachine } from "./cli.machine.ts";
import type { CLIInput } from "./cli.machine.ts";

// ── Helpers ──────────────────────────────────────────────────────────

const defaultOptions = (): CLIInput["options"] => ({
  provider: undefined,
  model: undefined,
  stageAll: false,
  commit: false,
  push: false,
  dangerouslyAutoApprove: false,
  dryRun: false,
  setup: false,
  init: false,
  version: false,
  help: false,
});

const defaultInput = (overrides?: Partial<CLIInput["options"]>): CLIInput => ({
  options: { ...defaultOptions(), ...overrides },
  version: "1.0.0",
});

/** Mock resolved config data returned by loadAndResolveConfigActor */
const mockConfigResult = () => ({
  config: {
    provider: "claude-code",
    model: "sonnet-low",
    prompt: undefined,
    editor: undefined,
    slowWarningThresholdMs: 5000,
  },
  providerDef: {
    id: "claude-code",
    name: "Claude Code",
    mode: "cli" as const,
    binary: "claude",
    isDefault: false,
    dynamicModels: false,
    models: [{ id: "sonnet-low", name: "Claude Sonnet (low)", isDefault: true }],
  },
  adapter: {
    providerId: "claude-code",
    mode: "cli" as const,
    invoke: async () => "feat: test",
    checkAvailable: async () => true,
  },
  model: "sonnet-low",
  modelName: "Claude Sonnet (low)",
  needsSetup: false,
});

/** Standard actor overrides for the normal (happy-path) flow */
const happyPathActors = () => ({
  loadAndResolveConfigActor: fromPromise(async () => mockConfigResult()),
  showWelcomeActor: fromPromise(async () => {}),
  checkGitActor: fromPromise(async () => {}),
  checkAvailabilityActor: fromPromise(async () => true),
  stagingMachine: fromPromise(async () => ({
    stagedFiles: ["file.ts"],
    aborted: false,
  })),
  generationMachine: fromPromise(async () => ({
    message: "feat: test commit",
    committed: true,
    aborted: false,
  })),
  pushMachine: fromPromise(async () => ({
    pushed: false,
    exitCode: 0,
  })),
});

// ── Tests ────────────────────────────────────────────────────────────

describe("cliMachine", () => {
  // E5: normal flow happy path (config exists, files staged, commit, push)
  test("E5: normal flow with existing config", async () => {
    const machine = cliMachine.provide({ actors: happyPathActors() });
    const actor = createActor(machine, { input: defaultInput() });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(0);
  });

  // Bug #2: unknown provider -> error with dynamic provider list
  test("Bug #2: unknown provider error exits with code 1", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        loadAndResolveConfigActor: fromPromise(async () => {
          throw new Error(
            "Unknown provider 'invalid'. Supported providers: codex, claude-code, gemini-cli, openrouter, openai, google-ai-studio, anthropic, cerebras",
          );
        }),
      },
    });
    const actor = createActor(machine, {
      input: defaultInput({ provider: "invalid" }),
    });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(1);
  });

  // --init flag -> invokes init machine
  test("--init invokes init machine", async () => {
    let initCalled = false;
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        initMachine: fromPromise(async () => {
          initCalled = true;
          return { continue: false, exitCode: 0 as const };
        }),
      },
    });
    const actor = createActor(machine, {
      input: defaultInput({ init: true }),
    });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(initCalled).toBe(true);
    expect(snap.output.exitCode).toBe(0);
  });

  // --init -> continue to normal flow
  test("--init with continue=true proceeds to normal flow", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        initMachine: fromPromise(async () => ({
          continue: true,
          exitCode: 0 as const,
        })),
      },
    });
    const actor = createActor(machine, {
      input: defaultInput({ init: true }),
    });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(0);
  });

  // Staging abort -> exit 1
  test("staging abort exits with code 1", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        stagingMachine: fromPromise(async () => ({
          stagedFiles: [],
          aborted: true,
        })),
      },
    });
    const actor = createActor(machine, { input: defaultInput() });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(1);
  });

  // Clean working directory -> exit 0
  test("clean working directory exits with code 0", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        stagingMachine: fromPromise(async () => ({
          stagedFiles: [],
          aborted: false,
        })),
      },
    });
    const actor = createActor(machine, { input: defaultInput() });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(0);
  });

  // --setup flag triggers setup wizard
  test("--setup flag triggers setup wizard", async () => {
    let setupCalled = false;
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        loadAndResolveConfigActor: fromPromise(async () => ({
          ...mockConfigResult(),
          needsSetup: true,
        })),
        runOnboardingActor: fromPromise(async () => {
          setupCalled = true;
          return { completed: true, continueToRun: false };
        }),
      },
    });
    const actor = createActor(machine, {
      input: defaultInput({ setup: true }),
    });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(setupCalled).toBe(true);
    expect(snap.output.exitCode).toBe(0);
  });

  // Generation abort -> exit 1
  test("generation abort exits with code 1", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        generationMachine: fromPromise(async () => ({
          message: "",
          committed: false,
          aborted: true,
        })),
      },
    });
    const actor = createActor(machine, { input: defaultInput() });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(1);
  });

  // --dangerouslyAutoApprove expands flags
  test("--dangerouslyAutoApprove expands to stageAll+commit+push", async () => {
    let capturedInput: Record<string, unknown> | null = null;
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        stagingMachine: fromPromise(async ({ input }: { input: Record<string, unknown> }) => {
          capturedInput = input;
          return { stagedFiles: ["file.ts"], aborted: false };
        }),
      },
    });
    const actor = createActor(machine, {
      input: defaultInput({ dangerouslyAutoApprove: true }),
    });
    actor.start();

    await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(capturedInput).not.toBeNull();
    expect((capturedInput as Record<string, unknown>).stageAll).toBe(true);
  });

  // Setup not completed -> exit 1
  test("onboarding not completed exits with code 1", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        loadAndResolveConfigActor: fromPromise(async () => ({
          ...mockConfigResult(),
          needsSetup: true,
        })),
        runOnboardingActor: fromPromise(async () => ({
          completed: false,
          continueToRun: false,
        })),
      },
    });
    const actor = createActor(machine, {
      input: defaultInput({ setup: true }),
    });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(1);
  });

  // Git check failure -> exit 1
  test("git check failure exits with code 1", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        checkGitActor: fromPromise(async () => {
          throw new Error("git not installed");
        }),
      },
    });
    const actor = createActor(machine, { input: defaultInput() });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(1);
  });

  // Provider not available -> exit 1
  test("provider not available exits with code 1", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        checkAvailabilityActor: fromPromise(async () => {
          throw new Error("CLI not installed");
        }),
      },
    });
    const actor = createActor(machine, { input: defaultInput() });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(1);
  });

  // Onboarding completes and continues to normal flow
  test("onboarding completes and continues to normal flow", async () => {
    const machine = cliMachine.provide({
      actors: {
        ...happyPathActors(),
        loadAndResolveConfigActor: fromPromise(async () => ({
          ...mockConfigResult(),
          needsSetup: true,
        })),
        runOnboardingActor: fromPromise(async () => ({
          completed: true,
          continueToRun: true,
        })),
        // After onboarding, we need to re-resolve config
        reloadConfigActor: fromPromise(async () => mockConfigResult()),
      },
    });
    const actor = createActor(machine, {
      input: defaultInput({ setup: true }),
    });
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 5000,
    });
    expect(snap.output.exitCode).toBe(0);
  });
});
