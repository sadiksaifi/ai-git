import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { request as httpRequest } from "node:http";
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
 * using the shared background service. `base` is the user's own
 * OPENCODE_CONFIG_CONTENT, kept so providers defined there still work; its
 * policies and plugin directives are replaced by ai-git's.
 */
export function buildOpenCodeConfig(
  system?: string,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const baseAgents = isPlainObject(base.agents) ? base.agents : {};
  return {
    ...base,
    policies: OPENCODE_POLICIES,
    plugins: OPENCODE_PLUGINS,
    ...(system === undefined
      ? {}
      : {
          agents: {
            ...baseAgents,
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

function parseUserConfigContent(content: string | undefined): Record<string, unknown> {
  if (!content) return {};
  try {
    const parsed = JSON.parse(content) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    // JSONC or invalid content cannot be merged; OpenCode would reject it too.
    return {};
  }
}

const SYSTEM_PLACEHOLDER = "__AI_GIT_SYSTEM_PROMPT__";

/**
 * Serialize the config for OPENCODE_CONFIG_CONTENT. OpenCode replaces
 * `{env:VAR}` and `{file:path}` in the raw config text before it parses it, so
 * a system prompt containing `{file:~/.ssh/id_ed25519}` (for example from a
 * repository's `.ai-git.json`) would send that file to the model. Writing every
 * `{` in the system prompt as `\u007b` keeps it literal: the JSON parser still
 * reads `{`, but the raw text no longer matches.
 */
export function buildOpenCodeConfigContent(
  system?: string,
  userContent: string | undefined = process.env.OPENCODE_CONFIG_CONTENT,
): string {
  const base = parseUserConfigContent(userContent);
  if (system === undefined) return JSON.stringify(buildOpenCodeConfig(undefined, base));

  const json = JSON.stringify(buildOpenCodeConfig(SYSTEM_PLACEHOLDER, base));
  const escapedSystem = JSON.stringify(system).replaceAll("{", "\\u007b");
  return json.replace(JSON.stringify(SYSTEM_PLACEHOLDER), () => escapedSystem);
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
    OPENCODE_CONFIG_CONTENT: buildOpenCodeConfigContent(system),
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

function readItems(response: unknown): Record<string, unknown>[] {
  const items = isPlainObject(response) && Array.isArray(response.data) ? response.data : [];
  return items.filter(isPlainObject);
}

/**
 * Read `GET /api/session/{id}/message?type=idle&order=desc&limit=1`. A run ends
 * with an `idle` item whose `outcome` is "succeeded" or "failed". Returns null
 * while the run is still going.
 */
export function parseOpenCodeIdle(response: unknown): { error?: string } | null {
  const idle = readItems(response).find((item) => item.type === "idle");
  if (!idle) return null;
  if (idle.outcome === "succeeded") return {};
  const message = isPlainObject(idle.error) ? idle.error.message : undefined;
  return {
    error:
      typeof message === "string" && message
        ? message
        : `OpenCode run ended with outcome ${JSON.stringify(idle.outcome ?? null)}`,
  };
}

/**
 * Read `GET /api/session/{id}/message?type=assistant&order=desc&limit=1`: the
 * text of the newest assistant message. A tool round trip produces more than
 * one assistant message, and the reply is the last one.
 */
export function parseOpenCodeAssistantText(response: unknown): string {
  const assistant = readItems(response).find((item) => item.type === "assistant");
  if (!assistant || !Array.isArray(assistant.content)) return "";
  return assistant.content
    .map((part) => (isPlainObject(part) && part.type === "text" ? part.text : undefined))
    .filter((part): part is string => typeof part === "string")
    .join("");
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
/**
 * Sessions of this age in the work directory belong to an ai-git run that was
 * killed before it could delete them. Younger ones may belong to a run in
 * another terminal.
 */
const STALE_SESSION_MS = GENERATION_TIMEOUT_MS + 5 * 60_000;
/** How long cleanup after Ctrl-C may take before ai-git exits anyway. */
const INTERRUPT_CLEANUP_MS = 3_000;
const POLL_INTERVAL_MS = 100;

interface OpenCodeServer {
  request(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<unknown>;
  stop(): Promise<void>;
}

/**
 * Read a stream to the end in the background so the child never blocks on a
 * full pipe. Works on a stream that was already partly read. `sink.text` holds
 * everything read so far.
 */
async function drain(stream: ReadableStream<Uint8Array>, sink = { text: "" }): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sink.text += decoder.decode(value, { stream: true });
    }
  } catch {
    // The stream closed with the process.
  } finally {
    reader.releaseLock();
  }
  return sink.text;
}

/**
 * Send one request with node:http. Bun's fetch sends even loopback requests
 * through HTTP_PROXY, which would hand the server password and the prompt to
 * the proxy.
 */
function sendRequest(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method,
        headers:
          body === undefined
            ? headers
            : { ...headers, "content-length": `${Buffer.byteLength(body)}` },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timed out after ${timeoutMs / 1000} seconds`)));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function readErrorDetail(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    const message = isPlainObject(parsed)
      ? isPlainObject(parsed.error)
        ? parsed.error.message
        : parsed.message
      : undefined;
    if (typeof message === "string" && message) return message;
  } catch {
    // Keep the raw body.
  }
  return text.trim() || "no body";
}

/**
 * Start a private OpenCode server for one call. `serve --stdio` is the mode
 * OpenCode's own `--standalone` flag uses: it prints `{"url": ...}` on the first
 * stdout line and stops when stdin closes, which also happens if ai-git dies.
 * The random password keeps other local processes off the port. On macOS and
 * Linux the server gets its own process group, so Ctrl-C reaches only ai-git,
 * which then deletes the session before stopping the server.
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
      detached: process.platform !== "win32",
      env: { ...buildOpenCodeEnv(directory, system), OPENCODE_PASSWORD: password },
    },
  );
  const stderr = { text: "" };
  const stderrDone = drain(proc.stderr, stderr);
  let exitCode: number | undefined;
  void proc.exited.then((code) => {
    exitCode = code;
  });

  const waitForExit = (ms: number) =>
    Promise.race([proc.exited.then(() => true), Bun.sleep(ms).then(() => false)]);
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      try {
        await proc.stdin.end();
      } catch {
        // The server already exited.
      }
      if (await waitForExit(2_000)) return;
      proc.kill("SIGTERM");
      if (await waitForExit(2_000)) return;
      proc.kill("SIGKILL");
    })());

  let url: string;
  try {
    url = await readServerUrl(proc.stdout, proc.exited, stderrDone);
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
    async request(method, path, body, timeoutMs = REQUEST_TIMEOUT_MS) {
      let response: { status: number; text: string };
      try {
        response = await sendRequest(
          new URL(path, url),
          method,
          headers,
          body === undefined ? undefined : JSON.stringify(body),
          timeoutMs,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const server =
          exitCode === undefined
            ? ""
            : ` The OpenCode server exited with code ${exitCode}: ${stderr.text.trim() || "no output"}`;
        throw new Error(`${method} ${path} failed: ${reason}.${server}`);
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `${method} ${path} returned ${response.status}: ${readErrorDetail(response.text)}`,
        );
      }
      return response.text ? (JSON.parse(response.text) as unknown) : undefined;
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = undefined;
    }
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
 * IDs of sessions in the work directory left by an ai-git run that was killed
 * before its delete ran, from `GET /api/session?archived=true&directory=...`.
 */
export function findStaleOpenCodeSessions(
  response: unknown,
  directory: string,
  now: number,
): string[] {
  return readItems(response).flatMap((session) => {
    const location = isPlainObject(session.location) ? session.location.directory : undefined;
    const created = isPlainObject(session.time) ? session.time.created : undefined;
    if (session.agent !== OPENCODE_AGENT || session.title !== OPENCODE_AGENT) return [];
    if (location !== directory || typeof created !== "number") return [];
    if (now - created < STALE_SESSION_MS || typeof session.id !== "string") return [];
    return [session.id];
  });
}

async function deleteStaleSessions(server: OpenCodeServer, directory: string): Promise<void> {
  try {
    const response = await server.request(
      "GET",
      `/api/session?archived=true&limit=50&directory=${encodeURIComponent(directory)}`,
    );
    for (const id of findStaleOpenCodeSessions(response, directory, Date.now())) {
      await server.request("DELETE", `/api/session/${id}`).catch(() => {});
    }
  } catch {
    // Best effort: a leftover session must not block generation.
  }
}

async function waitForReply(server: OpenCodeServer, sessionId: string): Promise<string> {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (true) {
    const idle = parseOpenCodeIdle(
      await server.request("GET", `/api/session/${sessionId}/message?type=idle&order=desc&limit=1`),
    );
    if (idle) {
      if (idle.error) throw new Error(`OpenCode CLI error:\n${idle.error}`);
      return parseOpenCodeAssistantText(
        await server.request(
          "GET",
          `/api/session/${sessionId}/message?type=assistant&order=desc&limit=1`,
        ),
      );
    }
    if (Date.now() > deadline) {
      throw new Error(`OpenCode did not finish within ${GENERATION_TIMEOUT_MS / 60_000} minutes.`);
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Delete the session and stop the server when ai-git gets SIGINT or SIGTERM,
 * then exit. Returns the function that removes the handlers.
 */
function onInterrupt(cleanup: () => Promise<void>): () => void {
  let interrupted = false;
  const handler = (signal: NodeJS.Signals) => {
    if (interrupted) process.exit(signal === "SIGINT" ? 130 : 143);
    interrupted = true;
    void Promise.race([cleanup(), Bun.sleep(INTERRUPT_CLEANUP_MS)]).finally(() =>
      process.exit(signal === "SIGINT" ? 130 : 143),
    );
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return () => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
}

export const opencodeAdapter: CLIProviderAdapter = {
  providerId: "opencode",
  mode: "cli",
  binary: "opencode",

  /**
   * Run one prompt through the session API and delete the session afterwards,
   * so nothing stays in the user's OpenCode database. This is the code path
   * `opencode run` uses, so the system prompt, variants, provider logins, and
   * permissions behave the same.
   */
  async invoke({ model, system, prompt }: InvokeOptions): Promise<string> {
    await assertSupportedOpenCodeVersion();
    // Fail on a malformed model ID before starting a server.
    const sessionModel = toOpenCodeSessionModel(model);

    const directory = await ensureOpenCodeWorkDirectory();
    const server = await startOpenCodeServer(directory, system);
    let sessionId: string | undefined;
    let cleaning: Promise<void> | undefined;
    const cleanup = () =>
      (cleaning ??= (async () => {
        if (sessionId) {
          await server
            .request("DELETE", `/api/session/${sessionId}`, undefined, 2_000)
            .catch(() => {});
        }
        await server.stop();
      })());
    const removeInterruptHandlers = onInterrupt(cleanup);

    try {
      await deleteStaleSessions(server, directory);
      sessionId = readSessionId(
        await server.request("POST", "/api/session", {
          // A title skips the extra model call OpenCode makes to name a session.
          title: OPENCODE_AGENT,
          agent: OPENCODE_AGENT,
          model: sessionModel,
          permissions: [{ action: "*", resource: "*", effect: "deny" }],
          location: { directory },
        }),
      );
      // Archived sessions stay out of the TUI if ai-git is killed before the delete.
      await server.request("PATCH", `/api/session/${sessionId}`, { archived: true });
      await server.request("POST", `/api/session/${sessionId}/prompt`, {
        text: prompt,
        delivery: "steer",
      });
      return await waitForReply(server, sessionId);
    } finally {
      await cleanup();
      removeInterruptHandlers();
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
