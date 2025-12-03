#!/usr/bin/env bun
import {
  intro,
  outro,
  spinner,
  select,
  confirm,
  multiselect,
  isCancel,
  note,
  log,
} from "@clack/prompts";
import cac from "cac";
import pc from "picocolors";
import { $ } from "bun";
import * as path from "node:path";
import * as os from "node:os";
import { encode } from "@toon-format/toon";
import { SYSTEM_PROMPT_DATA } from "./prompt.ts";
import packageJson from "../package.json";

// ==============================================================================
// METADATA & CONFIG
// ==============================================================================
const cli = cac("ai-git");
const VERSION = packageJson.version;

function parseShellArgs(input: string): string[] {
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args = [];
  let match;
  while ((match = regex.exec(input)) !== null) {
    if (match[1] !== undefined) {
      args.push(match[1]);
    } else if (match[2] !== undefined) {
      args.push(match[2]);
    } else {
      args.push(match[0]);
    }
  }
  return args;
}

// Temporary files
const TEMP_MSG_FILE = path.join(os.tmpdir(), "ai-git-msg.txt");

const LOCKFILES = [
  ":(exclude)package-lock.json",
  ":(exclude)yarn.lock",
  ":(exclude)pnpm-lock.yaml",
  ":(exclude)bun.lockb",
  ":(exclude)bun.lock",
  ":(exclude)Cargo.lock",
  ":(exclude)Gemfile.lock",
  ":(exclude)composer.lock",
  ":(exclude)poetry.lock",
  ":(exclude)deno.lock",
  ":(exclude)go.sum",
];

// ==============================================================================
// SYSTEM PROMPT
// ==============================================================================

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

async function checkDependencies(binaryCmd: string) {
  try {
    await $`git --version`.quiet();
  } catch {
    console.error(pc.red("Error: 'git' is not installed."));
    process.exit(1);
  }

  try {
    await $`which ${binaryCmd}`.quiet();
  } catch {
    console.error(pc.red(`Error: '${binaryCmd}' cli tool not found in PATH.`));
    process.exit(1);
  }

  try {
    await $`git rev-parse --is-inside-work-tree`.quiet();
  } catch {
    console.error(pc.red("Error: Not a git repository."));
    process.exit(1);
  }
}

async function getStagedFiles(): Promise<string[]> {
  const output = await $`git diff --cached --name-only`.text();
  return output.trim().split("\n").filter(Boolean);
}

async function getUnstagedFiles(): Promise<string[]> {
  const modified = await $`git ls-files -m --exclude-standard`.text();
  const untracked = await $`git ls-files -o --exclude-standard`.text();
  return [...modified.split("\n"), ...untracked.split("\n")]
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i); // unique
}

// ==============================================================================
// MAIN LOGIC
// ==============================================================================

cli
  .command("", "Generate a commit message using AI")
  .option("-a, --stage-all", "Automatically stage all changes")
  .option("-c, --commit", "Automatically commit (skip editor/confirmation)")
  .option("-p, --push", "Automatically push after commit")
  .option("-y, --yes", "Run fully automated (Stage All + Commit + Push)")
  .option("-H, --hint <text>", "Provide a hint/context to the AI")
  .option("--dry-run", "Print the prompt and diff without calling AI")
  .option("--ai-model <model>", "AI Model to use", {
    default: "gemini-2.5-flash",
  })
  .option("--ai-binary <cmd>", "AI Binary to use", {
    default: "gemini",
  })
  .option("-v, --version", "Display version number")
  .action(async (options) => {
    // Handle -y alias
    if (options.yes) {
      options.stageAll = true;
      options.commit = true;
      options.push = true;
    }

    // Resolve AI options
    const MODEL = options.aiModel;
    const AI_BINARY = options.aiBinary;

    console.clear();
    intro(pc.bgCyan(pc.black(` AI Git ${VERSION} `)));

    await checkDependencies(AI_BINARY);

    // 1. STAGE MANAGEMENT
    let stagedFiles = await getStagedFiles();

    if (stagedFiles.length > 0) {
      note(
        stagedFiles.map((f) => `+ ${f}`).join("\n"),
        "Currently Staged Files"
      );

      const unstagedFiles = await getUnstagedFiles();
      if (unstagedFiles.length > 0 && !options.stageAll && !options.yes) {
        const action = await select({
          message:
            "You have unstaged changes. Would you like to stage more files?",
          options: [
            { value: "continue", label: "No, proceed with generation" },
            { value: "select", label: "Yes, select files to stage" },
            { value: "all", label: "Stage All (git add -A)" },
          ],
        });

        if (isCancel(action)) {
          outro("Aborted.");
          process.exit(1);
        }

        if (action === "all") {
          const s = spinner();
          s.start("Staging all changes...");
          await $`git add -A`;
          s.stop("Staged all changes");
          stagedFiles = await getStagedFiles();
          note(
            stagedFiles.map((f) => `+ ${f}`).join("\n"),
            "Staged Files"
          );
        } else if (action === "select") {
          const selected = await multiselect({
            message: "Select files to stage",
            options: unstagedFiles.map((f) => ({ value: f, label: f })),
            required: false,
          });

          if (isCancel(selected)) {
            outro("Aborted.");
            process.exit(1);
          }

          if (selected.length > 0) {
            const s = spinner();
            s.start("Staging selected files...");
            for (const file of selected as string[]) {
              await $`git add ${file}`;
            }
            s.stop("Staged selected files");
            stagedFiles = await getStagedFiles();
          }
        }
      }
    } else {
      const unstagedFiles = await getUnstagedFiles();

      if (unstagedFiles.length === 0) {
        outro(pc.yellow("Working directory is clean. Nothing to do."));
        process.exit(0);
      }

      if (options.stageAll) {
        const s = spinner();
        s.start("Staging all changes...");
        await $`git add -A`;
        s.stop("Staged all changes");
        stagedFiles = await getStagedFiles();
        note(
          stagedFiles.map((f) => `+ ${f}`).join("\n"),
          "Staged Files"
        );
      } else {
        // Interactive Staging
        const action = await select({
          message: "No staged changes detected. What would you like to do?",
          options: [
            { value: "all", label: "Stage All (git add -A)" },
            { value: "select", label: "Select Files" },
            { value: "quit", label: "Quit" },
          ],
        });

        if (isCancel(action) || action === "quit") {
          outro("Aborted.");
          process.exit(1);
        }

        if (action === "all") {
          const s = spinner();
          s.start("Staging all changes...");
          await $`git add -A`;
          s.stop("Staged all changes");
          stagedFiles = await getStagedFiles();
          note(
            stagedFiles.map((f) => `+ ${f}`).join("\n"),
            "Staged Files"
          );
        } else if (action === "select") {
          const selected = await multiselect({
            message: "Select files to stage",
            options: unstagedFiles.map((f) => ({ value: f, label: f })),
            required: true,
          });

          if (isCancel(selected)) {
            outro("Aborted.");
            process.exit(1);
          }

          const s = spinner();
          s.start("Staging selected files...");
          for (const file of selected as string[]) {
            await $`git add ${file}`;
          }
          s.stop("Staged selected files");
        }
      }
    }

    // 2. GENERATION ENGINE
    let loop = true;
    while (loop) {
      // Get Diff
      const s = spinner();
      s.start(`Analyzing changes with ${MODEL}...`);

      const branchName = (
        await $`git rev-parse --abbrev-ref HEAD`.text()
      ).trim();
      // Using .join(' ') for LOCKFILES might not work as expected if spaces are in paths,
      // but git diff expects separate arguments.
      // Bun $ template literal with array works by joining with space? Or passing as args?
      // $`git diff --staged -- . ${LOCKFILES}` passes LOCKFILES elements as separate arguments.
      // This is safer.
      let diffOutput = await $`git diff --staged -- . ${LOCKFILES}`.text();

      // Fallback for empty diffs
      if (!diffOutput.trim()) {
        diffOutput = await $`git diff --staged --stat`.text();
      }

      // Truncate if massive
      const lines = diffOutput.split("\n");
      if (lines.length > 2500) {
        diffOutput =
          lines.slice(0, 2500).join("\n") + "\n... [DIFF TRUNCATED] ...";
      }

      let dynamicContext = "";
      if (branchName)
        dynamicContext += `# CURRENT BRANCH NAME\n${branchName}\n\n`;
      if (options.hint) dynamicContext += `# USER HINT\n${options.hint}\n\n`;

      const fullInput = `${encode(
        SYSTEM_PROMPT_DATA
      )}\n\n${dynamicContext}\n# GIT DIFF OUTPUT\n${diffOutput}`;

      if (options.dryRun) {
        s.stop("Dry run complete");
        note(fullInput, "Dry Run: Full Prompt");
        process.exit(0);
      }

      // Call AI
      let rawMsg = "";
      try {
        // Passing arguments to AI_BINARY
        // If AI_BINARY is "gemini", it runs `gemini --model ...`
        // $`${AI_BINARY} ...` splits AI_BINARY if it has spaces? No, it treats it as command.
        // If AI_BINARY="echo", it works.
        const result =
          await $`${AI_BINARY} --model ${MODEL} ${fullInput}`.text();
        rawMsg = result;
        s.stop("Message generated");
      } catch (e) {
        s.stop("Generation failed");
        console.error(e);
        process.exit(1);
      }

      // Cleanup message
      let cleanMsg = rawMsg
        .replace(/^```.*/gm, "") // Remove code blocks
        .replace(/```$/gm, "")
        .trim();

      if (!cleanMsg) {
        console.error(pc.red("Error: AI returned empty message."));
        process.exit(1);
      }

      // 3. COMMIT LOGIC
      if (options.commit) {
        await $`git commit -m ${cleanMsg}`;
        outro(pc.green(`Commit created: ${cleanMsg.split("\n")[0]}`));
        loop = false;
      } else {
        note(cleanMsg, "Generated Commit Message");

        const action = await select({
          message: "Action",
          options: [
            { value: "commit", label: "Commit" },
            { value: "edit", label: "Edit Message" },
            { value: "retry", label: "Regenerate" },
            { value: "abort", label: "Abort" },
          ],
        });

        if (isCancel(action) || action === "abort") {
          outro("Aborted.");
          process.exit(1);
        }

        if (action === "retry") {
          continue;
        } else if (action === "commit") {
          await $`git commit -m ${cleanMsg}`;
          outro(pc.green("Commit created successfully."));
          loop = false;
        } else if (action === "edit") {
          // Edit Flow
          await Bun.write(TEMP_MSG_FILE, cleanMsg);
          const editor = process.env.EDITOR || "vim";

          const editProc = Bun.spawn([editor, TEMP_MSG_FILE], {
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          });
          await editProc.exited;

          const finalMsg = await Bun.file(TEMP_MSG_FILE).text();
          if (finalMsg.trim()) {
            await $`git commit -m ${finalMsg.trim()}`;
            outro(pc.green("Commit created successfully (edited)."));
            loop = false;
          } else {
            outro(pc.yellow("Message cleared. Aborting."));
            process.exit(1);
          }
        }
      }
    }

    // 4. PUSH LOGIC
    if (options.push) {
      const s = spinner();
      s.start("Pushing changes...");
      await $`git push`;
      s.stop("Pushed successfully");
    } else if (!options.yes) {
      const shouldPush = await confirm({
        message: "Do you want to git push?",
        initialValue: false,
      });

      if (shouldPush && !isCancel(shouldPush)) {
        const s = spinner();
        s.start("Pushing changes...");
        await $`git push`;
        s.stop("Pushed successfully");
      }
    }

    outro("All done!");
  });

cli.help();

try {
  // Parse AI_GIT_OPTS
  const envOpts = process.env.AI_GIT_OPTS
    ? parseShellArgs(process.env.AI_GIT_OPTS)
    : [];
  const args = [
    ...process.argv.slice(0, 2),
    ...envOpts,
    ...process.argv.slice(2),
  ];

  const parsed = cli.parse(args, { run: false });
  if (parsed.options.version) {
    console.log(VERSION);
    process.exit(0);
  } else if (parsed.options.help) {
    cli.outputHelp();
    process.exit(0);
  } else {
    cli.runMatchedCommand();
  }
} catch (error) {
  console.error(error);
  process.exit(1);
}
