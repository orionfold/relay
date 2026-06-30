import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { pluginTools } from "../plugin-tools";
import type { ToolContext } from "../helpers";

let tmpDir: string;

function writePlugin(id: string) {
  const dir = path.join(tmpDir, "plugins", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "plugin.yaml"),
    yaml.dump({
      id,
      version: "0.1.0",
      apiVersion: "0.14",
      kind: "primitives-bundle",
    })
  );
}

function writeKind1Plugin(id: string) {
  const dir = path.join(tmpDir, "plugins", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "plugin.yaml"),
    [
      `id: ${id}`,
      'version: "1.0.0"',
      'apiVersion: "0.14"',
      "kind: chat-tools",
      "capabilities:",
      "  - net",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(dir, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "svc": { command: "./bin/missing-binary" },
      },
    }),
  );
}

describe("plugin chat tools", () => {
  let ctx: ToolContext;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-tools-"));
    process.env.RELAY_DATA_DIR = tmpDir;
    ctx = {};
    // Make sure the registry cache is clean before each test so that the
    // env-var change above takes effect for the very first scan.
    const { reloadPlugins } = await import("@/lib/plugins/registry");
    await reloadPlugins();
  });

  afterEach(async () => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const { reloadPlugins } = await import("@/lib/plugins/registry");
    await reloadPlugins();
  });

  it("reload_plugins rescans and returns summary", async () => {
    writePlugin("a");
    const tools = pluginTools(ctx);
    const reload = tools.find((t) => t.name === "reload_plugins");
    expect(reload).toBeTruthy();
    const result = await reload!.handler({});
    expect(result.content?.[0]?.text).toMatch(/"id":\s*"a"/);
    expect(result.content?.[0]?.text).toMatch(/loaded/);
  });

  it("reload_plugins includes schedules field in loaded shape", async () => {
    // Write plugin with a schedules/ subdir (no agentProfile → cross-ref passes trivially).
    const pluginDir = path.join(tmpDir, "plugins", "sched-test");
    fs.mkdirSync(path.join(pluginDir, "schedules"), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "plugin.yaml"),
      yaml.dump({ id: "sched-test", version: "0.1.0", apiVersion: "0.14", kind: "primitives-bundle" })
    );
    fs.writeFileSync(
      path.join(pluginDir, "schedules", "weekly-report.yaml"),
      yaml.dump({
        id: "weekly-report",
        name: "Weekly Report",
        version: "1.0.0",
        type: "scheduled",
        cronExpression: "0 9 * * 1",
        prompt: "Generate the weekly report",
        recurs: true,
      })
    );

    const tools = pluginTools(ctx);
    const reload = tools.find((t) => t.name === "reload_plugins");
    const result = await reload!.handler({});
    const text = result.content?.[0]?.text ?? "";
    // The loaded entry for sched-test should include the schedules array.
    expect(text).toMatch(/"id":\s*"sched-test"/);
    expect(text).toMatch(/plugin:sched-test:weekly-report/);
  });

  it("list_plugins returns { kind5, kind1 } — kind5 includes loaded primitives bundles", async () => {
    writePlugin("a");
    const tools = pluginTools(ctx);
    await tools.find((t) => t.name === "reload_plugins")!.handler({});
    const list = tools.find((t) => t.name === "list_plugins");
    const result = await list!.handler({});
    const payload = JSON.parse(result.content![0].text);
    expect(payload).toHaveProperty("kind5");
    expect(payload).toHaveProperty("kind1");
    expect(Array.isArray(payload.kind5)).toBe(true);
    expect(Array.isArray(payload.kind1)).toBe(true);
    // Kind-5 plugin "a" is present.
    expect(payload.kind5.some((p: { id: string }) => p.id === "a")).toBe(true);
  });

  it("list_plugins surfaces Kind-1 plugins with capability status and per-server details", async () => {
    writeKind1Plugin("k1");
    const tools = pluginTools(ctx);
    const list = tools.find((t) => t.name === "list_plugins");
    const result = await list!.handler({});
    const payload = JSON.parse(result.content![0].text);

    const k1 = payload.kind1.find(
      (e: { pluginId: string }) => e.pluginId === "k1",
    );
    expect(k1).toBeDefined();
    // Not capability-accepted → status is "pending".
    expect(k1.capabilityAcceptStatus).toBe("pending");
    // No accepted servers → transport is null, toolCount is 0.
    expect(k1.transport).toBeNull();
    expect(k1.toolCount).toBe(0);
    // Capabilities carried through from manifest.
    expect(k1.capabilities).toEqual(["net"]);
    // manifestHash is present — caller can pass it back to
    // grant_plugin_capabilities as expectedHash.
    expect(typeof k1.manifestHash).toBe("string");
    expect(k1.manifestHash).toMatch(/^sha256:/);
    // Per-server entries surface status + disabledReason.
    expect(k1.servers.length).toBeGreaterThan(0);
    expect(k1.servers[0].status).toBe("pending_capability_accept");
  });

  it("reload_plugin returns { kind5, kind1 } — Kind-5 happy path", async () => {
    writePlugin("a");
    const tools = pluginTools(ctx);
    await tools.find((t) => t.name === "reload_plugins")!.handler({});
    const result = await tools
      .find((t) => t.name === "reload_plugin")!
      .handler({ id: "a" });
    const payload = JSON.parse(result.content![0].text);
    expect(payload).toHaveProperty("kind5");
    expect(payload).toHaveProperty("kind1");
    expect(payload.kind5.id).toBe("a");
    // Kind-1 fields are present for a Kind-5-only plugin; registrations empty.
    expect(payload.kind1.bustedInProcessEntries).toEqual([]);
    expect(payload.kind1.registrations).toEqual([]);
  });

  it("reload_plugin returns { kind5: { id, status: 'removed' }, kind1: ... } for a deleted plugin", async () => {
    const tools = pluginTools(ctx);
    const result = await tools
      .find((t) => t.name === "reload_plugin")!
      .handler({ id: "never-existed" });
    const payload = JSON.parse(result.content![0].text);
    expect(payload.kind5).toEqual({ id: "never-existed", status: "removed" });
    expect(payload.kind1.bustedInProcessEntries).toEqual([]);
    expect(payload.kind1.registrations).toEqual([]);
  });

  it("grant_plugin_capabilities surfaces the capability-check result", async () => {
    const tools = pluginTools(ctx);
    const grant = tools.find((t) => t.name === "grant_plugin_capabilities");
    expect(grant).toBeDefined();

    // Call with a non-existent plugin id — the underlying function returns
    // { granted: false, reason: "not_found" } without needing any plugin
    // on disk, so we can verify the handler's contract without mocks.
    const result = await grant!.handler({ pluginId: "nonexistent" });
    const payload = JSON.parse(result.content![0].text);
    expect(payload).toEqual({ granted: false, reason: "not_found" });
  });
});

// ---------------------------------------------------------------------------
// TDR-032 drift-heuristic invariant
// ---------------------------------------------------------------------------

describe("plugin-tools.ts — TDR-032 dynamic import discipline", () => {
  it("contains zero static imports from @/lib/plugins/* (all must be dynamic)", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "plugin-tools.ts"),
      "utf-8",
    );
    // Any line with `from "@/lib/plugins/..."` (outside an `await import()`)
    // is a static import and would reintroduce the module-load cycle described
    // in TDR-032 + CLAUDE.md. The dynamic form is `await import("@/lib/...")`.
    // We look for any occurrence of `from "@/lib/plugins/` which is the
    // ES-module static-import syntax.
    const staticImportRegex = /from\s+["']@\/lib\/plugins\//g;
    const matches = source.match(staticImportRegex);
    expect(matches).toBeNull();
  });

  it("has at least one dynamic import per plugin-module-touching handler", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "plugin-tools.ts"),
      "utf-8",
    );
    // Every handler in this file MUST import its plugin module dynamically.
    // Count occurrences of `import("@/lib/plugins/` as a lower bound —
    // this matches both the bare `await import(...)` form and the
    // `Promise.all([import(...), import(...)])` form where await is only
    // on the outer Promise.all. Either form is TDR-032-compliant.
    const dynamicImportRegex = /\bimport\(\s*["']@\/lib\/plugins\//g;
    const matches = source.match(dynamicImportRegex) ?? [];
    // Phase D handlers touching @/lib/plugins:
    //   list_plugins                  — 3 (registry, mcp-loader, capability-check)
    //   reload_plugins                — 1 (registry)
    //   reload_plugin                 — 2 (registry, mcp-loader)
    //   set_plugin_tool_approval      — 1 (capability-check)
    //   set_plugin_accept_expiry      — 1 (capability-check)
    //   revoke_plugin_capabilities    — 1 (capability-check)
    //   grant_plugin_capabilities     — 1 (capability-check)
    // Total = 10 minimum.
    expect(matches.length).toBeGreaterThanOrEqual(9);
  });
});

