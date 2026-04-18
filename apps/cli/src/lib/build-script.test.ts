import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

const CLI_DIR = resolve(import.meta.dir, "../../");
const CLI_PACKAGE_JSON_PATH = resolve(CLI_DIR, "package.json");

describe("cli build script", () => {
  it("uses the checked build wrapper", async () => {
    const packageJson = (await Bun.file(CLI_PACKAGE_JSON_PATH).json()) as {
      scripts?: { build?: string };
    };

    expect(packageJson.scripts?.build).toBe("bun run scripts/build.ts");
  });
});
