/**
 * transport-dispatch.ts — T4 transport validation (TDR-035 §4, §5, §6)
 *
 * Exports three functions for pre-flight MCP validation:
 *
 *   validateStdioMcp(config, pluginId, serverName, opts?)
 *     Spawns the stdio binary, sends MCP initialize, waits up to 10s for a
 *     valid JSON-RPC response, then kills the child (SIGTERM + 5s + SIGKILL).
 *     detached: false is REQUIRED per TDR-035 §6 — never change to true.
 *
 *   validateInProcessSdk(config, pluginId, serverName)
 *     Child-process Node load of the absolute entry path, duck-types the
 *     createServer() export against MCP SDK server shape.
 *
 *   bustInProcessServerCache(absPath)
 *     Compatibility no-op; validation no longer populates app-process require.cache.
 *
 * Pre-flight model (Option A): validation only, no long-lived children.
 * The SDK / Codex / other adapters spawn their own children at request time.
 *
 * TDR-032 discipline: no static imports from @/lib/chat/* or @/lib/agents/claude-agent.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { getAinativeLogsDir } from "@/lib/utils/ainative-paths";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of NormalizedMcpConfig fields needed by the validators. */
export interface TransportConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: "ainative-sdk";
  entry?: string; // resolved absolute path
}

export type StdioValidationResult =
  | { ok: true }
  | { ok: false; reason: "stdio_init_timeout" | "stdio_init_malformed"; detail?: string };

export type SdkValidationResult =
  | { ok: true }
  | { ok: false; reason: "sdk_invalid_export"; detail?: string };

const SDK_VALIDATION_SCRIPT = `
const { createRequire } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function json(result) {
  process.stdout.write(JSON.stringify(result) + "\\n");
}

function resolveCreateServer(mod) {
  if (mod && typeof mod === "object" && typeof mod.createServer === "function") {
    return mod.createServer;
  }
  const def = mod && typeof mod === "object" ? mod.default : undefined;
  if (def && typeof def === "object" && typeof def.createServer === "function") {
    return def.createServer;
  }
  return undefined;
}

(async () => {
  const absPath = process.argv[1];
  const ext = path.extname(absPath);
  const mod = ext === ".mjs"
    ? await import(pathToFileURL(absPath).href)
    : createRequire(process.cwd() + "/package.json")(absPath);

  const createServer = resolveCreateServer(mod);
  if (typeof createServer !== "function") {
    json({ ok: false, reason: "sdk_invalid_export", detail: "module does not export createServer (named or default.createServer)" });
    return;
  }

  let serverInstance;
  try {
    serverInstance = await createServer();
  } catch (err) {
    json({ ok: false, reason: "sdk_invalid_export", detail: "createServer() threw: " + (err instanceof Error ? err.message : String(err)) });
    return;
  }

  if (serverInstance === null || typeof serverInstance !== "object") {
    json({ ok: false, reason: "sdk_invalid_export", detail: "createServer() returned " + typeof serverInstance + ", expected MCP server object" });
    return;
  }

  const hasMcpShape =
    typeof serverInstance.setRequestHandler === "function" ||
    typeof serverInstance.connect === "function" ||
    "onRequest" in serverInstance;

  if (!hasMcpShape) {
    json({ ok: false, reason: "sdk_invalid_export", detail: "createServer() return value missing setRequestHandler, connect, or onRequest" });
    return;
  }

  json({ ok: true });
})().catch((err) => {
  json({ ok: false, reason: "sdk_invalid_export", detail: "import error: " + (err instanceof Error ? err.message : String(err)) });
});
`;

// ---------------------------------------------------------------------------
// Logging helper (same pattern as mcp-loader.ts — extracted on 3rd use)
// ---------------------------------------------------------------------------

function logToFile(line: string): void {
  try {
    const logsDir = getAinativeLogsDir();
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(
      path.join(logsDir, "plugins.log"),
      `${new Date().toISOString()} ${line}\n`
    );
  } catch {
    /* swallow log errors — never let logging break dispatch */
  }
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC constants
// ---------------------------------------------------------------------------

const MCP_INITIALIZE_REQUEST = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "ainative-plugin-validator",
      version: "0.1.0",
    },
  },
});

const MCP_INITIALIZED_NOTIFICATION = JSON.stringify({
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {},
});

// ---------------------------------------------------------------------------
// Stdio transport validator
// ---------------------------------------------------------------------------

/**
 * Validates a stdio MCP server by:
 * 1. Spawning with detached: false (TDR-035 §6 — invariant, never change).
 * 2. Sending MCP initialize request over stdin.
 * 3. Waiting up to timeoutMs (default 10000) for a valid JSON-RPC response.
 * 4. Killing the child after validation (SIGTERM + 5s SIGKILL fallback).
 *
 * stderr lines during the validation window are streamed to plugins.log.
 */
export async function validateStdioMcp(
  config: TransportConfig,
  pluginId: string,
  serverName: string,
  opts?: { timeoutMs?: number }
): Promise<StdioValidationResult> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const logPrefix = `[plugin ${pluginId}/${serverName}]`;

  if (!config.command) {
    return {
      ok: false,
      reason: "stdio_init_malformed",
      detail: "no command in config",
    };
  }

  const cmd = config.command;
  const args = config.args ?? [];
  // TODO(T14 confinement): strip sensitive env vars (ANTHROPIC_API_KEY, OAuth
  // tokens, AINATIVE_DATA_DIR) unless the plugin's declared env references
  // them via ${VAR} templates. M3 pre-flight validation passes full env;
  // confinement task will narrow.
  const env: NodeJS.ProcessEnv = config.env
    ? { ...process.env, ...config.env }
    : { ...process.env };

  return new Promise<StdioValidationResult>((resolve) => {
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    function settle(result: StdioValidationResult): void {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      killChild(child, logPrefix, result, resolve);
    }

    // Spawn — detached: false is required. Do NOT change to true.
    const child = spawn(cmd, args, {
      detached: false,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    // Stream stderr to plugins.log with prefix per spec.
    const stderrRl = readline.createInterface({ input: child.stderr! });
    stderrRl.on("line", (line: string) => {
      logToFile(`${logPrefix} stderr: ${line}`);
    });

    // Parse stdout as newline-delimited JSON-RPC.
    const stdoutRl = readline.createInterface({ input: child.stdout! });
    stdoutRl.on("line", (line: string) => {
      if (settled) return;
      if (!line.trim()) return;

      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        // Non-JSON line — wait for a proper response.
        return;
      }

      // Validate response shape.
      if (
        msg !== null &&
        typeof msg === "object" &&
        "id" in msg &&
        (msg as Record<string, unknown>)["id"] === 1 &&
        "result" in msg &&
        typeof (msg as Record<string, unknown>)["result"] === "object"
      ) {
        // Valid response — send initialized notification as courtesy.
        try {
          child.stdin!.write(MCP_INITIALIZED_NOTIFICATION + "\n");
          child.stdin!.end();
        } catch {
          /* best-effort — child may have closed stdin */
        }
        settle({ ok: true });
      } else if (
        msg !== null &&
        typeof msg === "object" &&
        "id" in msg &&
        (msg as Record<string, unknown>)["id"] === 1
      ) {
        // Response with matching id but wrong shape.
        settle({
          ok: false,
          reason: "stdio_init_malformed",
          detail: `unexpected response shape: ${JSON.stringify(msg)}`,
        });
      }
      // Other messages (notifications etc.) — keep waiting.
    });

    // Child crash before response.
    child.on("exit", (code: number | null) => {
      if (!settled) {
        settle({
          ok: false,
          reason: "stdio_init_malformed",
          detail: `child exited early with code ${code}`,
        });
      }
    });

    child.on("error", (err: Error) => {
      if (!settled) {
        settle({
          ok: false,
          reason: "stdio_init_malformed",
          detail: `spawn error: ${err.message}`,
        });
      }
    });

    // Send initialize request.
    try {
      child.stdin!.write(MCP_INITIALIZE_REQUEST + "\n");
    } catch (err) {
      settle({
        ok: false,
        reason: "stdio_init_malformed",
        detail: `failed to write initialize: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // Timeout.
    killTimer = setTimeout(() => {
      settle({ ok: false, reason: "stdio_init_timeout" });
    }, timeoutMs);
  });
}

/**
 * Kill a child after validation.
 *
 * Timeout case (`stdio_init_timeout`): direct SIGKILL per TDR-035 §5 —
 * the child is already unresponsive, so SIGTERM would waste 5s on a
 * handshake it never answered.
 *
 * All other cases (success, malformed, crash): graceful SIGTERM with
 * 5s SIGKILL fallback so a well-behaved server can flush logs.
 *
 * Fire-and-collect: caller's promise resolves immediately; kill proceeds
 * asynchronously.
 */
function killChild(
  child: ReturnType<typeof spawn>,
  logPrefix: string,
  result: StdioValidationResult,
  resolve: (r: StdioValidationResult) => void
): void {
  resolve(result);

  const forceKill = result.ok === false && result.reason === "stdio_init_timeout";

  if (forceKill) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already dead */
    }
    return;
  }

  let sigkillTimer: ReturnType<typeof setTimeout> | null = null;

  function onExit(): void {
    if (sigkillTimer) clearTimeout(sigkillTimer);
  }

  child.once("exit", onExit);
  child.once("close", onExit);

  try {
    child.kill("SIGTERM");
  } catch {
    /* already dead */
    return;
  }

  sigkillTimer = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already dead */
    }
    logToFile(`${logPrefix} SIGKILL sent after SIGTERM timeout`);
  }, 5_000);
}

// ---------------------------------------------------------------------------
// In-process SDK transport validator
// ---------------------------------------------------------------------------

/**
 * Validates an ainative-sdk module by:
 * 1. Spawning a short-lived Node child that imports/requires the absolute entry path.
 * 2. Resolving createServer from named or default export.
 * 3. Calling createServer() and duck-typing the return value.
 *
 * Duck-type: return value must have setRequestHandler, connect, or onRequest.
 */
export async function validateInProcessSdk(
  config: TransportConfig,
  pluginId: string,
  serverName: string
): Promise<SdkValidationResult> {
  const logPrefix = `[plugin ${pluginId}/${serverName}]`;

  if (!config.entry) {
    return {
      ok: false,
      reason: "sdk_invalid_export",
      detail: "no entry in config",
    };
  }

  const absPath = config.entry;

  if (!path.isAbsolute(absPath)) {
    return {
      ok: false,
      reason: "sdk_invalid_export",
      detail: `entry must be absolute path, got: ${absPath}`,
    };
  }

  // Validate extension — .ts is not supported (must be pre-built).
  const ext = path.extname(absPath);
  if (ext === ".ts") {
    return {
      ok: false,
      reason: "sdk_invalid_export",
      detail: "TypeScript entry files (.ts) are not supported — plugin must be pre-built to .js/.mjs",
    };
  }

  return validateSdkEntryInChild(absPath, logPrefix);
}

function validateSdkEntryInChild(
  absPath: string,
  logPrefix: string,
  opts?: { timeoutMs?: number }
): Promise<SdkValidationResult> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;

  return new Promise<SdkValidationResult>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const child = spawn(process.execPath, ["-e", SDK_VALIDATION_SCRIPT, absPath], {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* already dead */
      }
      resolve({
        ok: false,
        reason: "sdk_invalid_export",
        detail: `validation timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        reason: "sdk_invalid_export",
        detail: `spawn error: ${err.message}`,
      });
    });

    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (stderr.trim()) {
        logToFile(`${logPrefix} sdk validator stderr: ${stderr.trim()}`);
      }

      const line = stdout.trim().split(/\r?\n/).at(-1);
      if (!line) {
        resolve({
          ok: false,
          reason: "sdk_invalid_export",
          detail: "validator produced no result",
        });
        return;
      }

      try {
        const parsed = JSON.parse(line) as SdkValidationResult;
        if (
          parsed.ok === true ||
          (parsed.ok === false && parsed.reason === "sdk_invalid_export")
        ) {
          resolve(parsed);
          return;
        }
      } catch {
        // handled below
      }

      resolve({
        ok: false,
        reason: "sdk_invalid_export",
        detail: `validator produced malformed result: ${line}`,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// require.cache bust helper (T15 reload hook)
// ---------------------------------------------------------------------------

/**
 * Compatibility hook for old in-process SDK cache busting.
 *
 * SDK validation now happens in a short-lived Node child process, so this
 * module no longer imports user plugin entries into the app process and has no
 * require.cache entry to clear. Keep the exported function so reload/revoke
 * callers remain source-compatible.
 *
 * Called by T15 reload/revoke paths as best-effort compatibility.
 */
export function bustInProcessServerCache(absPath: string): void {
  void absPath;
}
