import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PROVIDERS as PROVIDER_DOCS, isCLIProviderDoc } from "@ai-git/meta";
import { resolveCacheDir } from "../../lib/paths.ts";
import type { CLIProviderAdapter, InvokeOptions } from "../types.ts";
import { parseDynamicVariantModel, readProcessOutput, type DynamicCLIModel } from "./dynamic.ts";

const OPENCODE_AGENT = "ai-git";

/**
 * Oldest OpenCode release verified with this adapter: the session API, the
 * `plugin.use` and `mcp.use` policies, and `serve --stdio` all behave as the
 * adapter expects from 2.2.6 on.
 */
const MINIMUM_OPENCODE_VERSION = [2, 2, 6] as const;

/**
 * Policies for every OpenCode call. Policies are checked before OpenCode
 * imports a plugin module or starts an MCP server, so user plugins, MCP
 * servers, and skills never load. Plugin directives alone run too late: OpenCode
 * imports a plugin module before it applies later removal directives.
 */
const OPENCODE_POLICIES = [
  { action: "plugin.use", resource: "*", effect: "deny" },
  { action: "mcp.use", resource: "*", effect: "deny" },
  { action: "skill.use", resource: "*", effect: "deny" },
];

/**
 * Built-in plugins to turn off. `opencode.config.instruction` adds AGENTS.md
 * and other instruction files to the prompt, and `opencode.config.mcp`
 * registers the user's MCP servers.
 */
const OPENCODE_PLUGINS = ["-opencode.config.instruction", "-opencode.config.mcp"];

interface OpenCodeModelRecord {
  id?: unknown;
  providerID?: unknown;
  name?: unknown;
  enabled?: unknown;
  status?: unknown;
  capabilities?: unknown;
  variants?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Config passed through OPENCODE_CONFIG_CONTENT. OpenCode reads it only in the
 * process that loads config, so every call starts a private server instead of
 * using the shared background service.
 */
export function buildOpenCodeConfig(system?: string): Record<string, unknown> {
  return {
    policies: OPENCODE_POLICIES,
    plugins: OPENCODE_PLUGINS,
    ...(system === undefined
      ? {}
      : {
          agents: {
            [OPENCODE_AGENT]: {
              system,
              mode: "primary",
              hidden: true,
              permissions: [{ action: "*", resource: "*", effect: "deny" }],
            },
          },
        }),
  };
}

/**
 * OpenCode takes its working directory from PWD when it is set, so PWD must
 * point at the spawn directory. An inherited PWD would put the session in the
 * user's repository.
 */
export function buildOpenCodeEnv(cwd: string, system?: string): Record<string, string | undefined> {
  return {
    ...process.env,
    PWD: cwd,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(buildOpenCodeConfig(system)),
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  };
}

/**
 * The directory every OpenCode call runs in: empty and owned by ai-git, so no
 * project files or config reach the model. It stays the same across calls
 * because OpenCode records one project per directory, and a new directory per
 * call would add a project to the user's OpenCode database each time.
 */
export function getOpenCodeWorkDirectory(): string {
  return join(resolveCacheDir(), "opencode-workdir");
}

async function ensureOpenCodeWorkDirectory(): Promise<string> {
  const directory = getOpenCodeWorkDirectory();
  await mkdir(directory, { recursive: true });
  return directory;
}

/**
 * Parse `opencode api model.list` output. Each model expands into one option
 * per variant; a model without variants is offered as `provider/model`.
 */
export function parseOpenCodeModelList(output: string): DynamicCLIModel[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }

  const records = isPlainObject(parsed) && Array.isArray(parsed.data) ? parsed.data : [];
  const models: DynamicCLIModel[] = [];

  for (const record of records as OpenCodeModelRecord[]) {
    if (!isPlainObject(record)) continue;
    if (typeof record.providerID !== "string" || typeof record.id !== "string") continue;
    if (record.enabled === false || record.status === "deprecated") continue;

    const output = isPlainObject(record.capabilities) ? record.capabilities.output : undefined;
    if (Array.isArray(output) && !output.includes("text")) continue;

    const baseId = `${record.providerID}/${record.id}`;
    const name = typeof record.name === "string" && record.name ? record.name : baseId;
    const variants = Array.isArray(record.variants)
      ? record.variants
          .map((variant) => (isPlainObject(variant) ? variant.id : undefined))
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (variants.length === 0) {
      models.push({ id: baseId, name });
      continue;
    }

    for (const variant of variants) {
      models.push({ id: `${baseId}#${variant}`, name: `${name} (${variant})` });
    }
  }

  return models;
}

export interface OpenCodeReply {
  /** True once the session has gone idle after the prompt. */
  done: boolean;
  /** Text of the last assistant message. */
  text: string;
  /** Error message when the run failed. */
  error?: string;
}

/**
 * Read `GET /api/session/{id}/message?order=asc`. A run ends with an `idle`
 * item whose `outcome` is "succeeded" or "failed". A tool round trip produces
 * more than one assistant message, so the reply is the last one.
 */
export function parseOpenCodeMessages(response: unknown): OpenCodeReply {
  const items = isPlainObject(response) && Array.isArray(response.data) ? response.data : [];
  let text = "";
  let done = false;
  let error: string | undefined;

  for (const item of items) {
    if (!isPlainObject(item)) continue;
    if (item.type === "assistant" && Array.isArray(item.content)) {
      text = item.content
        .map((part) => (isPlainObject(part) && part.type === "text" ? part.text : undefined))
        .filter((part): part is string => typeof part === "string")
        .join("");
    } else if (item.type === "idle") {
      done = true;
      if (item.outcome !== "succeeded") {
        const message = isPlainObject(item.error) ? item.error.message : undefined;
        error =
          typeof message === "string" && message
            ? message
            : `OpenCode run ended with outcome ${JSON.stringify(item.outcome ?? null)}`;
      }
    }
  }

  return { done, text, ...(error ? { error } : {}) };
}

export function parseOpenCodeVersion(output: string): number[] | null {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

export function isSupportedOpenCodeVersion(version: number[]): boolean {
  for (let index = 0; index < MINIMUM_OPENCODE_VERSION.length; index += 1) {
    const difference = (version[index] ?? 0) - MINIMUM_OPENCODE_VERSION[index]!;
    if (difference !== 0) return difference > 0;
  }
  return true;
}

function openCodeUpgradeHint(): string {
  const doc = PROVIDER_DOCS.opencode;
  return doc && isCLIProviderDoc(doc) ? ` Install the current release: ${doc.installCommand}` : "";
}

/**
 * OpenCode 1.x ignores the 2.x `agents` config, so it would run with its
 * default tool permissions. Check the version before every call.
 */
async function assertSupportedOpenCodeVersion(): Promise<void> {
  const proc = Bun.spawn(["opencode", "--version"], { stdout: "pipe", stderr: "pipe" });
  const { stdout, stderr, exitCode } = await readProcessOutput(proc);
  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || "no output";
    throw new Error(`\`opencode --version\` failed (exit code ${exitCode}): ${detail}`);
  }

  const version = parseOpenCodeVersion(stdout || stderr);
  if (!version) {
    throw new Error(
      `Could not read the OpenCode version from \`opencode --version\`: ${(stdout || stderr).trim() || "no output"}`,
    );
  }

  if (!isSupportedOpenCodeVersion(version)) {
    throw new Error(
      `OpenCode ${MINIMUM_OPENCODE_VERSION.join(".")} or newer is required. Found ${version.join(".")}.${openCodeUpgradeHint()}`,
    );
  }
}

/** How long to wait for `opencode serve` to print its URL. */
const SERVER_START_TIMEOUT_MS = 30_000;
/** Timeout for one HTTP request to the private server. */
const REQUEST_TIMEOUT_MS = 30_000;
/** How long a generation may run before ai-git gives up. */
const GENERATION_TIMEOUT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 100;

interface OpenCodeServer {
  request(method: string, path: string, body?: unknown): Promise<unknown>;
  stop(): Promise<void>;
}

/**
 * Read a stream to the end in the background so the child never blocks on a
 * full pipe. Works on a stream that was already partly read.
 */
async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    // The stream closed with the process.
  } finally {
    reader.releaseLock();
  }
  return text;
}

/**
 * Start a private OpenCode server for one call. `serve --stdio` is the mode
 * OpenCode's own `--standalone` flag uses: it prints `{"url": ...}` on the first
 * stdout line and stops when stdin closes. The random password keeps other local
 * processes off the port.
 */
async function startOpenCodeServer(directory: string, system: string): Promise<OpenCodeServer> {
  const password = randomBytes(32).toString("base64url");
  const proc = Bun.spawn(
    [
      "opencode",
      "serve",
      "--stdio",
      "--port",
      "0",
      "--hostname",
      "127.0.0.1",
      "--log-level",
      "error",
    ],
    {
      cwd: directory,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...buildOpenCodeEnv(directory, system), OPENCODE_PASSWORD: password },
    },
  );
  const stderr = drain(proc.stderr);

  const stop = async () => {
    try {
      await proc.stdin.end();
    } catch {
      // The server already exited.
    }
    const exited = await Promise.race([
      proc.exited.then(() => true),
      Bun.sleep(2_000).then(() => false),
    ]);
    if (!exited) proc.kill();
  };

  let url: string;
  try {
    url = await readServerUrl(proc.stdout, proc.exited, stderr);
  } catch (error) {
    await stop();
    throw error;
  }

  const headers = {
    authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
    "content-type": "application/json",
    "x-opencode-directory": encodeURIComponent(directory),
  };

  return {
    async request(method, path, body) {
      const response = await fetch(new URL(path, url), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      if (!response.ok) {
        let detail = text.trim();
        try {
          const parsed = JSON.parse(text) as unknown;
          const message = isPlainObject(parsed)
            ? isPlainObject(parsed.error)
              ? parsed.error.message
              : parsed.message
            : undefined;
          if (typeof message === "string" && message) detail = message;
        } catch {
          // Keep the raw body.
        }
        throw new Error(`${method} ${path} returned ${response.status}: ${detail || "no body"}`);
      }
      return text ? (JSON.parse(text) as unknown) : undefined;
    },
    stop,
  };
}

async function readServerUrl(
  stdout: ReadableStream<Uint8Array>,
  exited: Promise<number>,
  stderr: Promise<string>,
): Promise<string> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let timeout: Timer | undefined;

  const firstLine = (async () => {
    while (!buffer.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) {
        const code = await exited;
        const detail = (await stderr).trim() || buffer.trim() || "no output";
        throw new Error(
          `\`opencode serve\` exited (exit code ${code}) before it started: ${detail}`,
        );
      }
      buffer += decoder.decode(value, { stream: true });
    }
    return buffer.slice(0, buffer.indexOf("\n"));
  })();
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () =>
        reject(
          new Error(
            `\`opencode serve\` did not start within ${SERVER_START_TIMEOUT_MS / 1000} seconds.`,
          ),
        ),
      SERVER_START_TIMEOUT_MS,
    );
  });

  try {
    const line = await Promise.race([firstLine, timedOut]);
    const parsed = JSON.parse(line) as unknown;
    if (!isPlainObject(parsed) || typeof parsed.url !== "string") {
      throw new Error(`Unexpected first line from \`opencode serve\`: ${line}`);
    }
    return parsed.url;
  } finally {
    if (timeout) clearTimeout(timeout);
    // Keep draining stdout so the server never blocks on a full pipe.
    reader.releaseLock();
    void drain(stdout);
  }
}

/**
 * Split `provider/model#variant` into the session API's model object.
 */
export function toOpenCodeSessionModel(model: string): {
  providerID: string;
  id: string;
  variant?: string;
} {
  const { model: baseModel, variant } = parseDynamicVariantModel(model);
  const slash = baseModel.indexOf("/");
  if (slash <= 0 || slash === baseModel.length - 1) {
    throw new Error(
      `OpenCode model IDs use provider/model or provider/model#variant. Got "${model}". Run \`ai-git configure\` to pick a model.`,
    );
  }
  return {
    providerID: baseModel.slice(0, slash),
    id: baseModel.slice(slash + 1),
    ...(variant ? { variant } : {}),
  };
}

function readSessionId(response: unknown): string {
  const data = isPlainObject(response) && isPlainObject(response.data) ? response.data : response;
  const id = isPlainObject(data) ? data.id : undefined;
  if (typeof id !== "string" || !id) {
    throw new Error(`OpenCode did not return a session ID: ${JSON.stringify(response)}`);
  }
  return id;
}

/**
 * Run one prompt through the session API and delete the session afterwards,
 * so nothing stays in the user's OpenCode database. This is the code path
 * `opencode run` uses, so the system prompt, variants, provider logins, and
 * permissions behave the same.
 */
async function generateWithOpenCodeSession(
  server: OpenCodeServer,
  directory: string,
  { model, prompt }: Pick<InvokeOptions, "model" | "prompt">,
): Promise<string> {
  const deny = [{ action: "*", resource: "*", effect: "deny" }];
  const sessionId = readSessionId(
    await server.request("POST", "/api/session", {
      // A title skips the extra model call OpenCode makes to name a session.
      title: "ai-git",
      agent: OPENCODE_AGENT,
      model: toOpenCodeSessionModel(model),
      permissions: deny,
      location: { directory },
    }),
  );

  try {
    // Archived sessions stay out of the TUI if ai-git is killed before the delete.
    await server.request("PATCH", `/api/session/${sessionId}`, { archived: true });
    await server.request("POST", `/api/session/${sessionId}/prompt`, {
      text: prompt,
      delivery: "steer",
    });

    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    while (true) {
      const reply = parseOpenCodeMessages(
        await server.request("GET", `/api/session/${sessionId}/message?order=asc`),
      );
      if (reply.done) {
        if (reply.error) throw new Error(`OpenCode CLI error:\n${reply.error}`);
        return reply.text;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `OpenCode did not finish within ${GENERATION_TIMEOUT_MS / 60_000} minutes.`,
        );
      }
      await Bun.sleep(POLL_INTERVAL_MS);
    }
  } finally {
    await server.request("DELETE", `/api/session/${sessionId}`).catch(() => {});
  }
}

export const opencodeAdapter: CLIProviderAdapter = {
  providerId: "opencode",
  mode: "cli",
  binary: "opencode",

  async invoke(options: InvokeOptions): Promise<string> {
    await assertSupportedOpenCodeVersion();
    // Fail on a malformed model ID before starting a server.
    toOpenCodeSessionModel(options.model);

    const directory = await ensureOpenCodeWorkDirectory();
    const server = await startOpenCodeServer(directory, options.system);
    try {
      return await generateWithOpenCodeSession(server, directory, options);
    } finally {
      await server.stop();
    }
  },

  async checkAvailable(): Promise<boolean> {
    return !!(await Bun.which("opencode"));
  },

  async fetchModels(): Promise<DynamicCLIModel[]> {
    await assertSupportedOpenCodeVersion();

    // Same isolation as generation, so setup lists only models that
    // generation can run.
    const directory = await ensureOpenCodeWorkDirectory();
    const proc = Bun.spawn(["opencode", "api", "model.list", "--standalone"], {
      cwd: directory,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: buildOpenCodeEnv(directory),
    });
    const { stdout, stderr, exitCode } = await readProcessOutput(proc);

    if (exitCode !== 0) {
      const errorMessage = stderr.trim() || stdout.trim() || "Unknown error";
      throw new Error(`OpenCode model listing failed (exit code ${exitCode}): ${errorMessage}`);
    }

    const models = parseOpenCodeModelList(stdout);
    if (models.length === 0) {
      throw new Error("OpenCode returned no usable models. Run `opencode models` to verify setup.");
    }

    return models;
  },
};
