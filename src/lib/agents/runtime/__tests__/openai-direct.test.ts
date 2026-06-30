/**
 * T9 — OpenAI direct runtime MCP 5-source merge tests (TDR-035 §1).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── Mock @/lib/chat/ainative-tools ───────────────────────────────────

vi.mock("@/lib/chat/ainative-tools", () => ({
  createToolServer: () => ({
    asMcpServer: () => ({ _mockAinativeServer: true }),
    forProvider: () => ({ tools: [], executeHandler: async () => {} }),
  }),
}));

// ── Import helpers under test ────────────────────────────────────────

import {
  withOpenAiDirectMcpServers,
  mcpServersToOpenAiTools,
} from "@/lib/agents/runtime/openai-direct";

// ── Tests ────────────────────────────────────────────────────────────

describe("withOpenAiDirectMcpServers (T9 — 5-source merge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T9-1: happy path — plugin server present + relay is last key", async () => {
    const result = await withOpenAiDirectMcpServers(
      {},
      {},
      {},
      { "plugin-a": { command: "x" } },
      null,
    );
    const keys = Object.keys(result);
    expect(keys).toContain("plugin-a");
    expect(keys).toContain("relay");
    // relay must be the LAST key (TDR-035 §1 position 5)
    expect(keys[keys.length - 1]).toBe("relay");
  });

  it("T9-2: plugin cannot shadow relay — real server wins", async () => {
    const result = await withOpenAiDirectMcpServers(
      {},
      {},
      {},
      { relay: { command: "evil-override" } },
      null,
    );
    // The plugin's relay key must be overwritten by the real in-process server
    expect((result.relay as Record<string, unknown>)._mockAinativeServer).toBe(true);
    // Only the real relay key remains
    expect(Object.keys(result)).toEqual(["relay"]);
  });

  it("T9-3: merge order preserves upstream keys — profile → browser → external → plugin → relay", async () => {
    const result = await withOpenAiDirectMcpServers(
      { a: 1 },
      { b: 2 },
      { c: 3 },
      { d: 4 },
      null,
    );
    expect(Object.keys(result)).toEqual(["a", "b", "c", "d", "relay"]);
  });
});

describe("mcpServersToOpenAiTools (T9 — transform to OpenAI shape)", () => {
  it("T9-4: transform emits MCP tools with correct shape", () => {
    const tools = mcpServersToOpenAiTools({ foo: { command: "py", args: ["server.py"] } });
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      type: "mcp",
      server_label: "foo",
      command: "py",
      args: ["server.py"],
    });
  });

  it("T9-5: transform skips relay key — not emitted as MCP tool", () => {
    const tools = mcpServersToOpenAiTools({
      relay: { _mockRelayServer: true },
      foo: { command: "x" },
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].server_label).toBe("foo");
    // relay must NOT appear in output
    expect(tools.map((t) => t.server_label)).not.toContain("relay");
  });

  it("T9-6: url field maps to server_url", () => {
    const tools = mcpServersToOpenAiTools({ remote: { url: "https://example.com/mcp" } });
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      type: "mcp",
      server_label: "remote",
      server_url: "https://example.com/mcp",
    });
    expect(tools[0].url).toBeUndefined();
  });

  it("T9-7: empty map returns empty array", () => {
    expect(mcpServersToOpenAiTools({})).toEqual([]);
  });
});

describe("T9 source-grep invariants", () => {
  it("T9-8: loadPluginMcpServers({ runtime: 'openai-direct' }) appears exactly once in openai-direct.ts", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../openai-direct.ts"),
      "utf8",
    );
    const pattern = `loadPluginMcpServers({ runtime: "openai-direct" })`;
    const matches = src.split(pattern).length - 1;
    expect(matches).toBe(1);
  });

  it("T9-9: withOpenAiDirectMcpServers is called in executeOpenAIDirectTask body", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../openai-direct.ts"),
      "utf8",
    );
    expect(src).toContain("withOpenAiDirectMcpServers(");
    // Must be inside executeOpenAIDirectTask (not just the export declaration)
    const funcStart = src.indexOf("async function executeOpenAIDirectTask(");
    const funcEnd = src.indexOf("\nasync function ", funcStart + 1);
    const body = funcEnd > funcStart ? src.slice(funcStart, funcEnd) : src.slice(funcStart);
    expect(body).toContain("withOpenAiDirectMcpServers(");
  });
});
