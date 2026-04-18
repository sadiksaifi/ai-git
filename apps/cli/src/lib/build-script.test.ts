import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLI_DIR = resolve(import.meta.dir, "../../");
const CLI_PACKAGE_JSON_PATH = resolve(CLI_DIR, "package.json");

describe("cli build script", () => {
  it("uses the checked build wrapper", () => {
    const packageJson = JSON.parse(readFileSync(CLI_PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: { build?: string };
    };

    expect(packageJson.scripts?.build).toBe("bun run scripts/build.ts");
  });
});
