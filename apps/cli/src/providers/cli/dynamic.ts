export interface DynamicCLIModel {
  id: string;
  name: string;
}

export interface ParsedVariantModel {
  model: string;
  variant?: string;
}

/**
 * Split ai-git's dynamic CLI virtual model format on the last '#'.
 * Base model IDs may contain slashes, colons, or other separators.
 */
export function parseDynamicVariantModel(virtualId: string): ParsedVariantModel {
  const separatorIndex = virtualId.lastIndexOf("#");
  if (separatorIndex <= 0 || separatorIndex === virtualId.length - 1) {
    return { model: virtualId };
  }

  return {
    model: virtualId.slice(0, separatorIndex),
    variant: virtualId.slice(separatorIndex + 1),
  };
}

interface PipedProcess {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
}

export async function readProcessOutput(proc: PipedProcess): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}
