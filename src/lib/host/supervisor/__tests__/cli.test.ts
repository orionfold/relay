import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHostCommand } from "../cli";
import { FakeHostRuntimeAdapter } from "../runtime";
import { ACTIVE_NOW, HOST_CAPACITY, manifest, writeHostLicense } from "./helpers";

function capture() {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    io: { log: (message: string) => logs.push(message), error: (message: string) => errors.push(message) },
    logs,
    errors,
  };
}

describe("Relay Host CLI", () => {
  it("prints local-only help without initializing the Relay application", async () => {
    const output = capture();
    expect(await runHostCommand(["help"], output.io, { version: "0.43.0" })).toBe(0);
    expect(output.logs.join("\n")).toContain("Usage: relay host");
    expect(output.logs.join("\n")).not.toContain("next dev");
  });

  it("initializes, creates and inventories one Cell through the injected runtime", async () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-cli-"));
    try {
      const hostRoot = join(root, "host");
      const licenseDir = join(root, "licenses");
      const manifestPath = join(root, "cell.json");
      writeHostLicense(licenseDir);
      writeFileSync(manifestPath, JSON.stringify(manifest("cell-a", 4101)));
      const runtime = new FakeHostRuntimeAdapter();
      const dependencies = {
        version: "0.43.0",
        now: () => ACTIVE_NOW,
        runtimeFactory: () => runtime,
      };
      const init = capture();
      expect(await runHostCommand([
        "init",
        "--host-root", hostRoot,
        "--license-dir", licenseDir,
        "--host-id", "host-a",
        "--cpu-millis", String(HOST_CAPACITY.cpuMillis),
        "--memory-bytes", String(HOST_CAPACITY.memoryBytes),
        "--storage-bytes", String(HOST_CAPACITY.storageBytes),
      ], init.io, dependencies)).toBe(0);
      expect(JSON.parse(init.logs[0])).toMatchObject({ status: "ready", host: { hostId: "host-a" } });

      const create = capture();
      expect(await runHostCommand([
        "create",
        "--host-root", hostRoot,
        "--license-dir", licenseDir,
        "--manifest", manifestPath,
        "--operation-id", "op-cli-create",
      ], create.io, dependencies)).toBe(0);
      expect(JSON.parse(create.logs[0])).toMatchObject({ outcome: "succeeded", cellId: "cell-a" });

      const inventory = capture();
      expect(await runHostCommand([
        "inventory",
        "--host-root", hostRoot,
        "--license-dir", licenseDir,
      ], inventory.io, dependencies)).toBe(0);
      expect(JSON.parse(inventory.logs[0])).toMatchObject({
        host: { hostId: "host-a" },
        cells: [{ cellId: "cell-a", actualState: "stopped" }],
        runtime: [{ cellId: "cell-a", exists: true }],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("names invalid and unknown arguments", async () => {
    const missing = capture();
    expect(await runHostCommand(["start", "--cell-id"], missing.io, { version: "0.43.0" })).toBe(1);
    expect(missing.errors[0]).toContain("HOST_CLI_ARGUMENT_INVALID");

    const typo = capture();
    expect(await runHostCommand(["inventory", "--host-rooot", "/tmp/nope"], typo.io, { version: "0.43.0" })).toBe(1);
    expect(typo.errors[0]).toContain("Unknown --host-rooot");

    const root = mkdtempSync(join(tmpdir(), "relay-host-cli-unknown-"));
    rmSync(root, { recursive: true, force: true });
    const unknown = capture();
    expect(await runHostCommand(["frobnicate", "--host-root", root], unknown.io, { version: "0.43.0" })).toBe(1);
    expect(unknown.errors[0]).toContain("HOST_CLI_ACTION_UNKNOWN");
    expect(() => rmSync(root)).toThrow();

    const duplicate = capture();
    expect(await runHostCommand(["inventory", "--host-root", "/tmp/a", "--host-root", "/tmp/b"], duplicate.io, { version: "0.43.0" })).toBe(1);
    expect(duplicate.errors[0]).toContain("Duplicate --host-root");
  });
});
