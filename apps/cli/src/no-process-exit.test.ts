import { describe, test, expect } from "bun:test";
import { Glob } from "bun";

describe("architectural enforcement", () => {
  test("no process.exit() in lib/ or machines/ files", async () => {
    const violations: string[] = [];

    const patterns = ["lib/**/*.ts", "machines/**/*.ts"];

    const isTestFile = (path: string) => path.endsWith(".test.ts");

    for (const pattern of patterns) {
      const glob = new Glob(pattern);
      for await (const file of glob.scan({ cwd: import.meta.dir })) {
        if (isTestFile(file)) continue;

        const content = await Bun.file(`${import.meta.dir}/${file}`).text();
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (
            line.includes("process.exit(") &&
            !line.trimStart().startsWith("//") &&
            !line.trimStart().startsWith("*")
          ) {
            violations.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
