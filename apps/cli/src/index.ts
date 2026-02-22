#!/usr/bin/env bun
import { createActor, waitFor } from "xstate";
import cac from "cac";
import pc from "picocolors";
import { VERSION } from "./version.ts";
import type { CLIOptions } from "./machines/cli.machine.ts";
import { wiredCliMachine } from "./machines/cli.wired.ts";
import { upgradeMachine } from "./machines/upgrade.machine.ts";
import { FLAGS, COMMANDS } from "@ai-git/meta";
import { renderHelp } from "./lib/help.ts";
import { runConfigureFlow } from "./lib/configure.ts";

// Suppress AI SDK warning logs (we handle errors ourselves)
(globalThis as Record<string, unknown>).AI_SDK_LOG_WARNINGS = false;

const cli = cac("ai-git");

// ── Subcommands ─────────────────────────────────────────────────────
// Standalone flows that bypass cliMachine entirely.
// The main command (empty string) delegates to cliMachine below.

cli.command("configure", COMMANDS.configure.description).action(async () => {
  const result = await runConfigureFlow();
  if (result.continueToRun) {
    const defaultOptions: CLIOptions = {
      stageAll: false,
      commit: false,
      push: false,
      dangerouslyAutoApprove: false,
      dryRun: false,
    };
    const actor = createActor(wiredCliMachine, {
      input: { options: defaultOptions, version: VERSION },
    });
    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 600_000 });
    process.exit(snapshot.output!.exitCode);
  }
  process.exit(result.exitCode);
});

cli.command("upgrade", COMMANDS.upgrade.description).action(async () => {
  const actor = createActor(upgradeMachine, { input: { version: VERSION } });
  actor.start();
  const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 600_000 });
  process.exit(snapshot.output!.exitCode);
});

// ── Main Command ─────────────────────────────────────────────────────
// Default command (no subcommand). Flag definitions sourced from @ai-git/meta.

cli
  .command("")
  .option(`${FLAGS.provider.long} ${FLAGS.provider.arg}`, FLAGS.provider.description)
  .option(`${FLAGS.model.long} ${FLAGS.model.arg}`, FLAGS.model.description)
  .option(`${FLAGS.stageAll.short}, ${FLAGS.stageAll.long}`, FLAGS.stageAll.description)
  .option(`${FLAGS.commit.short}, ${FLAGS.commit.long}`, FLAGS.commit.description)
  .option(`${FLAGS.push.short}, ${FLAGS.push.long}`, FLAGS.push.description)
  .option(`${FLAGS.hint.short}, ${FLAGS.hint.long} ${FLAGS.hint.arg}`, FLAGS.hint.description)
  .option(
    `${FLAGS.exclude.short}, ${FLAGS.exclude.long} ${FLAGS.exclude.arg}`,
    FLAGS.exclude.description,
  )
  .option(FLAGS.dangerouslyAutoApprove.long, FLAGS.dangerouslyAutoApprove.description)
  .option(FLAGS.dryRun.long, FLAGS.dryRun.description)
  .option(`${FLAGS.version.short}, ${FLAGS.version.long}`, FLAGS.version.description)
  .action(async (options: CLIOptions) => {
    const actor = createActor(wiredCliMachine, {
      input: { options, version: VERSION },
    });
    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 600_000 });
    process.exit(snapshot.output!.exitCode);
  });

// ── Entry Point ──────────────────────────────────────────────────────

try {
  const parsed = cli.parse(process.argv, { run: false });

  if (parsed.options.version) {
    console.log(VERSION);
    process.exit(0);
  } else if (parsed.options.help) {
    console.log(renderHelp());
    process.exit(0);
  } else {
    await cli.runMatchedCommand();
  }
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Unknown option")) {
    console.error(pc.red(`Error: ${error.message}`));
    console.error(pc.dim("Use --help to see available options."));
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
}
