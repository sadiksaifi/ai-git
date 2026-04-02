import { fromPromise } from "xstate";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "@clack/prompts";
import { NoEditorError, EmptyEditError } from "../../lib/errors.ts";

// ── Types ───────────────────────────────────────────────────────────

export type EditorInput = {
  message: string;
  editor?: string;
};

type WhichFn = (cmd: string) => string | null | Promise<string | null>;

// ── Editor Detection ────────────────────────────────────────────────

const UNIX_FALLBACKS = ["nvim", "vim", "nano", "vi"];
const WIN_FALLBACKS = ["code --wait", "notepad"];

export async function resolveEditor(
  configEditor?: string,
  which: WhichFn = (cmd) => Bun.which(cmd),
): Promise<string> {
  const candidates: string[] = [];

  if (configEditor) candidates.push(configEditor);
  if (process.env.VISUAL) candidates.push(process.env.VISUAL);
  if (process.env.EDITOR) candidates.push(process.env.EDITOR);

  const fallbacks = process.platform === "win32" ? WIN_FALLBACKS : UNIX_FALLBACKS;
  candidates.push(...fallbacks);

  for (const candidate of candidates) {
    const firstToken = candidate.split(" ")[0]!;
    if (await which(firstToken)) return candidate;
  }

  throw new NoEditorError();
}

// ── Actor Factory ───────────────────────────────────────────────────

export function createEditorActor(
  resolver: (input: EditorInput) => Promise<string> = async (input) => {
    let editor: string;
    try {
      editor = await resolveEditor(input.editor);
    } catch (error) {
      if (error instanceof NoEditorError) {
        log.warn("No editor found — using original message.");
      }
      throw error;
    }
    const args = editor.split(" ");
    const tempFile = join(tmpdir(), `ai-git-msg-${randomUUID()}.txt`);
    args.push(tempFile);

    try {
      await Bun.write(tempFile, input.message);

      const proc = Bun.spawn(args, {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });

      const exitCode = await proc.exited;
      if (exitCode !== 0) throw new EmptyEditError();

      const content = (await Bun.file(tempFile).text()).trim();
      if (!content) throw new EmptyEditError();

      return content;
    } finally {
      await unlink(tempFile).catch(() => {});
    }
  },
) {
  return fromPromise(async ({ input }: { input: EditorInput }) => {
    return resolver(input);
  });
}

export const editorActor = createEditorActor();
