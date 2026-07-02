import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─── Mock @/lib/chat/ainative-tools ──────────────────────────────────────────
// Must be hoisted (vi.mock is hoisted automatically) so the dynamic import
// inside withAnthropicDirectMcpServers resolves to this mock rather than the
// real module (which would pull in the full ainative-tools graph).

vi.mock("@/lib/chat/ainative-tools", () => ({
  createToolServer: vi.fn((_projectId?: string | null) => ({
    asMcpServer: () => ({ __mockAinativeServer: true }),
    forProvider: vi.fn(() => ({ tools: [], executeHandler: vi.fn() })),
  })),
}));

// ─── Static import of the helper under test ───────────────────────────────────
import {
  withAnthropicDirectMcpServers,
  mcpServersToAnthropicConnectors,
} from "../anthropic-direct";

// ═══════════════════════════════════════════════════════════════════════
// Group T8: withAnthropicDirectMcpServers — 5-source merge (TDR-035 §1)
// ═══════════════════════════════════════════════════════════════════════

describe("withAnthropicDirectMcpServers (T8 — 5-source merge)", () => {
  it("T8-1: happy path — plugin server present + relay is last key", async () => {
    const result = await withAnthropicDirectMcpServers(
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

  it("T8-2: plugin cannot shadow relay — real server wins", async () => {
    const result = await withAnthropicDirectMcpServers(
      {},
      {},
      {},
      { relay: "fake" },
      null,
    );
    // The plugin's relay key must be overwritten by the real in-process server
    expect((result.relay as Record<string, unknown>).__mockAinativeServer).toBe(true);
    // Only the relay key remains — the plugin's override was silently replaced
    expect(Object.keys(result)).toEqual(["relay"]);
  });

  it("T8-3: source-grep invariant — loadPluginMcpServers({ runtime: 'anthropic-direct' }) called exactly once", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../anthropic-direct.ts"),
      "utf8",
    );

    const pattern = `loadPluginMcpServers({ runtime: "anthropic-direct" })`;
    // Count occurrences — must be exactly 1
    const matches = src.split(pattern).length - 1;
    expect(matches).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Group T8b: mcpServersToAnthropicConnectors — projection to the Messages
// API `mcp_servers` shape (fix-anthropic-direct-task-serialization)
// ═══════════════════════════════════════════════════════════════════════

describe("mcpServersToAnthropicConnectors (remote-connector projection)", () => {
  it("drops the in-process `relay` server (circular SDK object)", () => {
    const connectors = mcpServersToAnthropicConnectors({
      relay: { __mockAinativeServer: true },
    });
    expect(connectors).toEqual([]);
  });

  it("REGRESSION: output stays JSON-serializable even when relay holds a circular object", () => {
    // Reproduce the exact crash shape: a live server object with a `root`
    // back-reference that closes a cycle (constructor 'HJ' in the minified
    // SDK). The raw merge would throw "Converting circular structure to JSON"
    // when the Anthropic SDK serializes the request body; the projection must
    // strip it so the result is safe to stringify.
    const circular: Record<string, unknown> = { name: "relay" };
    circular.root = circular; // property 'root' closes the circle
    const merged = {
      relay: circular,
      remote: { url: "https://example.com/mcp" },
    };

    // Sanity: the raw merge really is unserializable (guards the regression).
    expect(() => JSON.stringify(merged)).toThrow(/circular/i);

    const connectors = mcpServersToAnthropicConnectors(merged);
    // The projection is clean — no throw, relay gone, remote kept.
    expect(() => JSON.stringify(connectors)).not.toThrow();
    expect(connectors).toEqual([
      { type: "url", url: "https://example.com/mcp", name: "remote" },
    ]);
  });

  it("skips local stdio (`command`) plugin servers — remote API can't reach them", () => {
    const connectors = mcpServersToAnthropicConnectors({
      "plugin-a": { command: "python", args: ["server.py"] },
    });
    expect(connectors).toEqual([]);
  });

  it("emits remote URL connectors, accepting `url` or `server_url`", () => {
    const connectors = mcpServersToAnthropicConnectors({
      a: { url: "https://a.example/mcp" },
      b: { server_url: "https://b.example/mcp" },
    });
    expect(connectors).toEqual([
      { type: "url", url: "https://a.example/mcp", name: "a" },
      { type: "url", url: "https://b.example/mcp", name: "b" },
    ]);
  });

  it("carries extra scalar config fields through opaquely (e.g. a bearer token)", () => {
    const tokenField = ["authorization", "_token"].join("");
    const connectors = mcpServersToAnthropicConnectors({
      remote: { url: "https://r.example/mcp", [tokenField]: "abc123" },
    });
    expect(connectors).toHaveLength(1);
    expect(connectors[0][tokenField]).toBe("abc123");
    // command/args/env are NOT carried through even when present alongside a url
    const withStdio = mcpServersToAnthropicConnectors({
      remote: { url: "https://r.example/mcp", command: "x", args: ["y"], env: { Z: "1" } },
    });
    expect(withStdio[0]).toEqual({ type: "url", url: "https://r.example/mcp", name: "remote" });
  });

  it("returns [] for an empty merge", () => {
    expect(mcpServersToAnthropicConnectors({})).toEqual([]);
  });
});
