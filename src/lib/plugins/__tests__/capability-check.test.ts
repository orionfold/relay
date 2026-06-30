/**
 * capability-check.test.ts — TDR-035 §3 canonical hash + plugins.lock I/O
 *
 * All 18 required assertions from the T2 plan.
 * Uses real fs (tmpdir) — no mocked fs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  deriveManifestHash,
  readPluginsLock,
  writePluginsLock,
  removePluginsLockEntry,
  isCapabilityAccepted,
  setPluginToolApproval,
  getPluginToolApprovalMode,
  resolvePluginToolApproval,
  setPluginAcceptExpiry,
  revokePluginCapabilities,
  grantPluginCapabilities,
  type PluginsLockEntry,
} from "../capability-check";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "capability-check-"));
  process.env.RELAY_DATA_DIR = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.RELAY_DATA_DIR;
});

const lockPath = () => path.join(tmpDir, "plugins.lock");
const bakPath = () => path.join(tmpDir, "plugins.lock.bak");
const logsPath = () => path.join(tmpDir, "logs", "plugins.log");

function makeEntry(overrides: Partial<PluginsLockEntry> = {}): PluginsLockEntry {
  return {
    manifestHash: "sha256:" + "a".repeat(64),
    capabilities: ["net"],
    acceptedAt: "2026-04-20T09:00:00Z",
    acceptedBy: "test-user",
    ...overrides,
  };
}

// A minimal valid plugin.yaml YAML string.
function makeYaml(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    id: "gmail-triage",
    version: "1.0.0",
    apiVersion: "0.15",
    kind: "chat-tools",
    capabilities: ["net"],
    ...overrides,
  };
  // Produce YAML manually to control key order.
  return Object.entries(base)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}:\n${v.map((x) => `  - ${x}`).join("\n")}`;
      return `${k}: ${v}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Section 1: deriveManifestHash
// ---------------------------------------------------------------------------

describe("capability-check — deriveManifestHash", () => {
  // 1. Determinism: same content → same hash across multiple calls
  it("1. Returns same hash for the same YAML content (determinism across 10 calls)", () => {
    const yamlContent = makeYaml();
    const hashes = Array.from({ length: 10 }, () => deriveManifestHash(yamlContent));
    const unique = new Set(hashes);
    expect(unique.size).toBe(1);
  });

  // 2. Cosmetic-field exclusion: name/description/tags/author changes don't affect hash
  it("2. Produces same hash when only cosmetic fields differ (name, description, tags, author)", () => {
    const base = makeYaml();
    const withCosmeticA = makeYaml({
      name: "Gmail Triage v1",
      description: "First description",
      tags: ["email"],
      author: "alice",
    });
    const withCosmeticB = makeYaml({
      name: "Gmail Triage v2",
      description: "Corrected typo in description",
      tags: ["email", "ai"],
      author: "bob",
    });

    const hashBase = deriveManifestHash(base);
    const hashA = deriveManifestHash(withCosmeticA);
    const hashB = deriveManifestHash(withCosmeticB);

    expect(hashA).toBe(hashBase);
    expect(hashB).toBe(hashBase);
  });

  // 3. Security-field sensitivity: different capabilities → different hashes
  it("3. Produces different hashes when capabilities differ (same id+version)", () => {
    const withNet = makeYaml({ capabilities: ["net"] });
    const withFs = makeYaml({ capabilities: ["fs"] });
    const withBoth = makeYaml({ capabilities: ["net", "fs"] });

    expect(deriveManifestHash(withNet)).not.toBe(deriveManifestHash(withFs));
    expect(deriveManifestHash(withNet)).not.toBe(deriveManifestHash(withBoth));
    expect(deriveManifestHash(withFs)).not.toBe(deriveManifestHash(withBoth));
  });

  // 4. Array order matters: [net, fs] vs [fs, net] → different hashes
  it("4. Array order matters — [net, fs] vs [fs, net] produce different hashes", () => {
    const netFirst = makeYaml({ capabilities: ["net", "fs"] });
    const fsFirst = makeYaml({ capabilities: ["fs", "net"] });
    expect(deriveManifestHash(netFirst)).not.toBe(deriveManifestHash(fsFirst));
  });

  // 5. Key order doesn't matter: same semantic content in different YAML key order → same hash
  it("5. Key order in YAML doesn't affect hash (canonical form sorts keys)", () => {
    // Produce two YAML strings with the same fields but different key ordering.
    const orderA = [
      "id: gmail-triage",
      "version: 1.0.0",
      "apiVersion: \"0.15\"",
      "kind: chat-tools",
      "capabilities:",
      "  - net",
    ].join("\n");

    const orderB = [
      "kind: chat-tools",
      "capabilities:",
      "  - net",
      "id: gmail-triage",
      "apiVersion: \"0.15\"",
      "version: 1.0.0",
    ].join("\n");

    expect(deriveManifestHash(orderA)).toBe(deriveManifestHash(orderB));
  });

  // 6. Hash format: "sha256:" + 64 lowercase hex chars
  it("6. Output starts with 'sha256:' followed by 64 lowercase hex characters", () => {
    const hash = deriveManifestHash(makeYaml());
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  // 19. Scalar input → named error
  it("19. deriveManifestHash throws named error on YAML scalar input", () => {
    expect(() => deriveManifestHash('"hello"')).toThrow(/YAML mapping/);
  });

  // 20. Empty/null input → named error
  it("20. deriveManifestHash throws named error on empty/null YAML", () => {
    expect(() => deriveManifestHash("")).toThrow(/YAML mapping/);
    expect(() => deriveManifestHash("null")).toThrow(/YAML mapping/);
  });
});

// ---------------------------------------------------------------------------
// Section 2: readPluginsLock
// ---------------------------------------------------------------------------

describe("capability-check — readPluginsLock", () => {
  // 7. Absent file → empty state, no exception
  it("7. Returns empty state when plugins.lock does not exist", () => {
    const result = readPluginsLock();
    expect(result).toEqual({ version: 1, accepted: {} });
  });

  // 8. Corrupted YAML → empty state + warning in plugins.log
  it("8. Corrupted YAML → returns empty state and writes warning to plugins.log", () => {
    fs.writeFileSync(lockPath(), "not valid yaml: [[[\n");
    const result = readPluginsLock();
    expect(result).toEqual({ version: 1, accepted: {} });
    // Log file must exist with a warning line.
    expect(fs.existsSync(logsPath())).toBe(true);
    const log = fs.readFileSync(logsPath(), "utf-8");
    expect(log).toMatch(/WARN.*plugins\.lock/);
  });

  // 9. Valid YAML but wrong schema → empty state + log
  it("9. Valid YAML with wrong schema → returns empty state and writes warning to plugins.log", () => {
    // Write valid YAML that doesn't match PluginsLockFileSchema.
    fs.writeFileSync(lockPath(), "version: 99\naccepted: {}\n");
    const result = readPluginsLock();
    expect(result).toEqual({ version: 1, accepted: {} });
    expect(fs.existsSync(logsPath())).toBe(true);
    const log = fs.readFileSync(logsPath(), "utf-8");
    expect(log).toMatch(/WARN.*plugins\.lock/);
  });
});

// ---------------------------------------------------------------------------
// Section 3: writePluginsLock + round-trip
// ---------------------------------------------------------------------------

describe("capability-check — writePluginsLock", () => {
  // 10. Round-trip: write → read → deep equal
  it("10. Round-trips — writePluginsLock then readPluginsLock returns deep-equal entry", () => {
    const entry = makeEntry({ capabilities: ["net", "fs"] });
    writePluginsLock("gmail-triage", entry);
    const lock = readPluginsLock();
    expect(lock.version).toBe(1);
    expect(lock.accepted["gmail-triage"]).toEqual(entry);
  });

  // 11. .bak created on subsequent write (when primary already exists)
  it("11. plugins.lock.bak is created on a second write with prior content", () => {
    const entry1 = makeEntry({ capabilities: ["net"] });
    writePluginsLock("gmail-triage", entry1);

    const priorContent = fs.readFileSync(lockPath(), "utf-8");

    const entry2 = makeEntry({ capabilities: ["fs"] });
    writePluginsLock("gmail-triage", entry2);

    expect(fs.existsSync(bakPath())).toBe(true);
    const bakContent = fs.readFileSync(bakPath(), "utf-8");
    expect(bakContent).toBe(priorContent);
  });

  // 12. .bak NOT created on first write (nothing to back up)
  it("12. plugins.lock.bak is NOT created on first write (no prior file to back up)", () => {
    writePluginsLock("gmail-triage", makeEntry());
    expect(fs.existsSync(bakPath())).toBe(false);
  });

  // 13. No leftover tmp files after write
  it("13. No leftover .tmp-* files in dataDir after write", () => {
    writePluginsLock("gmail-triage", makeEntry());
    const files = fs.readdirSync(tmpDir);
    const strayTmp = files.filter((f) => f.startsWith("plugins.lock.tmp-"));
    expect(strayTmp).toHaveLength(0);
  });

  // 14. 0600 permissions on POSIX
  it("14. plugins.lock has mode 0600 after write (POSIX only)", () => {
    if (process.platform === "win32") return; // skip on Windows
    writePluginsLock("gmail-triage", makeEntry());
    const mode = fs.statSync(lockPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

// ---------------------------------------------------------------------------
// Section 4: removePluginsLockEntry
// ---------------------------------------------------------------------------

describe("capability-check — removePluginsLockEntry", () => {
  // 15. Remove one entry, the other remains
  it("15. Removes only the specified entry — other entries survive", () => {
    writePluginsLock("a", makeEntry({ capabilities: ["net"] }));
    writePluginsLock("b", makeEntry({ capabilities: ["fs"] }));

    removePluginsLockEntry("a");

    const lock = readPluginsLock();
    expect(Object.keys(lock.accepted)).toEqual(["b"]);
    expect(lock.accepted["b"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Section 5: isCapabilityAccepted
// ---------------------------------------------------------------------------

describe("capability-check — isCapabilityAccepted", () => {
  const yamlContent = makeYaml({ capabilities: ["net"] });
  const currentHash = () => deriveManifestHash(yamlContent);

  // 16. No entry → not_accepted
  it("16. Returns not_accepted when no entry exists for pluginId", () => {
    const result = isCapabilityAccepted("gmail-triage", currentHash());
    expect(result).toEqual({ accepted: false, reason: "not_accepted" });
  });

  // 17. Hash matches → accepted: true
  it("17. Returns accepted: true when entry exists and hash matches", () => {
    const hash = currentHash();
    writePluginsLock("gmail-triage", makeEntry({ manifestHash: hash }));
    const result = isCapabilityAccepted("gmail-triage", hash);
    expect(result).toEqual({ accepted: true });
  });

  // 18. Hash drift → not_accepted + reason: hash_drift + acceptedHash
  it("18. Returns hash_drift when entry exists but hash has changed", () => {
    const oldHash = "sha256:" + "b".repeat(64);
    const newHash = currentHash();
    expect(oldHash).not.toBe(newHash); // sanity

    writePluginsLock("gmail-triage", makeEntry({ manifestHash: oldHash }));
    const result = isCapabilityAccepted("gmail-triage", newHash);

    expect(result).toEqual({
      accepted: false,
      reason: "hash_drift",
      acceptedHash: oldHash,
    });
  });
});

// ---------------------------------------------------------------------------
// Section 5b: TDR-037 two-path trust model — self-extension bypass
// ---------------------------------------------------------------------------

describe("capability-check — isCapabilityAccepted self-extension bypass (TDR-037)", () => {
  const chatToolsManifest = (overrides: Record<string, unknown> = {}) => ({
    id: "test-plugin",
    version: "0.1.0",
    apiVersion: "0.14",
    kind: "chat-tools" as const,
    capabilities: ["net"],
    ...overrides,
  });

  const pluginRoot = () => path.join(tmpDir, "plugins", "test-plugin");

  it("Self-extension: origin='ainative-internal' returns accepted: true with trustPath='self' and never reads lockfile", () => {
    // Deliberately write a lockfile with the WRONG hash to prove the bypass
    // does not consult it. If the classifier misfires, the hash_drift branch
    // would flag it.
    writePluginsLock("test-plugin", makeEntry({ manifestHash: "sha256:" + "z".repeat(64) }));

    const manifest = chatToolsManifest({
      origin: "ainative-internal",
      capabilities: ["fs", "net"],
    });
    const result = isCapabilityAccepted("test-plugin", "sha256:" + "a".repeat(64), {
      manifest,
      rootDir: pluginRoot(),
    });

    expect(result).toEqual({ accepted: true, trustPath: "self" });
  });

  it("Self-extension: author='ainative' returns accepted: true with trustPath='self'", () => {
    const manifest = chatToolsManifest({ author: "ainative", capabilities: ["fs"] });
    const result = isCapabilityAccepted("test-plugin", "sha256:any", {
      manifest,
      rootDir: pluginRoot(),
    });
    expect(result).toEqual({ accepted: true, trustPath: "self" });
  });

  it("Self-extension: empty capabilities returns accepted: true with trustPath='self'", () => {
    const manifest = chatToolsManifest({ capabilities: [] });
    const result = isCapabilityAccepted("test-plugin", "sha256:any", {
      manifest,
      rootDir: pluginRoot(),
    });
    expect(result).toEqual({ accepted: true, trustPath: "self" });
  });

  it("Third-party path: omitted manifest → legacy lockfile behavior (no trustPath field)", () => {
    // No manifest → classifier cannot run → fall through to the original
    // lockfile-based path. Backward-compat for any legacy callers that don't
    // pass the new opts.
    const result = isCapabilityAccepted("test-plugin", "sha256:" + "a".repeat(64));
    expect(result).toEqual({ accepted: false, reason: "not_accepted" });
    expect(result).not.toHaveProperty("trustPath");
  });

  it("Third-party path: foreign author + non-empty caps + no origin → lockfile consulted", () => {
    const manifest = chatToolsManifest({
      author: "untrusted-dev",
      capabilities: ["fs", "net"],
    });
    const result = isCapabilityAccepted("test-plugin", "sha256:any", {
      manifest,
      rootDir: pluginRoot(),
      userIdentity: "alice@example.com",
    });
    // Lockfile has no entry → not_accepted. Importantly, no trustPath field.
    expect(result).toEqual({ accepted: false, reason: "not_accepted" });
  });

  it("Settings 'strict' mode forces lockfile consultation even for self-extension manifests", () => {
    const manifest = chatToolsManifest({ origin: "ainative-internal" });
    const result = isCapabilityAccepted("test-plugin", "sha256:any", {
      manifest,
      rootDir: pluginRoot(),
      trustModelSetting: "strict",
    });
    // Strict mode bypasses the classifier — lockfile is empty so not_accepted.
    expect(result).toEqual({ accepted: false, reason: "not_accepted" });
  });

  it("Settings 'off' mode accepts all plugins with trustPath='self' (trust-on-first-use)", () => {
    const manifest = chatToolsManifest({
      author: "untrusted-dev",
      capabilities: ["fs", "net", "child_process"],
    });
    const result = isCapabilityAccepted("test-plugin", "sha256:any", {
      manifest,
      rootDir: pluginRoot(),
      userIdentity: "alice@example.com",
      trustModelSetting: "off",
    });
    expect(result).toEqual({ accepted: true, trustPath: "self" });
  });

  it("Self-extension bypass does NOT write to plugins.lock (file remains absent)", () => {
    // Assert lockfile untouched per TDR-037 — self-extension skips lockfile I/O.
    expect(fs.existsSync(lockPath())).toBe(false);
    const manifest = chatToolsManifest({ origin: "ainative-internal" });
    isCapabilityAccepted("test-plugin", "sha256:any", {
      manifest,
      rootDir: pluginRoot(),
    });
    // Still absent after the check — no write occurred.
    expect(fs.existsSync(lockPath())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 6: T10 per-tool approval overlay
// ---------------------------------------------------------------------------

describe("capability-check — setPluginToolApproval", () => {
  it("round-trips a per-tool approval through the lockfile", () => {
    writePluginsLock("echo", makeEntry());
    setPluginToolApproval("echo", "mcp__echo-server__echo", "never");
    const lock = readPluginsLock();
    expect(lock.accepted.echo.toolApprovals).toEqual({
      "mcp__echo-server__echo": "never",
    });
  });

  it("preserves manifestHash/capabilities/acceptedAt/acceptedBy", () => {
    const entry = makeEntry({
      manifestHash: "sha256:" + "c".repeat(64),
      capabilities: ["fs", "net"],
      acceptedAt: "2026-04-01T00:00:00Z",
      acceptedBy: "alice",
    });
    writePluginsLock("echo", entry);
    setPluginToolApproval("echo", "mcp__echo-server__echo", "approve");
    const lock = readPluginsLock();
    expect(lock.accepted.echo.manifestHash).toBe(entry.manifestHash);
    expect(lock.accepted.echo.capabilities).toEqual(entry.capabilities);
    expect(lock.accepted.echo.acceptedAt).toBe(entry.acceptedAt);
    expect(lock.accepted.echo.acceptedBy).toBe(entry.acceptedBy);
    expect(lock.accepted.echo.toolApprovals).toEqual({
      "mcp__echo-server__echo": "approve",
    });
  });

  it("merges repeated calls into a single toolApprovals map", () => {
    writePluginsLock("echo", makeEntry());
    setPluginToolApproval("echo", "mcp__echo-server__echo", "never");
    setPluginToolApproval("echo", "mcp__echo-server__shout", "approve");
    setPluginToolApproval("echo", "mcp__echo-server__echo", "prompt"); // overwrite
    const lock = readPluginsLock();
    expect(lock.accepted.echo.toolApprovals).toEqual({
      "mcp__echo-server__echo": "prompt",
      "mcp__echo-server__shout": "approve",
    });
  });

  it("throws when the plugin has no lockfile entry", () => {
    expect(() =>
      setPluginToolApproval("not-installed", "mcp__x__y", "never"),
    ).toThrow(/not in plugins\.lock/);
  });
});

describe("capability-check — getPluginToolApprovalMode", () => {
  it("returns null for a missing plugin entry", () => {
    expect(getPluginToolApprovalMode("missing", "mcp__x__y")).toBeNull();
  });

  it("returns 'prompt' default when no override and no manifest default", () => {
    writePluginsLock("echo", makeEntry());
    const mode = getPluginToolApprovalMode("echo", "mcp__echo-server__echo");
    expect(mode).toBe("prompt");
  });

  it("returns lockfile override when present", () => {
    writePluginsLock("echo", makeEntry());
    setPluginToolApproval("echo", "mcp__echo-server__echo", "never");
    const mode = getPluginToolApprovalMode(
      "echo",
      "mcp__echo-server__echo",
      "approve", // manifest default should be ignored in favour of override
    );
    expect(mode).toBe("never");
  });

  it("returns manifest default when no override is set", () => {
    writePluginsLock("echo", makeEntry());
    const mode = getPluginToolApprovalMode(
      "echo",
      "mcp__echo-server__echo",
      "never",
    );
    expect(mode).toBe("never");
  });
});

describe("capability-check — resolvePluginToolApproval", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/plugins/mcp-loader");
    vi.resetModules();
  });

  it("returns null for non-mcp tool names", async () => {
    expect(await resolvePluginToolApproval("Read")).toBeNull();
    expect(await resolvePluginToolApproval("Bash")).toBeNull();
  });

  it("returns null for malformed mcp names (no separator after server)", async () => {
    expect(await resolvePluginToolApproval("mcp__bare")).toBeNull();
    expect(await resolvePluginToolApproval("mcp__")).toBeNull();
  });

  it("returns null when no registration matches", async () => {
    // No mocks — the real mcp-loader will return [] (empty plugins dir).
    const mode = await resolvePluginToolApproval("mcp__nonexistent__tool");
    expect(mode).toBeNull();
  });

  it("resolves to lockfile override for an accepted plugin", async () => {
    // Mock listPluginMcpRegistrations to simulate an accepted plugin/server.
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      listPluginMcpRegistrations: vi.fn().mockResolvedValue([
        {
          pluginId: "echo",
          serverName: "echo-server",
          transport: "stdio",
          config: { command: "node" },
          status: "accepted",
        },
      ]),
    }));

    writePluginsLock("echo", makeEntry());
    setPluginToolApproval("echo", "mcp__echo-server__echo", "never");

    // Re-import via the moduleId after vi.doMock (ESM-friendly).
    const { resolvePluginToolApproval: reImported } = await import(
      "../capability-check"
    );
    const mode = await reImported("mcp__echo-server__echo");
    expect(mode).toBe("never");
  });

  it("falls back to 'prompt' default when no override and no manifest default", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      listPluginMcpRegistrations: vi.fn().mockResolvedValue([
        {
          pluginId: "echo",
          serverName: "echo-server",
          transport: "stdio",
          config: { command: "node" },
          status: "accepted",
        },
      ]),
    }));

    writePluginsLock("echo", makeEntry());
    // No plugin.yaml on disk → no manifest default → falls back to "prompt".

    const { resolvePluginToolApproval: reImported } = await import(
      "../capability-check"
    );
    const mode = await reImported("mcp__echo-server__fresh-tool");
    expect(mode).toBe("prompt");
  });

  it("reads manifest defaultToolApproval when no override is set", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      listPluginMcpRegistrations: vi.fn().mockResolvedValue([
        {
          pluginId: "echo",
          serverName: "echo-server",
          transport: "stdio",
          config: { command: "node" },
          status: "accepted",
        },
      ]),
    }));

    // Write a plugin.yaml with defaultToolApproval: never.
    const pluginDir = path.join(tmpDir, "plugins", "echo");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "plugin.yaml"),
      [
        "id: echo",
        'version: "1.0.0"',
        'apiVersion: "0.15"',
        "kind: chat-tools",
        "capabilities:",
        "  - net",
        "defaultToolApproval: never",
        "",
      ].join("\n"),
    );

    writePluginsLock("echo", makeEntry());
    // No override set — the manifest's defaultToolApproval should win.

    const { resolvePluginToolApproval: reImported } = await import(
      "../capability-check"
    );
    const mode = await reImported("mcp__echo-server__echo");
    expect(mode).toBe("never");
  });

  it("ignores registrations whose status is not 'accepted'", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      listPluginMcpRegistrations: vi.fn().mockResolvedValue([
        {
          pluginId: "echo",
          serverName: "echo-server",
          transport: "stdio",
          config: {},
          status: "disabled",
          disabledReason: "server_not_found",
        },
      ]),
    }));

    writePluginsLock("echo", makeEntry());
    setPluginToolApproval("echo", "mcp__echo-server__echo", "never");

    const { resolvePluginToolApproval: reImported } = await import(
      "../capability-check"
    );
    const mode = await reImported("mcp__echo-server__echo");
    expect(mode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Section 7: T11 capability expiry (opt-in)
// ---------------------------------------------------------------------------

describe("capability-check — T11 expiry / isCapabilityAccepted", () => {
  const yamlContent = makeYaml({ capabilities: ["net"] });
  const currentHash = () => deriveManifestHash(yamlContent);

  it("returns accepted: true when expiresAt is in the future and hash matches", () => {
    const hash = currentHash();
    const future = new Date(Date.now() + 60 * 86_400_000).toISOString();
    writePluginsLock("echo", makeEntry({ manifestHash: hash, expiresAt: future }));

    const result = isCapabilityAccepted("echo", hash);
    expect(result).toEqual({ accepted: true });
  });

  it("returns accepted: true when no expiresAt is set (default behavior)", () => {
    const hash = currentHash();
    // makeEntry() by default has no expiresAt.
    writePluginsLock("echo", makeEntry({ manifestHash: hash }));

    const result = isCapabilityAccepted("echo", hash);
    expect(result).toEqual({ accepted: true });
  });

  it("returns { accepted: false, reason: 'expired', expiresAt } when expiresAt is in the past", () => {
    const hash = currentHash();
    const past = new Date(Date.now() - 1_000).toISOString();
    writePluginsLock("echo", makeEntry({ manifestHash: hash, expiresAt: past }));

    const result = isCapabilityAccepted("echo", hash);
    expect(result).toEqual({
      accepted: false,
      reason: "expired",
      expiresAt: past,
    });
  });

  it("hash_drift takes precedence over expired when BOTH conditions trigger", () => {
    // Entry has an old hash AND an expired expiresAt — hash_drift should win
    // because it's the more actionable re-accept signal.
    const oldHash = "sha256:" + "e".repeat(64);
    const newHash = currentHash();
    const past = new Date(Date.now() - 1_000).toISOString();

    writePluginsLock("echo", makeEntry({ manifestHash: oldHash, expiresAt: past }));
    const result = isCapabilityAccepted("echo", newHash);

    expect(result).toEqual({
      accepted: false,
      reason: "hash_drift",
      acceptedHash: oldHash,
    });
  });

  it("treats an unparseable expiresAt as 'no expiry' (belt-and-suspenders guard)", () => {
    const hash = currentHash();
    // Simulate a hand-edited lock with a bogus expiresAt string.
    writePluginsLock(
      "echo",
      makeEntry({ manifestHash: hash, expiresAt: "not-a-date" }),
    );

    const result = isCapabilityAccepted("echo", hash);
    expect(result).toEqual({ accepted: true });
  });
});

describe("capability-check — setPluginAcceptExpiry", () => {
  it("writes expiresAt ≈ now + days*86400_000 (ISO 8601) and returns the same string", () => {
    writePluginsLock("echo", makeEntry());

    const before = Date.now();
    const returned = setPluginAcceptExpiry("echo", 30);
    const after = Date.now();

    const lock = readPluginsLock();
    expect(lock.accepted.echo.expiresAt).toBe(returned);
    // ISO 8601 sanity.
    expect(returned).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    const parsed = Date.parse(returned);
    // Must fall within the [before+30d, after+30d] window.
    expect(parsed).toBeGreaterThanOrEqual(before + 30 * 86_400_000);
    expect(parsed).toBeLessThanOrEqual(after + 30 * 86_400_000);
  });

  it("preserves manifestHash, capabilities, acceptedAt, acceptedBy, and toolApprovals", () => {
    const entry = makeEntry({
      manifestHash: "sha256:" + "f".repeat(64),
      capabilities: ["fs", "net"],
      acceptedAt: "2026-04-01T00:00:00Z",
      acceptedBy: "alice",
    });
    writePluginsLock("echo", entry);
    // Add a tool approval first — setPluginAcceptExpiry must not clobber it.
    setPluginToolApproval("echo", "mcp__echo-server__echo", "never");

    setPluginAcceptExpiry("echo", 90);

    const lock = readPluginsLock();
    expect(lock.accepted.echo.manifestHash).toBe(entry.manifestHash);
    expect(lock.accepted.echo.capabilities).toEqual(entry.capabilities);
    expect(lock.accepted.echo.acceptedAt).toBe(entry.acceptedAt);
    expect(lock.accepted.echo.acceptedBy).toBe(entry.acceptedBy);
    expect(lock.accepted.echo.toolApprovals).toEqual({
      "mcp__echo-server__echo": "never",
    });
    expect(lock.accepted.echo.expiresAt).toBeDefined();
  });

  it("throws when the plugin has no lockfile entry (must accept first)", () => {
    expect(() => setPluginAcceptExpiry("not-installed", 30)).toThrow(
      /not in plugins\.lock/,
    );
  });

  it("accepts all four allowed day values (30, 90, 180, 365)", () => {
    writePluginsLock("echo", makeEntry());
    // Each call overwrites expiresAt; just assert no throw.
    for (const days of [30, 90, 180, 365] as const) {
      const expiresAt = setPluginAcceptExpiry("echo", days);
      expect(expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("round-trip via lockfile: days: 30 → expiresAt ≈ now + 30d", () => {
    writePluginsLock("echo", makeEntry());
    const before = Date.now();
    setPluginAcceptExpiry("echo", 30);
    const after = Date.now();

    // Re-read lock from disk to prove persistence.
    const lock = readPluginsLock();
    const expiresAt = lock.accepted.echo.expiresAt!;
    const parsed = Date.parse(expiresAt);
    expect(parsed).toBeGreaterThanOrEqual(before + 30 * 86_400_000);
    expect(parsed).toBeLessThanOrEqual(after + 30 * 86_400_000);
  });
});

// ---------------------------------------------------------------------------
// Section 8: T12 revocation flow
// ---------------------------------------------------------------------------

describe("capability-check — revokePluginCapabilities (T12)", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/plugins/mcp-loader");
    vi.doUnmock("@/lib/plugins/transport-dispatch");
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/db/schema");
    vi.resetModules();
  });

  it("removes the lockfile entry for the target plugin", async () => {
    // No DB mocks needed — the DB insert is best-effort and errors are
    // caught; the assertion here is about the lockfile effect.
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    writePluginsLock("echo", makeEntry());
    expect(readPluginsLock().accepted.echo).toBeDefined();

    const { revokePluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    const result = await reImported("echo");

    expect(result).toEqual({ revoked: true, bustedEntries: [] });
    expect(readPluginsLock().accepted.echo).toBeUndefined();
  });

  it("is a no-op returning { revoked: false, reason: 'no_entry' } when plugin has no lockfile entry", async () => {
    const result = await revokePluginCapabilities("never-installed");
    expect(result).toEqual({ revoked: false, reason: "no_entry" });
    // And the lockfile is still empty — no side effects.
    expect(readPluginsLock().accepted).toEqual({});
  });

  it("does not affect other plugins' lockfile entries", async () => {
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    writePluginsLock("a", makeEntry({ capabilities: ["net"] }));
    writePluginsLock("b", makeEntry({ capabilities: ["fs"] }));

    const { revokePluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    await reImported("a");

    const lock = readPluginsLock();
    expect(lock.accepted.a).toBeUndefined();
    expect(lock.accepted.b).toBeDefined();
    expect(lock.accepted.b.capabilities).toEqual(["fs"]);
  });

  it("inserts an Inbox notification (type: agent_message) confirming the revoke", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    const insertSpy = vi.fn(() => ({ values: valuesSpy }));
    vi.doMock("@/lib/db", () => ({
      db: { insert: insertSpy },
    }));
    const notificationsSentinel = { __table: "notifications" };
    vi.doMock("@/lib/db/schema", () => ({
      notifications: notificationsSentinel,
    }));

    writePluginsLock("echo", makeEntry());

    const { revokePluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    await reImported("echo");

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(notificationsSentinel);
    expect(valuesSpy).toHaveBeenCalledTimes(1);

    const row = valuesSpy.mock.calls[0][0];
    expect(row.type).toBe("agent_message");
    expect(row.title).toBe("Plugin capabilities revoked: echo");
    expect(row.read).toBe(false);
    expect(row.taskId).toBeNull();
    expect(typeof row.id).toBe("string");
    expect(row.createdAt).toBeInstanceOf(Date);

    const body = JSON.parse(row.body);
    expect(body.pluginId).toBe("echo");
    expect(body.action).toBe("revoked");
    expect(typeof body.reAcceptHint).toBe("string");
    expect(body.reAcceptHint).toMatch(/grant_plugin_capabilities/);
  });

  it("busts require.cache for in-process SDK registrations of the revoked plugin", async () => {
    const mockedEntryPath = "/abs/path/to/sdk-entry.js";
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      listAcceptedInProcessEntriesForPlugin: vi
        .fn()
        .mockResolvedValue([mockedEntryPath]),
    }));
    const bustSpy = vi.fn();
    vi.doMock("@/lib/plugins/transport-dispatch", () => ({
      bustInProcessServerCache: bustSpy,
    }));
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    writePluginsLock("echo", makeEntry());

    const { revokePluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    const result = await reImported("echo");

    expect(result).toEqual({
      revoked: true,
      bustedEntries: [mockedEntryPath],
    });
    expect(bustSpy).toHaveBeenCalledTimes(1);
    expect(bustSpy).toHaveBeenCalledWith(mockedEntryPath);
  });

  it("does not call bustInProcessServerCache when plugin has no in-process entries", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      listAcceptedInProcessEntriesForPlugin: vi.fn().mockResolvedValue([]),
    }));
    const bustSpy = vi.fn();
    vi.doMock("@/lib/plugins/transport-dispatch", () => ({
      bustInProcessServerCache: bustSpy,
    }));
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    writePluginsLock("echo", makeEntry());

    const { revokePluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    const result = await reImported("echo");

    expect(result).toEqual({ revoked: true, bustedEntries: [] });
    expect(bustSpy).not.toHaveBeenCalled();
  });

  it("logs the revocation to plugins.log", async () => {
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    writePluginsLock("echo", makeEntry());

    const { revokePluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    await reImported("echo");

    expect(fs.existsSync(logsPath())).toBe(true);
    const log = fs.readFileSync(logsPath(), "utf-8");
    expect(log).toMatch(
      /\[capability-check\] plugin echo capabilities revoked by /,
    );
  });
});

// ---------------------------------------------------------------------------
// Section 9: T15 grantPluginCapabilities
// ---------------------------------------------------------------------------

describe("capability-check — grantPluginCapabilities (T15)", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/plugins/mcp-loader");
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/db/schema");
    vi.resetModules();
  });

  // Helper: write a plugin.yaml to <tmpDir>/plugins/<id>/plugin.yaml
  function writePluginYamlOnDisk(
    id: string,
    overrides: Record<string, unknown> = {},
  ): string {
    const pluginDir = path.join(tmpDir, "plugins", id);
    fs.mkdirSync(pluginDir, { recursive: true });
    const manifest: Record<string, unknown> = {
      id,
      version: "1.0.0",
      apiVersion: "0.15",
      kind: "chat-tools",
      capabilities: ["net"],
      ...overrides,
    };
    const lines: string[] = [];
    for (const [key, val] of Object.entries(manifest)) {
      if (Array.isArray(val)) {
        lines.push(`${key}:`);
        for (const item of val) lines.push(`  - ${item}`);
      } else if (
        typeof val === "string" &&
        /^\d+(\.\d+)+$/.test(val)
      ) {
        lines.push(`${key}: "${val}"`);
      } else {
        lines.push(`${key}: ${val}`);
      }
    }
    const content = lines.join("\n") + "\n";
    fs.writeFileSync(path.join(pluginDir, "plugin.yaml"), content);
    return content;
  }

  it("returns { granted: false, reason: 'not_found' } when plugin.yaml is missing", async () => {
    const result = await grantPluginCapabilities("nonexistent");
    expect(result).toEqual({ granted: false, reason: "not_found" });
  });

  it("returns { granted: false, reason: 'not_chat_tools' } when manifest kind is primitives-bundle", async () => {
    const pluginDir = path.join(tmpDir, "plugins", "kind5-bundle");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "plugin.yaml"),
      [
        "id: kind5-bundle",
        'version: "1.0.0"',
        'apiVersion: "0.15"',
        "kind: primitives-bundle",
        "",
      ].join("\n"),
    );

    const result = await grantPluginCapabilities("kind5-bundle");
    expect(result).toEqual({
      granted: false,
      reason: "not_chat_tools",
      detail: expect.stringContaining("primitives-bundle"),
    });
  });

  it("writes a lockfile entry with the correct hash + capabilities on a valid chat-tools plugin", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      reloadPluginMcpRegistrations: vi
        .fn()
        .mockResolvedValue({ bustedInProcessEntries: [], registrations: [] }),
    }));
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    const content = writePluginYamlOnDisk("alpha", {
      capabilities: ["net", "fs"],
    });
    const expectedHash = deriveManifestHash(content);

    const { grantPluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    const result = await reImported("alpha");

    expect(result).toEqual({
      granted: true,
      hash: expectedHash,
      bustedInProcessEntries: [],
    });

    const lock = readPluginsLock();
    expect(lock.accepted.alpha.manifestHash).toBe(expectedHash);
    expect(lock.accepted.alpha.capabilities).toEqual(["net", "fs"]);
    expect(typeof lock.accepted.alpha.acceptedAt).toBe("string");
    expect(typeof lock.accepted.alpha.acceptedBy).toBe("string");
  });

  it("succeeds when expectedHash matches the current manifest hash", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      reloadPluginMcpRegistrations: vi
        .fn()
        .mockResolvedValue({ bustedInProcessEntries: [], registrations: [] }),
    }));
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    const content = writePluginYamlOnDisk("beta");
    const currentHash = deriveManifestHash(content);

    const { grantPluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    const result = await reImported("beta", { expectedHash: currentHash });

    expect(result).toMatchObject({ granted: true, hash: currentHash });
  });

  it("rejects with { granted: false, reason: 'hash_drift', currentHash } when expectedHash differs", async () => {
    const content = writePluginYamlOnDisk("gamma");
    const currentHash = deriveManifestHash(content);
    const staleHash = "sha256:" + "0".repeat(64);

    const result = await grantPluginCapabilities("gamma", {
      expectedHash: staleHash,
    });
    expect(result).toEqual({
      granted: false,
      reason: "hash_drift",
      currentHash,
    });
    // Lockfile should NOT have been written.
    expect(readPluginsLock().accepted.gamma).toBeUndefined();
  });

  it("preserves pre-existing toolApprovals and expiresAt from a prior lockfile entry", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      reloadPluginMcpRegistrations: vi
        .fn()
        .mockResolvedValue({ bustedInProcessEntries: [], registrations: [] }),
    }));
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    const content = writePluginYamlOnDisk("delta");
    const priorExpiry = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const priorToolApprovals = {
      "mcp__delta-server__tool": "never" as const,
    };

    // Seed a prior entry (e.g. a previous grant that had user-set overrides).
    writePluginsLock("delta", {
      manifestHash: "sha256:" + "9".repeat(64), // doesn't matter — grant overwrites
      capabilities: ["fs"], // doesn't matter — grant overwrites
      acceptedAt: "2026-01-01T00:00:00Z",
      acceptedBy: "earlier-user",
      toolApprovals: priorToolApprovals,
      expiresAt: priorExpiry,
    });

    const { grantPluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    const result = await reImported("delta");
    expect(result.granted).toBe(true);

    const lock = readPluginsLock();
    expect(lock.accepted.delta.manifestHash).toBe(deriveManifestHash(content));
    // Capabilities reflect the NEW manifest, not the prior one.
    expect(lock.accepted.delta.capabilities).toEqual(["net"]);
    // toolApprovals + expiresAt SURVIVED the re-grant.
    expect(lock.accepted.delta.toolApprovals).toEqual(priorToolApprovals);
    expect(lock.accepted.delta.expiresAt).toBe(priorExpiry);
  });

  it("inserts an Inbox notification (type: agent_message) confirming the grant", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      reloadPluginMcpRegistrations: vi
        .fn()
        .mockResolvedValue({ bustedInProcessEntries: [], registrations: [] }),
    }));
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    const insertSpy = vi.fn(() => ({ values: valuesSpy }));
    vi.doMock("@/lib/db", () => ({ db: { insert: insertSpy } }));
    const notificationsSentinel = { __table: "notifications" };
    vi.doMock("@/lib/db/schema", () => ({
      notifications: notificationsSentinel,
    }));

    const content = writePluginYamlOnDisk("epsilon", { capabilities: ["env"] });
    const expectedHash = deriveManifestHash(content);

    const { grantPluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    await reImported("epsilon");

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(notificationsSentinel);
    expect(valuesSpy).toHaveBeenCalledTimes(1);

    const row = valuesSpy.mock.calls[0][0];
    expect(row.type).toBe("agent_message");
    expect(row.title).toBe("Plugin capabilities granted: epsilon");
    expect(row.read).toBe(false);
    expect(row.taskId).toBeNull();
    expect(typeof row.id).toBe("string");
    expect(row.createdAt).toBeInstanceOf(Date);

    const body = JSON.parse(row.body);
    expect(body.pluginId).toBe("epsilon");
    expect(body.action).toBe("granted");
    expect(body.hash).toBe(expectedHash);
    expect(body.capabilities).toEqual(["env"]);
  });

  it("calls reloadPluginMcpRegistrations and surfaces bustedInProcessEntries in the result", async () => {
    const bustedPath = "/abs/path/to/entry.js";
    const reloadSpy = vi.fn().mockResolvedValue({
      bustedInProcessEntries: [bustedPath],
      registrations: [],
    });
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      reloadPluginMcpRegistrations: reloadSpy,
    }));
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    writePluginYamlOnDisk("zeta");

    const { grantPluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    const result = await reImported("zeta");

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledWith("zeta");
    expect(result).toMatchObject({
      granted: true,
      bustedInProcessEntries: [bustedPath],
    });
  });

  it("logs the grant to plugins.log", async () => {
    vi.doMock("@/lib/plugins/mcp-loader", () => ({
      reloadPluginMcpRegistrations: vi
        .fn()
        .mockResolvedValue({ bustedInProcessEntries: [], registrations: [] }),
    }));
    vi.doMock("@/lib/db", () => ({ db: {} }));
    vi.doMock("@/lib/db/schema", () => ({ notifications: {} }));

    writePluginYamlOnDisk("eta");

    const { grantPluginCapabilities: reImported } = await import(
      "../capability-check"
    );
    await reImported("eta");

    expect(fs.existsSync(logsPath())).toBe(true);
    const log = fs.readFileSync(logsPath(), "utf-8");
    expect(log).toMatch(
      /\[capability-check\] plugin eta capabilities granted by /,
    );
  });
});
