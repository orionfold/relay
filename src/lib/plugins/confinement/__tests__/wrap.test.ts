/**
 * wrap.test.ts — T14 confinement wrap helper unit tests.
 *
 * Covers:
 *   - mode "none"        → pass-through
 *   - mode "seatbelt"    → darwin-only; policy composition; Linux = unsupported
 *   - mode "apparmor"    → linux-only with profile file on disk; darwin = unsupported
 *   - mode "docker"      → requires dockerImage + docker binary; network + volume
 *   - dockerBootSweep    → execFileSync mocked; docker ps + docker kill chaining
 *
 * The execFileSync boundary is the *only* child_process call path in wrap.ts.
 * Tests mock it via vi.mock("node:child_process").
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock node:child_process BEFORE importing wrap.ts so execFileSync is stubbed.
// vi.hoisted ensures the mock fn is created before vi.mock's factory runs.
const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    default: { ...actual, execFileSync: execFileSyncMock },
    execFileSync: execFileSyncMock,
  };
});

import {
  wrapStdioSpawn,
  dockerBootSweep,
  type WrapInput,
} from "../wrap";

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrap-test-"));
  process.env.RELAY_DATA_DIR = tmpDir;
  // TDR-037 — confinement is PARKED behind the flag by default. These
  // tests exercise the wrap logic when the flag is ON. A separate describe
  // block below asserts the parked (OFF) behavior.
  process.env.RELAY_PLUGIN_CONFINEMENT = "1";
  execFileSyncMock.mockReset();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.RELAY_DATA_DIR;
  delete process.env.RELAY_PLUGIN_CONFINEMENT;
});

function makeInput(overrides: Partial<WrapInput> = {}): WrapInput {
  return {
    command: "/usr/bin/node",
    args: ["server.js", "--port", "3001"],
    env: { FOO: "bar" },
    pluginId: "test-plugin",
    pluginDir: path.join(tmpDir, "plugins", "test-plugin"),
    confinementMode: "none",
    capabilities: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mode "none"
// ---------------------------------------------------------------------------

describe("wrapStdioSpawn — mode: none", () => {
  it("returns the input unchanged", () => {
    const input = makeInput({ confinementMode: "none" });
    const result = wrapStdioSpawn(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wrapped.command).toBe("/usr/bin/node");
    expect(result.wrapped.args).toEqual(["server.js", "--port", "3001"]);
    expect(result.wrapped.env).toEqual({ FOO: "bar" });
    expect(result.describe).toContain("none");
  });

  it("describe includes the original command", () => {
    const input = makeInput({ confinementMode: "none" });
    const result = wrapStdioSpawn(input);
    if (!result.ok) throw new Error("expected ok");
    expect(result.describe).toContain("/usr/bin/node");
  });
});

// ---------------------------------------------------------------------------
// Mode "seatbelt"
// ---------------------------------------------------------------------------

describe("wrapStdioSpawn — mode: seatbelt", () => {
  it("returns unsupported on linux", () => {
    const input = makeInput({ confinementMode: "seatbelt", capabilities: ["net"] });
    const result = wrapStdioSpawn(input, "linux");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("confinement_unsupported_on_platform");
    expect(result.detail).toContain("macOS");
  });

  it("returns unsupported on win32", () => {
    const input = makeInput({ confinementMode: "seatbelt", capabilities: ["fs"] });
    const result = wrapStdioSpawn(input, "win32");
    expect(result.ok).toBe(false);
  });

  it("on darwin with [net] returns sandbox-exec command with policy + original cmd at tail", () => {
    const input = makeInput({
      confinementMode: "seatbelt",
      capabilities: ["net"],
    });
    const result = wrapStdioSpawn(input, "darwin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wrapped.command).toBe("sandbox-exec");
    // args: ["-p", "<policy>", "/usr/bin/node", "server.js", "--port", "3001"]
    expect(result.wrapped.args[0]).toBe("-p");
    expect(typeof result.wrapped.args[1]).toBe("string");
    expect(result.wrapped.args[1]).toContain("(version 1)");
    expect(result.wrapped.args[1]).toContain("(deny default)");
    // Net profile content should be merged in.
    expect(result.wrapped.args[1]).toContain("network*");
    // Original command + args at the tail.
    expect(result.wrapped.args.slice(2)).toEqual([
      "/usr/bin/node",
      "server.js",
      "--port",
      "3001",
    ]);
  });

  it("on darwin with multiple capabilities concatenates per-capability profiles", () => {
    const input = makeInput({
      confinementMode: "seatbelt",
      capabilities: ["net", "fs"],
    });
    const result = wrapStdioSpawn(input, "darwin");
    if (!result.ok) throw new Error("expected ok");
    const policy = result.wrapped.args[1];
    // Net-specific content present.
    expect(policy).toContain("network*");
    // Fs-specific content present (file-write rule).
    expect(policy).toContain("file-write*");
  });

  it("describe mentions seatbelt + capability list", () => {
    const input = makeInput({
      confinementMode: "seatbelt",
      capabilities: ["fs", "env"],
    });
    const result = wrapStdioSpawn(input, "darwin");
    if (!result.ok) throw new Error("expected ok");
    expect(result.describe).toContain("seatbelt");
    expect(result.describe).toContain("darwin");
    expect(result.describe).toContain("fs,env");
  });
});

// ---------------------------------------------------------------------------
// Mode "apparmor"
// ---------------------------------------------------------------------------

describe("wrapStdioSpawn — mode: apparmor", () => {
  it("returns unsupported on darwin", () => {
    const input = makeInput({ confinementMode: "apparmor", capabilities: ["fs"] });
    const result = wrapStdioSpawn(input, "darwin");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("confinement_unsupported_on_platform");
    expect(result.detail).toContain("Linux");
  });

  it("returns unsupported when no capabilities declared", () => {
    const input = makeInput({ confinementMode: "apparmor", capabilities: [] });
    const result = wrapStdioSpawn(input, "linux");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain("at least one declared capability");
  });

  it("returns unsupported when profile file is not installed", () => {
    // /etc/apparmor.d/ainative-plugin-fs will NOT exist in the test environment.
    const input = makeInput({
      confinementMode: "apparmor",
      capabilities: ["fs"],
    });
    const result = wrapStdioSpawn(input, "linux");
    // Either unsupported (profile not installed) — that's the expected path
    // on CI without AppArmor setup. Accept either branch but not ok:true.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("confinement_unsupported_on_platform");
  });

  it("on linux with profile installed returns aa-exec wrap (mocked via fs.existsSync)", () => {
    const input = makeInput({
      confinementMode: "apparmor",
      capabilities: ["fs"],
    });
    // Stash and replace fs.existsSync so only the apparmor profile path is
    // reported as present. Real fs.existsSync is not needed for this code path
    // (apparmor wrap only checks the one profile file).
    const realExistsSync = fs.existsSync;
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation(((p: fs.PathLike) => {
      if (typeof p === "string" && p === "/etc/apparmor.d/ainative-plugin-fs") return true;
      return realExistsSync(p);
    }) as typeof fs.existsSync);

    try {
      const result = wrapStdioSpawn(input, "linux");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.wrapped.command).toBe("aa-exec");
      expect(result.wrapped.args).toEqual([
        "-p",
        "ainative-plugin-fs",
        "--",
        "/usr/bin/node",
        "server.js",
        "--port",
        "3001",
      ]);
    } finally {
      existsSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Mode "docker"
// ---------------------------------------------------------------------------

describe("wrapStdioSpawn — mode: docker", () => {
  it("returns unsupported without dockerImage", () => {
    const input = makeInput({ confinementMode: "docker", capabilities: ["net"] });
    const result = wrapStdioSpawn(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("confinement_unsupported_on_platform");
    expect(result.detail).toContain("dockerImage");
  });

  it("returns unsupported when docker binary missing (execFileSync throws)", () => {
    execFileSyncMock.mockImplementation((cmd: string) => {
      if (cmd === "docker") throw new Error("ENOENT: docker");
      return "";
    });
    const input = makeInput({
      confinementMode: "docker",
      capabilities: ["net"],
      dockerImage: "ainative/plugin-echo:1.0.0",
    });
    const result = wrapStdioSpawn(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain("docker not found");
  });

  it("returns --network bridge when [net] capability is declared", () => {
    execFileSyncMock.mockReturnValue(""); // docker --version ok
    const input = makeInput({
      confinementMode: "docker",
      capabilities: ["net"],
      dockerImage: "ainative/plugin-echo:1.0.0",
    });
    const result = wrapStdioSpawn(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wrapped.command).toBe("docker");
    const idx = result.wrapped.args.indexOf("--network");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(result.wrapped.args[idx + 1]).toBe("bridge");
  });

  it("returns --network none when [net] not declared", () => {
    execFileSyncMock.mockReturnValue("");
    const input = makeInput({
      confinementMode: "docker",
      capabilities: [],
      dockerImage: "ainative/plugin-echo:1.0.0",
    });
    const result = wrapStdioSpawn(input);
    if (!result.ok) throw new Error("expected ok");
    const idx = result.wrapped.args.indexOf("--network");
    expect(result.wrapped.args[idx + 1]).toBe("none");
  });

  it("adds -v <pluginDir>/state:/state when [fs] declared", () => {
    execFileSyncMock.mockReturnValue("");
    const pluginDir = path.join(tmpDir, "plugins", "docker-fs-plugin");
    const input = makeInput({
      confinementMode: "docker",
      capabilities: ["fs"],
      dockerImage: "ainative/plugin-echo:1.0.0",
      pluginDir,
    });
    const result = wrapStdioSpawn(input);
    if (!result.ok) throw new Error("expected ok");
    const vIdx = result.wrapped.args.indexOf("-v");
    expect(vIdx).toBeGreaterThanOrEqual(0);
    expect(result.wrapped.args[vIdx + 1]).toBe(`${pluginDir}/state:/state`);
    // State dir should have been created.
    expect(fs.existsSync(path.join(pluginDir, "state"))).toBe(true);
  });

  it("adds both --network bridge and -v mount when [net] + [fs]", () => {
    execFileSyncMock.mockReturnValue("");
    const input = makeInput({
      confinementMode: "docker",
      capabilities: ["net", "fs"],
      dockerImage: "ainative/plugin-echo:1.0.0",
    });
    const result = wrapStdioSpawn(input);
    if (!result.ok) throw new Error("expected ok");
    const netIdx = result.wrapped.args.indexOf("--network");
    expect(result.wrapped.args[netIdx + 1]).toBe("bridge");
    expect(result.wrapped.args.includes("-v")).toBe(true);
  });

  it("includes --label ainative-plugin=<id> and ainative-pid=<pid>", () => {
    execFileSyncMock.mockReturnValue("");
    const input = makeInput({
      confinementMode: "docker",
      capabilities: [],
      dockerImage: "ainative/plugin-echo:1.0.0",
      pluginId: "my-plugin",
    });
    const result = wrapStdioSpawn(input);
    if (!result.ok) throw new Error("expected ok");
    // Find all --label values.
    const labels: string[] = [];
    for (let i = 0; i < result.wrapped.args.length - 1; i++) {
      if (result.wrapped.args[i] === "--label") labels.push(result.wrapped.args[i + 1]);
    }
    expect(labels).toContain("ainative-plugin=my-plugin");
    expect(labels.some((l) => l.startsWith("ainative-pid="))).toBe(true);
  });

  it("translates env into -e KEY=VALUE flags", () => {
    execFileSyncMock.mockReturnValue("");
    const input = makeInput({
      confinementMode: "docker",
      capabilities: [],
      dockerImage: "img:1",
      env: { API_KEY: "secret", LOG_LEVEL: "debug" },
    });
    const result = wrapStdioSpawn(input);
    if (!result.ok) throw new Error("expected ok");
    const eArgs: string[] = [];
    for (let i = 0; i < result.wrapped.args.length - 1; i++) {
      if (result.wrapped.args[i] === "-e") eArgs.push(result.wrapped.args[i + 1]);
    }
    expect(eArgs).toContain("API_KEY=secret");
    expect(eArgs).toContain("LOG_LEVEL=debug");
    // -e flags replace env on wrapped; don't double-pass.
    expect(result.wrapped.env).toBeUndefined();
  });

  it("puts dockerImage + command + args at the tail of args", () => {
    execFileSyncMock.mockReturnValue("");
    const input = makeInput({
      confinementMode: "docker",
      capabilities: [],
      dockerImage: "my/image:tag",
      command: "/bin/echo",
      args: ["hello", "world"],
    });
    const result = wrapStdioSpawn(input);
    if (!result.ok) throw new Error("expected ok");
    const tail = result.wrapped.args.slice(-4);
    expect(tail).toEqual(["my/image:tag", "/bin/echo", "hello", "world"]);
  });
});

// ---------------------------------------------------------------------------
// Docker boot sweep
// ---------------------------------------------------------------------------

describe("dockerBootSweep", () => {
  it("returns quietly when docker not installed (execFileSync throws)", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("docker: command not found");
    });
    expect(() => dockerBootSweep()).not.toThrow();
    // Only one call attempted — the ps probe.
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("runs docker kill for each listed container id", () => {
    // First call: docker ps returns two short ids.
    execFileSyncMock.mockImplementationOnce(() => "abc123\ndef456\n");
    // Subsequent calls: docker kill succeeds.
    execFileSyncMock.mockReturnValue("");

    dockerBootSweep();

    // 1 ps + 2 kill = 3 total.
    expect(execFileSyncMock).toHaveBeenCalledTimes(3);
    // Arg shape: (cmd, args, opts)
    expect(execFileSyncMock.mock.calls[0][0]).toBe("docker");
    expect(execFileSyncMock.mock.calls[0][1]).toEqual([
      "ps",
      "--filter",
      "label=ainative-plugin",
      "--format",
      "{{.ID}}",
    ]);
    expect(execFileSyncMock.mock.calls[1][0]).toBe("docker");
    expect(execFileSyncMock.mock.calls[1][1]).toEqual(["kill", "abc123"]);
    expect(execFileSyncMock.mock.calls[2][1]).toEqual(["kill", "def456"]);
  });

  it("does not throw if docker kill fails partway through", () => {
    execFileSyncMock.mockImplementationOnce(() => "abc123\ndef456\n");
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("no such container");
    });
    execFileSyncMock.mockImplementationOnce(() => ""); // second kill ok
    expect(() => dockerBootSweep()).not.toThrow();
    expect(execFileSyncMock).toHaveBeenCalledTimes(3);
  });

  it("filters non-hex ids defensively (injection-proof)", () => {
    // Paranoid check — docker format normally always returns hex, but if the
    // output is ever tampered with (e.g. image name in format) skip it.
    execFileSyncMock.mockImplementationOnce(() => "abc123\nrm -rf /\nf00ba4\n");
    execFileSyncMock.mockReturnValue("");
    dockerBootSweep();
    // ps + 2 kill calls for the two valid hex ids. "rm -rf /" filtered out.
    expect(execFileSyncMock).toHaveBeenCalledTimes(3);
    expect(execFileSyncMock.mock.calls[1][1]).toEqual(["kill", "abc123"]);
    expect(execFileSyncMock.mock.calls[2][1]).toEqual(["kill", "f00ba4"]);
  });

  it("no-ops with zero containers listed", () => {
    execFileSyncMock.mockImplementationOnce(() => "");
    dockerBootSweep();
    // Just the ps call, no kill calls.
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TDR-037 — confinement parked by default (RELAY_PLUGIN_CONFINEMENT unset)
// ---------------------------------------------------------------------------

describe("confinement parked by default (TDR-037)", () => {
  beforeEach(() => {
    // These tests simulate a fresh process with no flag set.
    delete process.env.RELAY_PLUGIN_CONFINEMENT;
    execFileSyncMock.mockReset();
  });

  it("wrapStdioSpawn falls through to unconfined spawn when flag is unset (mode: seatbelt)", () => {
    const input: WrapInput = {
      command: "/usr/bin/node",
      args: ["server.js"],
      env: { FOO: "bar" },
      pluginId: "test-plugin",
      pluginDir: "/tmp/plugins/test",
      confinementMode: "seatbelt",
      capabilities: ["fs"],
    };
    const result = wrapStdioSpawn(input, "darwin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Command passes through unchanged — no sandbox-exec wrap applied.
      expect(result.wrapped.command).toBe("/usr/bin/node");
      expect(result.wrapped.args).toEqual(["server.js"]);
      expect(result.describe).toContain("confinement parked");
    }
  });

  it("wrapStdioSpawn falls through for docker mode too — no docker binary invoked", () => {
    const input: WrapInput = {
      command: "/usr/bin/node",
      args: ["server.js"],
      env: {},
      pluginId: "test-plugin",
      pluginDir: "/tmp/plugins/test",
      confinementMode: "docker",
      capabilities: ["net"],
      dockerImage: "python:3.12-slim",
    };
    const result = wrapStdioSpawn(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wrapped.command).toBe("/usr/bin/node");
      expect(result.describe).toContain("confinement parked");
    }
  });

  it("dockerBootSweep is a no-op when flag is unset (never invokes docker ps)", () => {
    dockerBootSweep();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });
});
