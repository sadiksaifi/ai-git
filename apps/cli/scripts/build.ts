import { resolve } from "node:path";
import {
  getSmokeTestBinaryPath,
  parseBuildTarget,
  shouldSmokeTestBuiltBinary,
} from "../src/lib/build-artifact.ts";

const FORWARDED_ARGS = Bun.argv.slice(2);
const REQUESTED_TARGET = parseBuildTarget(FORWARDED_ARGS);
const SMOKE_TEST_BINARY_PATH = resolve(getSmokeTestBinaryPath(FORWARDED_ARGS));

const buildProc = Bun.spawn(
  [
    "bun",
    "build",
    "--compile",
    "--minify",
    "--sourcemap",
    "src/index.ts",
    "--outfile",
    "dist/ai-git",
    ...FORWARDED_ARGS,
  ],
  {
    stdout: "inherit",
    stderr: "inherit",
  },
);

const buildExitCode = await buildProc.exited;
if (buildExitCode !== 0) process.exit(buildExitCode);

if (!shouldSmokeTestBuiltBinary(REQUESTED_TARGET)) {
  console.log(`Skipped compiled binary smoke test for cross-target build: ${REQUESTED_TARGET}`);
  process.exit(0);
}

const smokeProc = Bun.spawn([SMOKE_TEST_BINARY_PATH, "--help"], {
  stdout: "ignore",
  stderr: "pipe",
});

const smokeStderr = await new Response(smokeProc.stderr).text();
const smokeExitCode = await smokeProc.exited;

if (smokeExitCode !== 0) {
  const detail = smokeStderr.trim();
  console.error("Built binary failed smoke test.");
  if (detail) console.error(detail);
  console.error(
    "If Bun compiled binaries are getting killed on your machine, build with Bun 1.3.11.",
  );
  console.error("Example: `mise use bun@1.3.11 && bun run build`");
  process.exit(smokeExitCode || 1);
}
