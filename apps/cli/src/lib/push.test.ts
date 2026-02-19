import { describe, expect, it } from "bun:test";
import { shouldProceedWithPush } from "./push.ts";

describe("shouldProceedWithPush", () => {
  it("returns false when user declines initial push prompt", async () => {
    const result = await shouldProceedWithPush({
      confirmPrompt: async () => false,
      getRemoteSyncStatusFn: async () => ({
        hasUpstream: true,
        remoteAhead: false,
        localAhead: false,
      }),
    });

    expect(result).toBe(false);
  });

  it("returns true when user confirms push and remote is not ahead", async () => {
    const confirmCalls: string[] = [];

    const result = await shouldProceedWithPush({
      confirmPrompt: async ({ message }) => {
        confirmCalls.push(message);
        return true;
      },
      getRemoteSyncStatusFn: async () => ({
        hasUpstream: true,
        remoteAhead: false,
        localAhead: true,
      }),
    });

    expect(result).toBe(true);
    expect(confirmCalls).toEqual(["Do you want to git push?"]);
  });

  it("suggests pulling first and aborts when user declines continue prompt", async () => {
    const confirmCalls: string[] = [];
    const warnings: string[] = [];

    const result = await shouldProceedWithPush({
      confirmPrompt: async ({ message }) => {
        confirmCalls.push(message);
        return confirmCalls.length === 1;
      },
      getRemoteSyncStatusFn: async () => ({
        hasUpstream: true,
        remoteAhead: true,
        localAhead: false,
      }),
      warn: (message) => warnings.push(message),
    });

    expect(result).toBe(false);
    expect(confirmCalls).toEqual([
      "Do you want to git push?",
      "Remote has new commits. Pull first before pushing. Continue anyway?",
    ]);
    expect(warnings).toEqual([
      "Remote has new commits. Consider running `git pull --rebase` before pushing.",
    ]);
  });

  it("continues only if user confirms second prompt when remote is ahead", async () => {
    const confirmCalls: string[] = [];

    const result = await shouldProceedWithPush({
      confirmPrompt: async ({ message }) => {
        confirmCalls.push(message);
        return true;
      },
      getRemoteSyncStatusFn: async () => ({
        hasUpstream: true,
        remoteAhead: true,
        localAhead: false,
      }),
      warn: () => undefined,
    });

    expect(result).toBe(true);
    expect(confirmCalls).toEqual([
      "Do you want to git push?",
      "Remote has new commits. Pull first before pushing. Continue anyway?",
    ]);
  });
});
