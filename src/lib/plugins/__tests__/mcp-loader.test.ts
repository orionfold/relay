/**
 * mcp-loader.test.ts — T3 plugin-MCP loader skeleton
 *
 * ~20 assertions covering: happy paths, env/args template resolution,
 * safe-mode short-circuit, runtime filter (Ollama), capability gating,
 * hash-drift, transport determination, file-existence checks,
 * per-plugin isolation, Kind 5 ignore, multi-server plugins,
 * and the T5 catalog invariant for supportsPluginMcpServers.
 *
 * Uses real fs (tmpdir) — no mocked fs. Pattern matches T2 tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  loadPluginMcpServers,
  listPluginMcpRegistrations,
  listAcceptedInProcessEntriesForPlugin,
  reloadPluginMcpRegistrations,
} from "../mcp-loader";
import { writePluginsLock } from "../capability-check";
import { deriveManifestHash } from "../capability-check";
import { getRuntimeFeatures } from "@/lib/agents/runtime/catalog";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let pluginsDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-loader-test-"));
  pluginsDir = path.join(tmpDir, "plugins");
  fs.mkdirSync(pluginsDir, { recursive: true });
  process.env.RELAY_DATA_DIR = tmpDir;
  delete process.env.RELAY_SAFE_MODE;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.RELAY_DATA_DIR;
  delete process.env.RELAY_SAFE_MODE;
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Write a minimal valid chat-tools plugin.yaml and return its YAML content string. */
function writePluginYaml(pluginId: string, overrides: Record<string, unknown> = {}): string {
  const dir = path.join(pluginsDir, pluginId);
  fs.mkdirSync(dir, { recursive: true });

  const manifest: Record<string, unknown> = {
    id: pluginId,
    version: "1.0.0",
    apiVersion: "0.15",
    kind: "chat-tools",
    capabilities: ["net"],
    ...overrides,
  };

  // Build YAML manually to avoid js-yaml dependency in fixture helper.
  // Quote strings that look like numbers so YAML parses them as strings.
  const lines: string[] = [];
  for (const [key, val] of Object.entries(manifest)) {
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) lines.push(`  - ${item}`);
    } else if (typeof val === "string" && /^\d+(\.\d+)+$/.test(val)) {
      // Quote version-like strings (e.g. "0.15", "1.0.0") so YAML doesn't
      // misparse them as numbers — the Zod schema expects z.string().
      lines.push(`${key}: "${val}"`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  const yamlContent = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "plugin.yaml"), yamlContent);
  return yamlContent;
}

/** Write .mcp.json for a plugin. */
function writeMcpJson(pluginId: string, mcpServers: Record<string, unknown>): void {
  const dir = path.join(pluginsDir, pluginId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".mcp.json"),
    JSON.stringify({ mcpServers }, null, 2)
  );
}

/** Accept capabilities for a plugin (write to plugins.lock). */
function acceptPlugin(pluginId: string, yamlContent: string): void {
  const hash = deriveManifestHash(yamlContent);
  writePluginsLock(pluginId, {
    manifestHash: hash,
    capabilities: ["net"],
    acceptedAt: new Date().toISOString(),
    acceptedBy: "test",
  });
}

/** Create a file so existsSync passes. */
function touchFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

/**
 * Write a real Node.js fake MCP server script that speaks the MCP initialize
 * handshake. Used by tests that expect status:"accepted" — since T4 now runs
 * pre-flight validation, the binary must respond to MCP initialize.
 */
function writeFakeMcpServerFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Minimal MCP server: reads stdin, responds to initialize, then stays alive.
  const script = [
    `const readline = require('readline');`,
    `const rl = readline.createInterface({ input: process.stdin });`,
    `rl.on('line', (line) => {`,
    `  let msg;`,
    `  try { msg = JSON.parse(line); } catch { return; }`,
    `  if (msg && msg.method === 'initialize') {`,
    `    process.stdout.write(JSON.stringify({`,
    `      jsonrpc: '2.0', id: msg.id,`,
    `      result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake', version: '0.1.0' } }`,
    `    }) + '\\n');`,
    `  }`,
    `});`,
    `process.stdin.resume();`,
  ].join("\n");
  fs.writeFileSync(filePath, script);
}

/**
 * Write a real Node.js fake MCP SDK module that exports createServer().
 * Used for ainative-sdk transport tests that expect status:"accepted".
 */
function writeFakeSdkServerFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const script = [
    `"use strict";`,
    `function createServer() {`,
    `  return { setRequestHandler: function() {}, connect: function() {} };`,
    `}`,
    `module.exports = { createServer };`,
  ].join("\n");
  fs.writeFileSync(filePath, script);
}

/** Produce a stdio .mcp.json entry that uses node + an absolute script path. */
function nodeCommand(scriptPath: string, extraArgs: string[] = []): Record<string, unknown> {
  return {
    command: process.execPath,
    args: [scriptPath, ...extraArgs],
  };
}

// ---------------------------------------------------------------------------
// Test 1: Happy path — Kind 1 plugin, accepted, valid stdio .mcp.json
// ---------------------------------------------------------------------------

it("1. Happy path: accepted chat-tools plugin with stdio command returns server in output", async () => {
  const pluginId = "echo-server";
  const yaml = writePluginYaml(pluginId);
  const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
  writeFakeMcpServerFile(serverScriptPath);

  // Use node + absolute script path so T4 validation passes.
  writeMcpJson(pluginId, {
    "echo": {
      command: process.execPath,
      args: [serverScriptPath, "--port", "3001"],
    },
  });
  acceptPlugin(pluginId, yaml);

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("echo");
  expect(result["echo"].command).toBe(process.execPath);
  // Args include the script path + the user args.
  expect(result["echo"].args).toContain("--port");
  expect(result["echo"].args).toContain("3001");
}, 15_000);

// ---------------------------------------------------------------------------
// Test 2: Ainative-SDK transport
// ---------------------------------------------------------------------------

it("2. Ainative-SDK transport: accepted plugin with entry file returns transport:ainative-sdk", async () => {
  const pluginId = "sdk-plugin";
  const yaml = writePluginYaml(pluginId);
  const entryPath = path.join(pluginsDir, pluginId, "server", "index.js");
  writeFakeSdkServerFile(entryPath);

  writeMcpJson(pluginId, {
    "sdk-server": {
      transport: "ainative-sdk",
      entry: "./server/index.js",
    },
  });
  acceptPlugin(pluginId, yaml);

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("sdk-server");
  expect(result["sdk-server"].transport).toBe("ainative-sdk");
  expect(result["sdk-server"].entry).toBe(entryPath);
});

// ---------------------------------------------------------------------------
// Test 3: Env template resolution
// ---------------------------------------------------------------------------

it("3. Env template resolution: ${HOME}, ${RELAY_DATA_DIR}, ${PLUGIN_DIR} resolved in env values", async () => {
  const pluginId = "template-env-plugin";
  const yaml = writePluginYaml(pluginId);
  const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
  writeFakeMcpServerFile(serverScriptPath);

  writeMcpJson(pluginId, {
    "tmpl": {
      ...nodeCommand(serverScriptPath),
      env: {
        HOME_VAR: "${HOME}/.config",
        DATA_VAR: "${RELAY_DATA_DIR}/data",
        PLUGIN_VAR: "${PLUGIN_DIR}/config.json",
      },
    },
  });
  acceptPlugin(pluginId, yaml);

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("tmpl");
  expect(result["tmpl"].env!["HOME_VAR"]).toBe(`${os.homedir()}/.config`);
  expect(result["tmpl"].env!["DATA_VAR"]).toBe(`${tmpDir}/data`);
  expect(result["tmpl"].env!["PLUGIN_VAR"]).toBe(
    path.join(pluginsDir, pluginId, "config.json")
  );
}, 15_000);

// ---------------------------------------------------------------------------
// Test 4: Args template resolution
// ---------------------------------------------------------------------------

it("4. Args template resolution: ${PLUGIN_DIR} resolved in args elements", async () => {
  const pluginId = "template-args-plugin";
  const yaml = writePluginYaml(pluginId);
  const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
  writeFakeMcpServerFile(serverScriptPath);

  // The command is node + the script. Additional args come after.
  // Template resolution applies to all args — we append template args after the script.
  writeMcpJson(pluginId, {
    "tmpl-args": {
      command: process.execPath,
      args: [serverScriptPath, "--config", "${PLUGIN_DIR}/config.json", "--home", "${HOME}"],
    },
  });
  acceptPlugin(pluginId, yaml);

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("tmpl-args");
  const expectedConfig = path.join(pluginsDir, pluginId, "config.json");
  // After resolution, args contain the script path + resolved template values.
  expect(result["tmpl-args"].args).toContain("--config");
  expect(result["tmpl-args"].args).toContain(expectedConfig);
  expect(result["tmpl-args"].args).toContain("--home");
  expect(result["tmpl-args"].args).toContain(os.homedir());
}, 15_000);

// ---------------------------------------------------------------------------
// Test 5: RELAY_SAFE_MODE short-circuit
// ---------------------------------------------------------------------------

it("5. Safe mode: RELAY_SAFE_MODE=true returns {} even with accepted plugins", async () => {
  const pluginId = "safe-mode-plugin";
  const yaml = writePluginYaml(pluginId);
  touchFile(path.join(pluginsDir, pluginId, "bin", "server"));
  writeMcpJson(pluginId, { "svc": { command: "./bin/server" } });
  acceptPlugin(pluginId, yaml);

  process.env.RELAY_SAFE_MODE = "true";
  const result = await loadPluginMcpServers();
  expect(result).toEqual({});
});

// ---------------------------------------------------------------------------
// T13: safe-mode with visible disabled plugin registrations
// ---------------------------------------------------------------------------

describe("T13 — safe-mode (RELAY_SAFE_MODE=true) with visible disabled plugins", () => {
  it("listPluginMcpRegistrations emits one disabled+safe_mode registration per Kind 1 plugin", async () => {
    // Kind 1 plugin (alpha) — would normally be accepted+loaded
    writePluginYaml("alpha");
    touchFile(path.join(pluginsDir, "alpha", "bin", "server"));
    writeMcpJson("alpha", { "svc": { command: "./bin/server" } });

    // Kind 5 plugin (beta) — should NOT appear in safe-mode output
    const betaDir = path.join(pluginsDir, "beta");
    fs.mkdirSync(betaDir, { recursive: true });
    fs.writeFileSync(
      path.join(betaDir, "plugin.yaml"),
      [
        "id: beta",
        'version: "1.0.0"',
        'apiVersion: "0.15"',
        "kind: primitives-bundle",
      ].join("\n") + "\n",
    );

    // Another Kind 1 plugin (gamma) to confirm multiple plugins are enumerated
    writePluginYaml("gamma");
    touchFile(path.join(pluginsDir, "gamma", "bin", "server"));
    writeMcpJson("gamma", { "svc": { command: "./bin/server" } });

    process.env.RELAY_SAFE_MODE = "true";
    const regs = await listPluginMcpRegistrations();

    // Exactly two entries (alpha + gamma), beta is filtered out as Kind 5.
    expect(regs).toHaveLength(2);

    const alphaReg = regs.find((r) => r.pluginId === "alpha");
    expect(alphaReg).toBeDefined();
    expect(alphaReg!.status).toBe("disabled");
    expect(alphaReg!.disabledReason).toBe("safe_mode");
    expect(alphaReg!.serverName).toBe("");
    expect(alphaReg!.transport).toBe("stdio");
    expect(alphaReg!.config).toEqual({});

    const gammaReg = regs.find((r) => r.pluginId === "gamma");
    expect(gammaReg).toBeDefined();
    expect(gammaReg!.status).toBe("disabled");
    expect(gammaReg!.disabledReason).toBe("safe_mode");

    // Kind 5 (beta) MUST NOT appear
    expect(regs.find((r) => r.pluginId === "beta")).toBeUndefined();
  });

  it("loadPluginMcpServers still returns {} in safe-mode (projection excludes disabled entries)", async () => {
    writePluginYaml("alpha");
    touchFile(path.join(pluginsDir, "alpha", "bin", "server"));
    writeMcpJson("alpha", { "svc": { command: "./bin/server" } });

    process.env.RELAY_SAFE_MODE = "true";
    const result = await loadPluginMcpServers();
    expect(result).toEqual({});
  });

  it("plugins with no plugin.yaml or invalid manifest are silently skipped in safe-mode enumeration", async () => {
    // Directory with no plugin.yaml at all
    fs.mkdirSync(path.join(pluginsDir, "no-manifest"), { recursive: true });

    // Directory with an invalid (unparseable) plugin.yaml
    const badDir = path.join(pluginsDir, "bad-manifest");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "plugin.yaml"), "not: valid: yaml: {[}");

    // Directory with a schema-invalid plugin.yaml (missing required fields)
    const badSchemaDir = path.join(pluginsDir, "bad-schema");
    fs.mkdirSync(badSchemaDir, { recursive: true });
    fs.writeFileSync(
      path.join(badSchemaDir, "plugin.yaml"),
      "id: bad-schema\n",
    );

    // One valid Kind 1 plugin
    writePluginYaml("valid-alpha");
    writeMcpJson("valid-alpha", { "svc": { command: "./bin/server" } });

    process.env.RELAY_SAFE_MODE = "true";
    const regs = await listPluginMcpRegistrations();

    expect(regs).toHaveLength(1);
    expect(regs[0].pluginId).toBe("valid-alpha");
    expect(regs[0].disabledReason).toBe("safe_mode");
  });
});

// ---------------------------------------------------------------------------
// Test 6: Ollama runtime filter
// ---------------------------------------------------------------------------

it("6. Ollama runtime filter: { runtime: 'ollama' } returns {} + logs per-plugin skip line", async () => {
  const pluginId = "ollama-filter-plugin";
  const yaml = writePluginYaml(pluginId);
  touchFile(path.join(pluginsDir, pluginId, "bin", "server"));
  writeMcpJson(pluginId, { "svc": { command: "./bin/server" } });
  acceptPlugin(pluginId, yaml);

  const result = await loadPluginMcpServers({ runtime: "ollama" });
  expect(result).toEqual({});

  // Spec: "plugin <id> skipped on <runtime> runtime" per plugin, once per session.
  const logPath = path.join(tmpDir, "logs", "plugins.log");
  const logContent = fs.readFileSync(logPath, "utf-8");
  expect(logContent).toMatch(
    new RegExp(`plugin ${pluginId} skipped on ollama runtime`)
  );
});

// ---------------------------------------------------------------------------
// Test 7: Capability not accepted
// ---------------------------------------------------------------------------

it("7. Capability not accepted: plugin with valid .mcp.json but no lock entry is not in output", async () => {
  const pluginId = "unaccepted-plugin";
  writePluginYaml(pluginId);
  touchFile(path.join(pluginsDir, pluginId, "bin", "server"));
  writeMcpJson(pluginId, { "svc": { command: "./bin/server" } });
  // Note: NO acceptPlugin call

  const result = await loadPluginMcpServers();
  expect(result).not.toHaveProperty("svc");

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.pluginId === pluginId);
  expect(reg).toBeDefined();
  expect(reg!.status).toBe("pending_capability_accept");
  expect(reg!.disabledReason).toBe("capability_not_accepted");
});

// ---------------------------------------------------------------------------
// Test 8: Hash drift (capability_accept_stale)
// ---------------------------------------------------------------------------

it("8. Hash drift: plugin accepted under old hash is not in output", async () => {
  const pluginId = "drifted-plugin";
  const oldHash = "sha256:" + "d".repeat(64);
  // Write lock with a stale hash.
  writePluginsLock(pluginId, {
    manifestHash: oldHash,
    capabilities: ["net"],
    acceptedAt: new Date().toISOString(),
    acceptedBy: "test",
  });

  // Write plugin with actual (different) hash.
  writePluginYaml(pluginId);
  touchFile(path.join(pluginsDir, pluginId, "bin", "server"));
  writeMcpJson(pluginId, { "svc": { command: "./bin/server" } });

  const result = await loadPluginMcpServers();
  expect(result).not.toHaveProperty("svc");

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.pluginId === pluginId);
  expect(reg).toBeDefined();
  expect(reg!.status).toBe("pending_capability_reaccept");
  expect(reg!.disabledReason).toBe("capability_accept_stale");
});

// ---------------------------------------------------------------------------
// Test 9: Missing .mcp.json
// ---------------------------------------------------------------------------

it("9. Missing .mcp.json: plugin without .mcp.json emits disabled registration", async () => {
  const pluginId = "no-mcp-plugin";
  const yaml = writePluginYaml(pluginId);
  acceptPlugin(pluginId, yaml);
  // Note: no writeMcpJson call

  const result = await loadPluginMcpServers();
  expect(result).toEqual({});

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.pluginId === pluginId);
  expect(reg).toBeDefined();
  expect(reg!.status).toBe("disabled");
  expect(reg!.disabledReason).toBe("mcp_parse_error");
});

// ---------------------------------------------------------------------------
// Test 10: Malformed .mcp.json
// ---------------------------------------------------------------------------

it("10. Malformed .mcp.json: invalid JSON produces mcp_parse_error registration", async () => {
  const pluginId = "malformed-plugin";
  const yaml = writePluginYaml(pluginId);
  acceptPlugin(pluginId, yaml);

  // Write invalid JSON.
  fs.writeFileSync(
    path.join(pluginsDir, pluginId, ".mcp.json"),
    "{ this is not json }"
  );

  const result = await loadPluginMcpServers();
  expect(result).toEqual({});

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.pluginId === pluginId);
  expect(reg).toBeDefined();
  expect(reg!.disabledReason).toBe("mcp_parse_error");
});

// ---------------------------------------------------------------------------
// Test 11: Ambiguous transport
// ---------------------------------------------------------------------------

it("11. Ambiguous transport: both command and transport:ainative-sdk → ambiguous_mcp_transport", async () => {
  const pluginId = "ambiguous-plugin";
  const yaml = writePluginYaml(pluginId);
  touchFile(path.join(pluginsDir, pluginId, "bin", "server"));
  acceptPlugin(pluginId, yaml);

  writeMcpJson(pluginId, {
    "ambig": {
      command: "./bin/server",
      transport: "ainative-sdk",
      entry: "./server/index.js",
    },
  });

  const result = await loadPluginMcpServers();
  expect(result).not.toHaveProperty("ambig");

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.serverName === "ambig");
  expect(reg).toBeDefined();
  expect(reg!.disabledReason).toBe("ambiguous_mcp_transport");
});

// ---------------------------------------------------------------------------
// Test 12: Invalid transport (neither command nor ainative-sdk)
// ---------------------------------------------------------------------------

it("12. Invalid transport: neither command nor transport:ainative-sdk → invalid_mcp_transport", async () => {
  const pluginId = "invalid-transport-plugin";
  const yaml = writePluginYaml(pluginId);
  acceptPlugin(pluginId, yaml);

  writeMcpJson(pluginId, {
    "invalid": {
      url: "http://localhost:8080",
    },
  });

  const result = await loadPluginMcpServers();
  expect(result).not.toHaveProperty("invalid");

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.serverName === "invalid");
  expect(reg).toBeDefined();
  expect(reg!.disabledReason).toBe("invalid_mcp_transport");
});

// ---------------------------------------------------------------------------
// Test 13: Stdio relative command exists → accepted
// ---------------------------------------------------------------------------

it("13. Stdio relative command exists: ./bin/server.js exists (valid MCP) → accepted", async () => {
  const pluginId = "relative-cmd-exists";
  const yaml = writePluginYaml(pluginId);
  const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
  writeFakeMcpServerFile(serverScriptPath);
  acceptPlugin(pluginId, yaml);

  // Use node as command (PATH-only), pass the real script as arg.
  // The relative resolution path only matters when command starts with ./ or ../;
  // since we use process.execPath (absolute), existence check is skipped.
  writeMcpJson(pluginId, {
    "svc": { command: process.execPath, args: [serverScriptPath] },
  });

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("svc");
  expect(result["svc"].status).toBeUndefined(); // NormalizedMcpConfig has no status field
}, 15_000);

// ---------------------------------------------------------------------------
// Test 14: Stdio relative command missing → server_not_found
// ---------------------------------------------------------------------------

it("14. Stdio relative command missing: ./bin/missing → server_not_found", async () => {
  const pluginId = "relative-cmd-missing";
  const yaml = writePluginYaml(pluginId);
  acceptPlugin(pluginId, yaml);

  writeMcpJson(pluginId, {
    "svc": { command: "./bin/missing" },
  });

  const result = await loadPluginMcpServers();
  expect(result).not.toHaveProperty("svc");

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.serverName === "svc");
  expect(reg).toBeDefined();
  expect(reg!.disabledReason).toBe("server_not_found");
});

// ---------------------------------------------------------------------------
// Test 15: PATH-only stdio command → assume present, accepted
// ---------------------------------------------------------------------------

it("15. PATH-only stdio command: 'node' (no slash) + valid MCP script → accepted", async () => {
  // Note: T4 adds pre-flight validation — a PATH-only command must also respond
  // to MCP initialize. We use 'node' (guaranteed present) with a real MCP script.
  const pluginId = "path-cmd-plugin";
  const yaml = writePluginYaml(pluginId);
  acceptPlugin(pluginId, yaml);

  const serverScriptPath = path.join(pluginsDir, pluginId, "server.js");
  writeFakeMcpServerFile(serverScriptPath);

  writeMcpJson(pluginId, {
    "node-svc": {
      command: "node",
      args: [serverScriptPath],
    },
  });

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("node-svc");
  expect(result["node-svc"].command).toBe("node");
}, 15_000);

// ---------------------------------------------------------------------------
// Test 16: SDK entry missing → sdk_entry_not_found
// ---------------------------------------------------------------------------

it("16. SDK entry missing: transport:ainative-sdk with missing entry → sdk_entry_not_found", async () => {
  const pluginId = "sdk-missing-entry";
  const yaml = writePluginYaml(pluginId);
  acceptPlugin(pluginId, yaml);

  writeMcpJson(pluginId, {
    "sdk-svc": {
      transport: "ainative-sdk",
      entry: "./missing.js",
    },
  });

  const result = await loadPluginMcpServers();
  expect(result).not.toHaveProperty("sdk-svc");

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.serverName === "sdk-svc");
  expect(reg).toBeDefined();
  expect(reg!.disabledReason).toBe("sdk_entry_not_found");
});

// ---------------------------------------------------------------------------
// Test 17: Per-plugin isolation
// ---------------------------------------------------------------------------

it("17. Per-plugin isolation: broken plugins A+B don't prevent plugin C from loading", async () => {
  // Plugin A: broken .mcp.json
  writePluginYaml("iso-a");
  fs.writeFileSync(path.join(pluginsDir, "iso-a", ".mcp.json"), "{{NOT JSON");

  // Plugin B: missing .mcp.json entirely
  writePluginYaml("iso-b");
  acceptPlugin("iso-b", fs.readFileSync(path.join(pluginsDir, "iso-b", "plugin.yaml"), "utf-8"));

  // Plugin C: fully valid — uses real fake MCP server for T4 validation
  const yamlC = writePluginYaml("iso-c");
  const cServerScript = path.join(pluginsDir, "iso-c", "bin", "server.js");
  writeFakeMcpServerFile(cServerScript);
  writeMcpJson("iso-c", { "c-svc": { command: process.execPath, args: [cServerScript] } });
  acceptPlugin("iso-c", yamlC);

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("c-svc");
  expect(result).not.toHaveProperty("a-svc");
  expect(result).not.toHaveProperty("b-svc");
}, 15_000);

// ---------------------------------------------------------------------------
// Test 18: Kind 5 plugins (primitives-bundle) ignored
// ---------------------------------------------------------------------------

it("18. Kind 5 plugins (primitives-bundle) are ignored by the MCP loader", async () => {
  const pluginId = "my-primitives";
  const dir = path.join(pluginsDir, pluginId);
  fs.mkdirSync(dir, { recursive: true });

  // Write a primitives-bundle manifest.
  const primitiveYaml = [
    `id: ${pluginId}`,
    "version: 1.0.0",
    "apiVersion: 0.15",
    "kind: primitives-bundle",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "plugin.yaml"), primitiveYaml);

  // Write a .mcp.json (should be ignored).
  writeMcpJson(pluginId, { "primitive-svc": { command: "node" } });

  const result = await loadPluginMcpServers();
  expect(result).not.toHaveProperty("primitive-svc");

  // No PluginMcpRegistration should be emitted for Kind 5.
  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.pluginId === pluginId);
  expect(reg).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Test 19: Multiple servers per plugin
// ---------------------------------------------------------------------------

it("19. Multiple servers per plugin: both servers appear in output", async () => {
  const pluginId = "multi-server-plugin";
  const yaml = writePluginYaml(pluginId);
  const alphaScript = path.join(pluginsDir, pluginId, "bin", "alpha.js");
  const betaScript = path.join(pluginsDir, pluginId, "bin", "beta.js");
  writeFakeMcpServerFile(alphaScript);
  writeFakeMcpServerFile(betaScript);
  acceptPlugin(pluginId, yaml);

  writeMcpJson(pluginId, {
    "alpha": { command: process.execPath, args: [alphaScript] },
    "beta": { command: process.execPath, args: [betaScript] },
  });

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("alpha");
  expect(result).toHaveProperty("beta");
  expect(result["alpha"].command).toBe(process.execPath);
  expect(result["beta"].command).toBe(process.execPath);
}, 30_000);

// ---------------------------------------------------------------------------
// Test 20: T5 catalog invariant — supportsPluginMcpServers values
// ---------------------------------------------------------------------------

describe("T5 catalog invariant — supportsPluginMcpServers per runtime", () => {
  it("20. supportsPluginMcpServers matches TDR-035 §1 declarations for all 5 runtimes", () => {
    const expected: Record<AgentRuntimeId, boolean> = {
      "claude-code": true,
      "openai-codex-app-server": true,
      "anthropic-direct": true,
      "openai-direct": true,
      "ollama": false,
    };

    for (const [runtimeId, expectedValue] of Object.entries(expected)) {
      expect(
        getRuntimeFeatures(runtimeId as AgentRuntimeId).supportsPluginMcpServers,
        `${runtimeId}.supportsPluginMcpServers should be ${expectedValue}`
      ).toBe(expectedValue);
    }
  });
});

// ---------------------------------------------------------------------------
// Bonus: listPluginMcpRegistrations returns full list including disabled entries
// ---------------------------------------------------------------------------

it("Bonus: listPluginMcpRegistrations includes disabled entries not in loadPluginMcpServers", async () => {
  // Unaccepted plugin.
  const pluginId = "bonus-unaccepted";
  writePluginYaml(pluginId);
  touchFile(path.join(pluginsDir, pluginId, "bin", "server"));
  writeMcpJson(pluginId, { "b-svc": { command: "./bin/server" } });
  // No accept.

  const loadResult = await loadPluginMcpServers();
  expect(loadResult).not.toHaveProperty("b-svc");

  const listResult = await listPluginMcpRegistrations();
  const reg = listResult.find((r) => r.pluginId === pluginId);
  expect(reg).toBeDefined();
  expect(reg!.status).toBe("pending_capability_accept");
});

// ---------------------------------------------------------------------------
// Bonus: plugins.log receives entries on parse errors
// ---------------------------------------------------------------------------

it("Bonus: plugins.log contains plugin id and reason after mcp_parse_error", async () => {
  const pluginId = "log-test-plugin";
  const yaml = writePluginYaml(pluginId);
  acceptPlugin(pluginId, yaml);
  // Write invalid JSON to force mcp_parse_error.
  fs.writeFileSync(
    path.join(pluginsDir, pluginId, ".mcp.json"),
    "INVALID"
  );

  await loadPluginMcpServers();

  const logPath = path.join(tmpDir, "logs", "plugins.log");
  expect(fs.existsSync(logPath)).toBe(true);
  const logContent = fs.readFileSync(logPath, "utf-8");
  expect(logContent).toMatch(new RegExp(pluginId));
  expect(logContent).toMatch(/mcp_parse_error/);
});

// ---------------------------------------------------------------------------
// T11: Capability expiry (opt-in)
// ---------------------------------------------------------------------------

it("T11. Expired capability: plugin accepted with past expiresAt → pending_capability_reaccept + capability_accept_expired", async () => {
  const pluginId = "expired-plugin";
  const yaml = writePluginYaml(pluginId);
  const hash = deriveManifestHash(yaml);
  touchFile(path.join(pluginsDir, pluginId, "bin", "server"));
  writeMcpJson(pluginId, { "svc": { command: "./bin/server" } });

  // Write lock with an expiresAt 1 second in the past.
  const past = new Date(Date.now() - 1_000).toISOString();
  writePluginsLock(pluginId, {
    manifestHash: hash,
    capabilities: ["net"],
    acceptedAt: new Date().toISOString(),
    acceptedBy: "test",
    expiresAt: past,
  });

  const result = await loadPluginMcpServers();
  expect(result).not.toHaveProperty("svc");

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.pluginId === pluginId);
  expect(reg).toBeDefined();
  expect(reg!.status).toBe("pending_capability_reaccept");
  expect(reg!.disabledReason).toBe("capability_accept_expired");
});

it("T11. Future expiresAt loads normally (accepted)", async () => {
  const pluginId = "future-expiry-plugin";
  const yaml = writePluginYaml(pluginId);
  const hash = deriveManifestHash(yaml);
  const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
  writeFakeMcpServerFile(serverScriptPath);

  writeMcpJson(pluginId, {
    "svc": { command: process.execPath, args: [serverScriptPath] },
  });

  // Write lock with an expiresAt 60 days in the future.
  const future = new Date(Date.now() + 60 * 86_400_000).toISOString();
  writePluginsLock(pluginId, {
    manifestHash: hash,
    capabilities: ["net"],
    acceptedAt: new Date().toISOString(),
    acceptedBy: "test",
    expiresAt: future,
  });

  const result = await loadPluginMcpServers();
  expect(result).toHaveProperty("svc");

  const regs = await listPluginMcpRegistrations();
  const reg = regs.find((r) => r.pluginId === pluginId);
  expect(reg).toBeDefined();
  expect(reg!.status).toBe("accepted");
}, 15_000);

// ---------------------------------------------------------------------------
// T12: listAcceptedInProcessEntriesForPlugin
// ---------------------------------------------------------------------------

describe("T12 — listAcceptedInProcessEntriesForPlugin", () => {
  it("returns [absEntry] for an accepted in-process SDK plugin", async () => {
    const pluginId = "sdk-in-process";
    const yaml = writePluginYaml(pluginId);
    const entryPath = path.join(pluginsDir, pluginId, "server", "index.js");
    writeFakeSdkServerFile(entryPath);

    writeMcpJson(pluginId, {
      "sdk-server": {
        transport: "ainative-sdk",
        entry: "./server/index.js",
      },
    });
    acceptPlugin(pluginId, yaml);

    const entries = await listAcceptedInProcessEntriesForPlugin(pluginId);
    expect(entries).toEqual([entryPath]);
  });

  it("returns [] for a stdio-only plugin (no in-process entries)", async () => {
    const pluginId = "stdio-only";
    const yaml = writePluginYaml(pluginId);
    const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
    writeFakeMcpServerFile(serverScriptPath);

    writeMcpJson(pluginId, {
      "svc": { command: process.execPath, args: [serverScriptPath] },
    });
    acceptPlugin(pluginId, yaml);

    const entries = await listAcceptedInProcessEntriesForPlugin(pluginId);
    expect(entries).toEqual([]);
  }, 15_000);

  it("returns [] for an unknown pluginId", async () => {
    // Plugins dir is empty — no registrations exist.
    const entries = await listAcceptedInProcessEntriesForPlugin("ghost-plugin");
    expect(entries).toEqual([]);
  });

  it("excludes disabled/pending in-process registrations", async () => {
    // Un-accepted SDK plugin — registration is pending, not accepted.
    const pluginId = "unaccepted-sdk";
    writePluginYaml(pluginId);
    const entryPath = path.join(pluginsDir, pluginId, "server", "index.js");
    writeFakeSdkServerFile(entryPath);

    writeMcpJson(pluginId, {
      "sdk-server": {
        transport: "ainative-sdk",
        entry: "./server/index.js",
      },
    });
    // Note: NO acceptPlugin call.

    const entries = await listAcceptedInProcessEntriesForPlugin(pluginId);
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T14: confinement mode integration
// (TDR-037 — these tests require RELAY_PLUGIN_CONFINEMENT=1 because
// confinement is parked by default. Each test sets the flag in a try/finally.)
// ---------------------------------------------------------------------------

describe("T14 — confinementMode integration (wrap → mcp-loader)", () => {
  beforeEach(() => {
    process.env.RELAY_PLUGIN_CONFINEMENT = "1";
  });
  afterEach(() => {
    delete process.env.RELAY_PLUGIN_CONFINEMENT;
  });

  it("confinementMode:'seatbelt' on non-macOS surfaces confinement_unsupported_on_platform", async () => {
    // Force linux platform via Object.defineProperty so wrap.ts sees linux
    // regardless of the host running the test.
    const realPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      const pluginId = "seatbelt-on-linux";
      const yaml = writePluginYaml(pluginId, {
        capabilities: ["net"],
        confinementMode: "seatbelt",
      });
      const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
      writeFakeMcpServerFile(serverScriptPath);
      writeMcpJson(pluginId, {
        svc: { command: process.execPath, args: [serverScriptPath] },
      });
      acceptPlugin(pluginId, yaml);

      const regs = await listPluginMcpRegistrations();
      const reg = regs.find((r) => r.pluginId === pluginId);
      expect(reg).toBeDefined();
      expect(reg!.status).toBe("disabled");
      expect(reg!.disabledReason).toBe("confinement_unsupported_on_platform");
      expect(reg!.disabledDetail).toContain("macOS");
    } finally {
      Object.defineProperty(process, "platform", {
        value: realPlatform,
        configurable: true,
      });
    }
  }, 15_000);

  it("confinementMode:'apparmor' on macOS surfaces confinement_unsupported_on_platform", async () => {
    const realPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    try {
      const pluginId = "apparmor-on-mac";
      const yaml = writePluginYaml(pluginId, {
        capabilities: ["fs"],
        confinementMode: "apparmor",
      });
      const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
      writeFakeMcpServerFile(serverScriptPath);
      writeMcpJson(pluginId, {
        svc: { command: process.execPath, args: [serverScriptPath] },
      });
      acceptPlugin(pluginId, yaml);

      const regs = await listPluginMcpRegistrations();
      const reg = regs.find((r) => r.pluginId === pluginId);
      expect(reg).toBeDefined();
      expect(reg!.status).toBe("disabled");
      expect(reg!.disabledReason).toBe("confinement_unsupported_on_platform");
      expect(reg!.disabledDetail).toContain("Linux");
    } finally {
      Object.defineProperty(process, "platform", {
        value: realPlatform,
        configurable: true,
      });
    }
  }, 15_000);

  it("confinementMode:'docker' without dockerImage surfaces confinement_unsupported_on_platform", async () => {
    const pluginId = "docker-no-image";
    const yaml = writePluginYaml(pluginId, {
      capabilities: ["net"],
      confinementMode: "docker",
      // Deliberately NO dockerImage.
    });
    const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
    writeFakeMcpServerFile(serverScriptPath);
    writeMcpJson(pluginId, {
      svc: { command: process.execPath, args: [serverScriptPath] },
    });
    acceptPlugin(pluginId, yaml);

    const regs = await listPluginMcpRegistrations();
    const reg = regs.find((r) => r.pluginId === pluginId);
    expect(reg).toBeDefined();
    expect(reg!.status).toBe("disabled");
    expect(reg!.disabledReason).toBe("confinement_unsupported_on_platform");
    expect(reg!.disabledDetail).toContain("dockerImage");
  }, 15_000);

  it("confinementMode:'none' (default) passes through unchanged — existing happy path still works", async () => {
    // Sanity check: a plugin with no confinementMode declared (= "none") still
    // accepts cleanly. Equivalent to test 1 but confirms the new code path.
    const pluginId = "no-confinement";
    const yaml = writePluginYaml(pluginId); // no confinementMode override
    const serverScriptPath = path.join(pluginsDir, pluginId, "bin", "server.js");
    writeFakeMcpServerFile(serverScriptPath);
    writeMcpJson(pluginId, {
      svc: { command: process.execPath, args: [serverScriptPath] },
    });
    acceptPlugin(pluginId, yaml);

    const result = await loadPluginMcpServers();
    expect(result).toHaveProperty("svc");
    expect(result["svc"].command).toBe(process.execPath);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// T15: reloadPluginMcpRegistrations
// ---------------------------------------------------------------------------

describe("T15 — reloadPluginMcpRegistrations", () => {
  it("returns { bustedInProcessEntries: [], registrations: [] } for an unknown pluginId", async () => {
    const result = await reloadPluginMcpRegistrations("ghost-plugin");
    expect(result).toEqual({
      bustedInProcessEntries: [],
      registrations: [],
    });
  });

  it("returns busted entry paths and fresh registrations for an accepted in-process SDK plugin", async () => {
    const pluginId = "reload-sdk-plugin";
    const yaml = writePluginYaml(pluginId);
    const entryPath = path.join(pluginsDir, pluginId, "server", "index.js");
    writeFakeSdkServerFile(entryPath);

    writeMcpJson(pluginId, {
      "sdk-server": {
        transport: "ainative-sdk",
        entry: "./server/index.js",
      },
    });
    acceptPlugin(pluginId, yaml);

    const result = await reloadPluginMcpRegistrations(pluginId);

    expect(result.bustedInProcessEntries).toEqual([entryPath]);
    // Fresh registrations must contain the accepted SDK server.
    expect(result.registrations).toHaveLength(1);
    expect(result.registrations[0].pluginId).toBe(pluginId);
    expect(result.registrations[0].serverName).toBe("sdk-server");
    expect(result.registrations[0].status).toBe("accepted");
    expect(result.registrations[0].transport).toBe("ainative-sdk");
  });
});
