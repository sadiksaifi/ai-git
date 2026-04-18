import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dir, "../../../../");
const ROOT_PACKAGE_JSON_PATH = resolve(ROOT_DIR, "package.json");

export async function readPinnedBunVersion(): Promise<string> {
  const packageJson = (await Bun.file(ROOT_PACKAGE_JSON_PATH).json()) as {
    packageManager?: string;
  };
  const match = packageJson.packageManager?.match(/^bun@(.+)$/);

  if (!match?.[1]) {
    throw new Error("Root package.json must pin Bun via packageManager");
  }

  return match[1];
}
