import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import net from "node:net";
import { resolveCodexExecutable } from "@/lib/utils/provider-cli-discovery";

type JsonRpcId = number;

interface JsonRpcRequest {
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  id: JsonRpcId;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface CodexAppServerClientOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
}

export class CodexExecutableNotFoundError extends Error {
  override name = "CodexExecutableNotFoundError";

  constructor() {
    super(
      "Relay could not find a working Codex executable. Repair or install the Codex CLI/app, then try again.",
    );
  }
}

export class CodexAppServerClient {
  private readonly child: ChildProcessByStdio<null, Readable, Readable>;
  private readonly socket: WebSocket;
  private readonly pending = new Map<
    JsonRpcId,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private nextId = 1;
  private closed = false;

  onNotification?: (notification: JsonRpcNotification) => void;
  onRequest?: (request: JsonRpcRequest) => void;
  onProcessError?: (error: Error) => void;

  private constructor(
    child: ChildProcessByStdio<null, Readable, Readable>,
    socket: WebSocket
  ) {
    this.child = child;
    this.socket = socket;
    this.bindEvents();
  }

  static async connect(
    options: CodexAppServerClientOptions = {}
  ): Promise<CodexAppServerClient> {
    // Sync plugin MCP servers into ~/.codex/config.toml before spawning so
    // the new Codex session picks up the current plugin set (TDR-035 §1 Codex row).
    // Dynamic import is required per TDR-032 (avoids module-load cycles).
    try {
      const { syncPluginMcpToCodex } = await import(
        "@/lib/environment/sync/mcp-sync"
      );
      await syncPluginMcpToCodex();
    } catch (err) {
      // Non-fatal: plugin sync failure must not block Codex from starting.
      // Log to plugins.log so operators can discover sync issues.
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const { getAinativeLogsDir } = await import("@/lib/utils/ainative-paths");
        const dir = getAinativeLogsDir();
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(
          path.join(dir, "plugins.log"),
          `${new Date().toISOString()} codex-sync-failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
      } catch { /* logging best-effort */ }
    }

    const port = await reservePort();
    const listenUrl = `ws://127.0.0.1:${port}`;
    const executable = await resolveCodexExecutable();
    if (!executable) throw new CodexExecutableNotFoundError();
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [key, value] of Object.entries(options.env ?? {})) {
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }

    const child = spawn(
      executable,
      ["app-server", "--listen", listenUrl],
      {
        cwd: options.cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const socket = await connectWebSocket(listenUrl, child);
    return new CodexAppServerClient(child, socket);
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;

    const payload: JsonRpcRequest = { id, method, params };
    this.socket.send(JSON.stringify(payload));

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
  }

  respond(id: JsonRpcId, result: unknown): void {
    if (this.closed) return;
    this.socket.send(JSON.stringify({ id, result }));
  }

  reject(id: JsonRpcId, message: string): void {
    if (this.closed) return;
    this.socket.send(
      JSON.stringify({
        id,
        error: { message },
      })
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    try {
      this.socket.close();
    } catch {
      // Ignore close races.
    }

    this.child.kill("SIGTERM");
    await waitForProcessExit(this.child, 1000).catch(() => {
      this.child.kill("SIGKILL");
    });
  }

  private bindEvents(): void {
    this.socket.addEventListener("message", (event) => {
      const raw =
        typeof event.data === "string"
          ? event.data
          : Buffer.from(event.data as ArrayBuffer).toString("utf8");
      this.handleMessage(raw);
    });

    this.socket.addEventListener("error", () => {
      this.rejectAllPending(new Error("Codex app server socket error"));
    });

    this.socket.addEventListener("close", () => {
      if (!this.closed) {
        this.rejectAllPending(new Error("Codex app server socket closed"));
      }
    });

    const handleProcessFailure = (error: Error) => {
      if (this.closed) return;
      this.onProcessError?.(error);
      this.rejectAllPending(error);
    };

    this.child.once("error", handleProcessFailure);
    this.child.once("exit", (code, signal) => {
      if (this.closed) return;
      handleProcessFailure(
        new Error(
          `Codex app server exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`
        )
      );
    });
  }

  private handleMessage(raw: string): void {
    let message: JsonRpcMessage;

    try {
      message = JSON.parse(raw) as JsonRpcMessage;
    } catch {
      return;
    }

    if ("id" in message && ("result" in message || "error" in message) && !("method" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(
          new Error(message.error.message || "Codex app server request failed")
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (
      "id" in message &&
      "method" in message &&
      typeof message.method === "string"
    ) {
      this.onRequest?.(message as JsonRpcRequest);
      return;
    }

    if ("method" in message && typeof message.method === "string") {
      this.onNotification?.(message as JsonRpcNotification);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

async function reservePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to reserve loopback port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function connectWebSocket(
  url: string,
  child: ChildProcessByStdio<null, Readable, Readable>
): Promise<WebSocket> {
  const deadline = Date.now() + 10_000;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Codex app server exited before accepting connections (code=${child.exitCode})`);
    }

    try {
      const socket = await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        const onOpen = () => {
          cleanup();
          resolve(ws);
        };
        const onError = () => {
          cleanup();
          ws.close();
          reject(new Error("Codex app server websocket connection failed"));
        };
        const cleanup = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("error", onError);
        };

        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onError);
      });

      return socket;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw lastError ?? new Error("Timed out connecting to Codex app server");
}

async function waitForProcessExit(
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs: number
): Promise<void> {
  if (child.exitCode !== null) return;

  await Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for Codex app server to exit")), timeoutMs);
    }),
  ]);
}
