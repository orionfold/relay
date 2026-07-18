import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { HostRegistry } from "../registry";
import { FakeHostRuntimeAdapter } from "../runtime";
import { initializeRelayHost, RelayHostSupervisor } from "../supervisor";
import {
  ACTIVE_NOW,
  HOST_CAPACITY,
  LAPSED_NOW,
  manifest,
  writeHostLicense,
} from "./helpers";

function setup(managedCells = 10) {
  const root = mkdtempSync(join(tmpdir(), "relay-host-supervisor-"));
  const licenseDir = join(root, "licenses");
  writeHostLicense(licenseDir, { managedCells });
  const initialized = initializeRelayHost({
    root: join(root, "host"),
    hostId: "host-a",
    runtimeKind: "docker",
    capacity: HOST_CAPACITY,
    licenseDir,
    supervisorVersion: "0.43.0",
    now: ACTIVE_NOW,
  });
  const runtime = new FakeHostRuntimeAdapter();
  const verifiedCheckpoints: string[] = [];
  let clock = ACTIVE_NOW;
  const supervisor = new RelayHostSupervisor({
    registry: initialized.registry,
    runtime,
    licenseDir,
    actorRef: "local-admin",
    now: () => clock,
    checkpointVerifier: {
      verify: (evidence) => verifiedCheckpoints.push(evidence.checkpointRef),
    },
  });
  return {
    root,
    licenseDir,
    registry: initialized.registry,
    runtime,
    supervisor,
    verifiedCheckpoints,
    setClock: (next: Date) => {
      clock = next;
    },
  };
}

describe("Relay Host supervisor", () => {
  it("rejects invalid Host identity before creating a registry root", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-invalid-init-"));
    const licenseDir = join(root, "licenses");
    const hostRoot = join(root, "host");
    try {
      writeHostLicense(licenseDir);
      expect(() => initializeRelayHost({
        root: hostRoot,
        hostId: "../../unsafe",
        runtimeKind: "docker",
        capacity: HOST_CAPACITY,
        licenseDir,
        supervisorVersion: "0.43.0",
        now: ACTIVE_NOW,
      })).toThrowError(/configuration is invalid/);
      expect(existsSync(hostRoot)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs one idempotent create/start/stop/restart lifecycle", () => {
    const env = setup();
    try {
      const created = env.supervisor.create({
        operationId: "op-create-a",
        manifest: manifest("cell-a", 4101),
      });
      expect(created).toMatchObject({ outcome: "succeeded", reasonCode: "HOST_CELL_CREATED" });
      expect(env.registry.getCell("cell-a")?.actualState).toBe("stopped");

      const replay = env.supervisor.create({
        operationId: "op-create-a",
        manifest: manifest("cell-a", 4101),
      });
      expect(replay.receiptId).toBe(created.receiptId);

      expect(env.supervisor.start({ operationId: "op-start-a", cellId: "cell-a" }).outcome).toBe("succeeded");
      expect(env.registry.getCell("cell-a")?.actualState).toBe("running");
      expect(env.supervisor.restart({ operationId: "op-restart-a", cellId: "cell-a" }).outcome).toBe("succeeded");
      expect(env.supervisor.stop({ operationId: "op-stop-a", cellId: "cell-a" }).outcome).toBe("succeeded");
      expect(env.registry.getCell("cell-a")?.actualState).toBe("stopped");
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("refuses unlicensed expansion before Cell, operation, path or runtime allocation", () => {
    const env = setup();
    try {
      rmSync(env.licenseDir, { recursive: true, force: true });
      expect(() =>
        env.supervisor.create({
          operationId: "op-denied",
          manifest: manifest("cell-a", 4101),
        }),
      ).toThrowError(/No signed product:relay-host license/);
      expect(env.registry.listCells()).toEqual([]);
      expect(env.registry.listOperations()).toEqual([]);
      expect(env.runtime.inventory("host-a")).toEqual([]);
      expect(existsSync(join(env.registry.root, "cells"))).toBe(false);
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("blocks expansion after lapse but preserves receipt-bound continuity", () => {
    const env = setup();
    try {
      env.supervisor.create({ operationId: "op-create-a", manifest: manifest("cell-a", 4101) });
      env.setClock(LAPSED_NOW);
      expect(() =>
        env.supervisor.create({ operationId: "op-create-b", manifest: manifest("cell-b", 4102) }),
      ).toThrowError(/lapsed/);
      expect(env.supervisor.start({ operationId: "op-start-a", cellId: "cell-a" }).outcome).toBe("succeeded");
      expect(env.supervisor.stop({ operationId: "op-stop-a", cellId: "cell-a" }).outcome).toBe("succeeded");
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("applies a newly signed capacity upgrade without mutating existing Cells", () => {
    const env = setup(1);
    try {
      env.supervisor.create({ operationId: "op-create-a", manifest: manifest("cell-a", 4101) });
      const snapshot = env.registry.getCell("cell-a");
      expect(() =>
        env.supervisor.create({ operationId: "op-create-b-denied", manifest: manifest("cell-b", 4102) }),
      ).toThrowError(/capacity/);
      writeHostLicense(env.licenseDir, {
        licenseId: "OF-RELAY-HOST-UPGRADE-G083",
        managedCells: 2,
      });
      expect(env.supervisor.create({ operationId: "op-create-b", manifest: manifest("cell-b", 4102) }).outcome).toBe("succeeded");
      expect(env.registry.getCell("cell-a")).toEqual(snapshot);
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("retains managed data, releases only with a checkpoint, and purges one Cell with fresh confirmation", () => {
    const env = setup();
    try {
      env.supervisor.create({ operationId: "op-create-a", manifest: manifest("cell-a", 4101) });
      env.supervisor.create({ operationId: "op-create-b", manifest: manifest("cell-b", 4102) });
      const cellA = env.registry.getCell("cell-a")!;
      const cellB = env.registry.getCell("cell-b")!;
      writeFileSync(join(cellA.allocation.dataRoot, "a.txt"), "a");
      writeFileSync(join(cellB.allocation.dataRoot, "b.txt"), "b");

      env.supervisor.start({ operationId: "op-start-a", cellId: "cell-a" });
      env.supervisor.retain({ operationId: "op-retain-a", cellId: "cell-a" });
      expect(env.registry.getCell("cell-a")?.actualState).toBe("retained");
      expect(existsSync(cellA.allocation.dataRoot)).toBe(true);
      expect(() =>
        env.supervisor.exportRelease({
          operationId: "op-release-bad",
          cellId: "cell-a",
          checkpointRef: "not-a-checkpoint",
          checkpointReceiptPath: "unused",
          checkpointBundlePath: "unused",
        }),
      ).toThrowError(/verified sha256 checkpoint/);

      const checkpointRef = `sha256:${"c".repeat(64)}`;
      env.supervisor.exportRelease({
        operationId: "op-release-a",
        cellId: "cell-a",
        checkpointRef,
        checkpointReceiptPath: "receipt.json",
        checkpointBundlePath: "bundle.relay-recovery",
      });
      expect(env.verifiedCheckpoints).toEqual([checkpointRef]);
      expect(env.registry.getCell("cell-a")).toMatchObject({
        actualState: "exported",
        checkpointRef,
      });
      expect(() =>
        env.supervisor.purge({
          operationId: "op-purge-a-bad",
          cellId: "cell-a",
          confirmation: "cell-b",
        }),
      ).toThrowError(/confirmation equal to Cell ID/);
      env.supervisor.purge({
        operationId: "op-purge-a",
        cellId: "cell-a",
        confirmation: "cell-a",
      });
      expect(env.registry.getCell("cell-a")?.actualState).toBe("purged");
      expect(existsSync(dirname(cellA.allocation.dataRoot))).toBe(false);
      expect(existsSync(join(cellB.allocation.dataRoot, "b.txt"))).toBe(true);
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("records partial runtime and rollback failures without raw runtime errors", () => {
    const env = setup();
    try {
      env.runtime.failNext("create");
      env.runtime.failNext("remove");
      const receipt = env.supervisor.create({
        operationId: "op-partial",
        manifest: manifest("cell-a", 4101),
      });
      expect(receipt.outcome).toBe("rollback_partial");
      expect(env.registry.getCell("cell-a")?.actualState).toBe("partial");
      expect(JSON.stringify(env.registry.listOperations())).not.toContain("Synthetic Relay Host runtime");
      expect(receipt.reasonCode).toBe("HOST_RUNTIME_EFFECT_FAILED");
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("refuses a second Cell port collision without runtime residue", () => {
    const env = setup();
    try {
      env.supervisor.create({ operationId: "op-create-a", manifest: manifest("cell-a", 4101) });
      const denied = env.supervisor.create({
        operationId: "op-create-b",
        manifest: manifest("cell-b", 4101),
      });
      expect(denied).toMatchObject({ outcome: "failed", reasonCode: "HOST_RESOURCE_COLLISION" });
      expect(env.registry.listCells().map((cell) => cell.cellId)).toEqual(["cell-a"]);
      expect(env.runtime.inventory("host-a").map((cell) => cell.cellId)).toEqual(["cell-a"]);
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("keeps two managed Cells in distinct runtime, root, secret, network and port boundaries", () => {
    const env = setup();
    try {
      env.supervisor.create({ operationId: "op-create-a", manifest: manifest("cell-a", 4101) });
      env.supervisor.create({ operationId: "op-create-b", manifest: manifest("cell-b", 4102) });
      const inventory = env.supervisor.inventory();
      expect(inventory.cells).toHaveLength(2);
      const [cellA, cellB] = inventory.cells;
      expect(cellA.ownerRef).not.toBe(cellB.ownerRef);
      expect(cellA.allocation.containerName).not.toBe(cellB.allocation.containerName);
      expect(cellA.allocation.dataRoot).not.toBe(cellB.allocation.dataRoot);
      expect(cellA.allocation.secretRootRef).not.toBe(cellB.allocation.secretRootRef);
      expect(cellA.allocation.networkName).not.toBe(cellB.allocation.networkName);
      expect(cellA.allocation.hostLoopbackPort).not.toBe(cellB.allocation.hostLoopbackPort);
      expect(inventory.runtime.map((cell) => cell.cellId)).toEqual(["cell-a", "cell-b"]);
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("reports runtime drift without silently mutating registry state", () => {
    const env = setup();
    try {
      env.supervisor.create({ operationId: "op-create-a", manifest: manifest("cell-a", 4101) });
      env.runtime.remove(env.registry.getCell("cell-a")!, "host-a");
      expect(env.supervisor.reconcile()).toEqual([
        { cellId: "cell-a", registry: "stopped", runtime: "missing" },
      ]);
      expect(env.registry.getCell("cell-a")?.actualState).toBe("stopped");
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });

  it("reconciles an interrupted receipted lifecycle effect instead of stranding the operation", () => {
    const env = setup();
    try {
      env.supervisor.create({ operationId: "op-create-a", manifest: manifest("cell-a", 4101) });
      const cell = env.registry.getCell("cell-a")!;
      env.registry.beginOperation({
        operationId: "op-interrupted-start",
        planDigest: `sha256:${"d".repeat(64)}`,
        cellId: "cell-a",
        actorRef: "local-admin",
        action: "start",
        resourceRefs: [`container:${cell.allocation.containerName}`],
        now: ACTIVE_NOW.getTime(),
      });
      env.registry.updateCellState("cell-a", "stopped", "starting", {
        desiredState: "running",
        health: "starting",
      });
      env.runtime.start(cell);

      expect(env.supervisor.reconcile()).toEqual([]);
      expect(env.registry.getCell("cell-a")?.actualState).toBe("running");
      expect(env.registry.getOperation("op-interrupted-start")).toMatchObject({
        outcome: "succeeded",
        reasonCode: "HOST_OPERATION_RECONCILED",
      });
    } finally {
      env.registry.close();
      rmSync(env.root, { recursive: true, force: true });
    }
  });
});
