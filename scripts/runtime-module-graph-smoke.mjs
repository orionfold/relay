#!/usr/bin/env node

// Default: use the credential-free deterministic Ollama fixture.
// G-057 diagnostic mode: set RELAY_RUNTIME_SMOKE_OLLAMA_BASE_URL and optionally
// RELAY_RUNTIME_SMOKE_OLLAMA_MODEL to exercise a configured endpoint. Receipts
// classify rather than print the URL and never print generated response text.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = mkdtempSync(join(tmpdir(), "relay-runtime-graph-"));
const dataDir = join(fixtureRoot, "data");
const homeDir = join(fixtureRoot, "home");
const appDataDir = join(homeDir, "AppData", "Roaming");
const localAppDataDir = join(homeDir, "AppData", "Local");
const xdgConfigDir = join(homeDir, ".config");
const xdgCacheDir = join(homeDir, ".cache");
const projectRoot = join(
  repoRoot,
  `.runtime-smoke-project-${process.pid}-${randomUUID().slice(0, 8)}`
);
const nextBin = join(repoRoot, "node_modules/next/dist/bin/next");
const configuredOllamaBaseUrl =
  process.env.RELAY_RUNTIME_SMOKE_OLLAMA_BASE_URL?.trim().replace(/\/+$/, "") ||
  null;
const configuredOllamaModel =
  process.env.RELAY_RUNTIME_SMOKE_OLLAMA_MODEL?.trim() || null;
const serverLog = [];
let nextProcess = null;
let ollamaTarget = null;

class RuntimeGraphSmokeError extends Error {
  constructor(message) {
    super(message);
    this.name = "RuntimeGraphSmokeError";
  }
}

function appendLog(chunk) {
  const text = chunk.toString();
  serverLog.push(text);
  if (serverLog.length > 400) serverLog.shift();
}

function credentialFreeEnvironment() {
  const environment = {};
  const allowedKeys = [
    "PATH",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "SystemRoot",
    "WINDIR",
    "ComSpec",
    "PATHEXT",
  ];
  for (const key of allowedKeys) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

function logTail() {
  return serverLog.join("").split("\n").slice(-80).join("\n");
}

async function reservePort() {
  const server = createNetServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose()))
  );
  if (!port) throw new RuntimeGraphSmokeError("Could not reserve a Next port");
  return port;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function startFakeOllama() {
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/api/tags") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ models: [{ name: "relay-smoke" }] }));
        return;
      }
      if (request.method === "POST" && request.url === "/api/chat") {
        const body = JSON.parse(await readBody(request));
        const prompt = JSON.stringify(body.messages ?? []);
        const content = prompt.includes("WORKFLOW_SMOKE_REQUEST")
          ? "WORKFLOW_RUNTIME_GRAPH_OK"
          : prompt.includes("TASK_SMOKE_REQUEST")
            ? "TASK_RUNTIME_GRAPH_OK"
            : prompt.includes("CHAT_SMOKE_REQUEST")
              ? "CHAT_RUNTIME_GRAPH_OK"
              : "UNEXPECTED_SMOKE_PROMPT";
        response.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        });
        response.end(
          `${JSON.stringify({
            message: { content },
            done: true,
            prompt_eval_count: 8,
            eval_count: 4,
          })}\n`
        );
        return;
      }
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("not found");
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (typeof address !== "object" || !address) {
    throw new RuntimeGraphSmokeError("Fake Ollama did not expose a TCP port");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    modelId: "relay-smoke",
    transport: "deterministic-fixture",
  };
}

async function inspectConfiguredOllama(baseUrl) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new RuntimeGraphSmokeError(
      `Configured Ollama model discovery failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (!response.ok) {
    throw new RuntimeGraphSmokeError(
      `Configured Ollama model discovery returned ${response.status}`
    );
  }
  const payload = await response.json();
  const modelIds = Array.isArray(payload.models)
    ? payload.models
        .map((model) => model?.name ?? model?.model)
        .filter((model) => typeof model === "string" && model.length > 0)
    : [];
  const modelId = configuredOllamaModel ?? modelIds[0] ?? null;
  if (!modelId) {
    throw new RuntimeGraphSmokeError(
      "Configured Ollama has no pulled model; set RELAY_RUNTIME_SMOKE_OLLAMA_MODEL after pulling one"
    );
  }
  if (configuredOllamaModel && !modelIds.includes(configuredOllamaModel)) {
    throw new RuntimeGraphSmokeError(
      `Configured Ollama does not report requested model ${configuredOllamaModel}`
    );
  }
  return {
    server: null,
    baseUrl,
    modelId,
    transport: "configured-external",
  };
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new RuntimeGraphSmokeError(
      `${options.method ?? "GET"} ${path} returned ${response.status}: ${text.slice(0, 1000)}`
    );
  }
  return body;
}

async function poll(label, read, { timeoutMs = 45_000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (nextProcess?.exitCode != null) {
      throw new RuntimeGraphSmokeError(
        `Next exited ${nextProcess.exitCode} while waiting for ${label}\n${logTail()}`
      );
    }
    try {
      const value = await read();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  throw new RuntimeGraphSmokeError(
    `Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}\n${logTail()}`
  );
}

async function stopNext() {
  if (!nextProcess || nextProcess.exitCode != null) return;
  nextProcess.kill("SIGTERM");
  const exited = await Promise.race([
    once(nextProcess, "exit").then(() => true),
    new Promise((resolveWait) => setTimeout(() => resolveWait(false), 5_000)),
  ]);
  if (!exited && nextProcess.exitCode == null) {
    nextProcess.kill("SIGKILL");
    await once(nextProcess, "exit");
  }
}

function assert(condition, message) {
  if (!condition) throw new RuntimeGraphSmokeError(message);
}

try {
  mkdirSync(dataDir);
  mkdirSync(appDataDir, { recursive: true });
  mkdirSync(localAppDataDir, { recursive: true });
  mkdirSync(xdgConfigDir, { recursive: true });
  mkdirSync(xdgCacheDir, { recursive: true });
  mkdirSync(projectRoot);
  cpSync(join(repoRoot, "src"), join(projectRoot, "src"), { recursive: true });
  for (const file of [
    "next.config.mjs",
    "package.json",
    "tsconfig.json",
    "next-env.d.ts",
  ]) {
    copyFileSync(join(repoRoot, file), join(projectRoot, file));
  }
  symlinkSync(
    join(repoRoot, "node_modules"),
    join(projectRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );
  ollamaTarget = configuredOllamaBaseUrl
    ? await inspectConfiguredOllama(configuredOllamaBaseUrl)
    : await startFakeOllama();
  const strictSentinels = ollamaTarget.transport === "deterministic-fixture";
  const nextPort = await reservePort();
  const relayBaseUrl = `http://127.0.0.1:${nextPort}`;
  nextProcess = spawn(
    process.execPath,
    [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(nextPort)],
    {
      cwd: projectRoot,
      env: {
        ...credentialFreeEnvironment(),
        HOME: homeDir,
        USERPROFILE: homeDir,
        APPDATA: appDataDir,
        LOCALAPPDATA: localAppDataDir,
        XDG_CONFIG_HOME: xdgConfigDir,
        XDG_CACHE_HOME: xdgCacheDir,
        NEXT_TELEMETRY_DISABLED: "1",
        RELAY_DATA_DIR: dataDir,
        RELAY_DEV_MODE: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  nextProcess.stdout.on("data", appendLog);
  nextProcess.stderr.on("data", appendLog);

  await poll("runtime catalog first request", async () => {
    const response = await fetch(`${relayBaseUrl}/api/chat/models`);
    return response.ok ? true : null;
  }, { timeoutMs: 60_000, intervalMs: 250 });

  await requestJson(relayBaseUrl, "/api/settings/ollama", {
    method: "POST",
    body: JSON.stringify({
      baseUrl: ollamaTarget.baseUrl,
      defaultModel: ollamaTarget.modelId,
    }),
  });

  const task = await requestJson(relayBaseUrl, "/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "G-066 runtime module graph",
      description: "TASK_SMOKE_REQUEST",
      priority: 2,
      assignedAgent: "ollama",
    }),
  });
  await requestJson(relayBaseUrl, `/api/tasks/${task.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "queued" }),
  });
  await requestJson(relayBaseUrl, `/api/tasks/${task.id}/execute`, {
    method: "POST",
  });
  const completedTask = await poll("synthetic task completion", async () => {
    const current = await requestJson(relayBaseUrl, `/api/tasks/${task.id}`);
    if (current.status === "failed") {
      throw new RuntimeGraphSmokeError(`Synthetic task failed: ${current.result}`);
    }
    return current.status === "completed" ? current : null;
  });
  assert(completedTask.assignedAgent === "ollama", "Task requested runtime drifted");
  assert(completedTask.effectiveRuntimeId === "ollama", "Task effective runtime drifted");
  assert(completedTask.runtimeFallbackReason == null, "Task unexpectedly fell back");
  assert(
    strictSentinels
      ? completedTask.result === "TASK_RUNTIME_GRAPH_OK"
      : typeof completedTask.result === "string" && completedTask.result.length > 0,
    strictSentinels ? "Task sentinel mismatch" : "Configured Ollama task result was empty"
  );

  const workflow = await requestJson(relayBaseUrl, "/api/workflows", {
    method: "POST",
    body: JSON.stringify({
      name: "G-066 workflow module graph",
      definition: {
        pattern: "sequence",
        steps: [
          {
            id: "smoke-step",
            name: "Runtime graph step",
            prompt: "WORKFLOW_SMOKE_REQUEST",
            runtimeId: "ollama",
          },
        ],
      },
    }),
  });
  await requestJson(relayBaseUrl, `/api/workflows/${workflow.id}/execute`, {
    method: "POST",
  });
  const completedWorkflow = await poll("synthetic workflow completion", async () => {
    const workflows = await requestJson(relayBaseUrl, "/api/workflows");
    const current = workflows.find((candidate) => candidate.id === workflow.id);
    if (current?.status === "failed") {
      throw new RuntimeGraphSmokeError("Synthetic workflow reached failed state");
    }
    return current?.status === "completed" ? current : null;
  });
  assert(completedWorkflow.status === "completed", "Workflow did not complete");

  const conversation = await requestJson(relayBaseUrl, "/api/chat/conversations", {
    method: "POST",
    body: JSON.stringify({
      title: "G-066 Chat module graph",
      runtimeId: "ollama",
      modelId: `ollama:${ollamaTarget.modelId}`,
    }),
  });
  const chatResponse = await fetch(
    `${relayBaseUrl}/api/chat/conversations/${conversation.id}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "CHAT_SMOKE_REQUEST" }),
    }
  );
  assert(chatResponse.ok, `Chat SSE returned ${chatResponse.status}`);
  const sseText = await chatResponse.text();
  const chatEvents = sseText
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  const chatEventSummary = chatEvents.map((event) => ({
    type: event.type,
    phase: typeof event.phase === "string" ? event.phase : undefined,
    contentLength:
      typeof event.content === "string" ? event.content.length : undefined,
    message:
      event.type === "error" && typeof event.message === "string"
        ? event.message.slice(0, 300)
        : undefined,
  }));
  assert(
    chatEvents.some((event) =>
      strictSentinels
        ? event.type === "delta" && event.content === "CHAT_RUNTIME_GRAPH_OK"
        : event.type === "delta" && typeof event.content === "string" && event.content.length > 0
    ),
    strictSentinels
      ? `Chat SSE sentinel missing: ${sseText}`
      : `Configured Ollama Chat SSE had no content delta: ${JSON.stringify(chatEventSummary)}`
  );
  assert(chatEvents.some((event) => event.type === "done"), "Chat SSE done missing");

  const messages = await requestJson(
    relayBaseUrl,
    `/api/chat/conversations/${conversation.id}/messages`
  );
  const assistant = messages.find((message) => message.role === "assistant");
  assert(assistant?.status === "complete", "Chat assistant row was not finalized");
  assert(
    strictSentinels
      ? assistant?.content === "CHAT_RUNTIME_GRAPH_OK"
      : typeof assistant?.content === "string" && assistant.content.length > 0,
    strictSentinels ? "Chat durable sentinel mismatch" : "Configured Ollama durable Chat result was empty"
  );
  const diagnostics = await requestJson(
    relayBaseUrl,
    "/api/diagnostics/chat-streams?windowMinutes=10"
  );
  assert(
    diagnostics.recent.some(
      (event) =>
        event.conversationId === conversation.id && event.reason === "stream.completed"
    ),
    "Chat completion telemetry missing from diagnostics"
  );

  const sqlite = new Database(join(dataDir, "relay.db"), { readonly: true });
  const taskLogs = sqlite
    .prepare("SELECT event FROM agent_logs WHERE task_id = ? ORDER BY timestamp")
    .all(task.id)
    .map((row) => row.event);
  const workflowTask = sqlite
    .prepare(
      "SELECT id, status, result, assigned_agent, effective_runtime_id FROM tasks WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(workflow.id);
  sqlite.close();
  assert(taskLogs.includes("started"), "Task start log missing");
  assert(taskLogs.includes("completed"), "Task completion log missing");
  assert(workflowTask?.status === "completed", "Workflow child task did not complete");
  assert(
    workflowTask?.effective_runtime_id === "ollama",
    "Workflow child effective runtime drifted"
  );
  assert(
    strictSentinels
      ? workflowTask?.result === "WORKFLOW_RUNTIME_GRAPH_OK"
      : typeof workflowTask?.result === "string" && workflowTask.result.length > 0,
    strictSentinels ? "Workflow child sentinel mismatch" : "Configured Ollama workflow result was empty"
  );

  const logs = serverLog.join("");
  assert(
    !/Cannot access ['"]?claudeRuntimeAdapter['"]? before initialization/.test(logs),
    `Runtime registry initialization cycle detected\n${logTail()}`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        taskId: task.id,
        taskLogs,
        ollamaTransport: ollamaTarget.transport,
        ollamaModel: ollamaTarget.modelId,
        ollamaEndpointClass: /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(
          ollamaTarget.baseUrl
        )
          ? "loopback"
          : "non-loopback",
        requestedRuntimeId: completedTask.assignedAgent,
        effectiveRuntimeId: completedTask.effectiveRuntimeId,
        workflowId: workflow.id,
        workflowTaskId: workflowTask.id,
        conversationId: conversation.id,
        chatTermination: "stream.completed",
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  console.error(logTail());
  process.exitCode = 1;
} finally {
  await stopNext();
  if (ollamaTarget?.server) {
    await new Promise((resolveClose) => ollamaTarget.server.close(resolveClose));
  }
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(fixtureRoot, { recursive: true, force: true });
}
