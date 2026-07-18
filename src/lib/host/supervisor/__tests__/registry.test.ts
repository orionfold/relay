import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { CellRecord, HostConfig } from "../contracts";
import { HostRegistry } from "../registry";
import { HOST_CAPACITY, manifest } from "./helpers";

function host(now = 1): HostConfig {
  return {
    schemaVersion: 1,
    hostId: "host-a",
    licenseeRef: "org_northstar",
    licenseId: "OF-RELAY-HOST-TEST",
    supervisorVersion: "0.43.0",
    runtimeKind: "docker",
    desiredState: "ready",
    actualState: "ready",
    capacity: HOST_CAPACITY,
    createdAt: now,
    updatedAt: now,
  };
}

function cell(root: string, cellId: string, port: number, overrides: Partial<CellRecord> = {}): CellRecord {
  const input = manifest(cellId, port);
  return {
    schemaVersion: 1,
    cellId,
    ownerRef: input.ownerRef,
    artifact: input.artifact,
    desiredState: "stopped",
    actualState: "creating",
    allocation: {
      containerName: `relay-cell-${cellId}`,
      dataRoot: join(root, "cells", cellId, "data"),
      secretRootRef: join(root, "cells", cellId, "data", ".keyfile"),
      networkName: `relay-cell-${cellId}-net`,
      hostLoopbackPort: port,
      cpuMillis: input.resources.cpuMillis,
      memoryBytes: input.resources.memoryBytes,
      storageBytes: input.resources.storageBytes,
    },
    manifestDigest: input.artifact.imageDigest,
    health: "unknown",
    backupStatus: "unknown",
    checkpointRef: null,
    lastReceiptId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("Relay Host registry", () => {
  it("bootstraps independently, reopens idempotently, and verifies integrity", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-registry-"));
    try {
      const first = new HostRegistry(root);
      expect(first.initializeHost(host())).toEqual(host());
      first.quickCheck();
      first.close();

      const reopened = new HostRegistry(root);
      expect(reopened.getHost()?.hostId).toBe("host-a");
      expect(reopened.initializeHost(host())).toEqual(host());
      reopened.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed on a newer Host registry schema", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-newer-"));
    try {
      const db = new Database(join(root, "host.db"));
      db.pragma("user_version = 2");
      db.close();
      expect(() => new HostRegistry(root)).toThrowError(/newer than supported/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("atomically refuses duplicate ports and retains only one allocation", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-collision-"));
    const registry = new HostRegistry(root);
    try {
      registry.initializeHost(host());
      registry.reserveCell(cell(root, "cell-a", 4101));
      expect(() => registry.reserveCell(cell(root, "cell-b", 4101))).toThrowError(
        /already reserved/,
      );
      expect(registry.listCells().map((item) => item.cellId)).toEqual(["cell-a"]);
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("enforces the physical reserve before inserting a Cell", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-capacity-"));
    const registry = new HostRegistry(root);
    try {
      registry.initializeHost({
        ...host(),
        capacity: {
          cpuMillis: 1000,
          memoryBytes: 1024 * 1024 * 1024,
          storageBytes: 2 * 1024 * 1024 * 1024,
          reservePercent: 20,
        },
      });
      expect(() =>
        registry.reserveCell(
          cell(root, "cell-a", 4101, {
            allocation: {
              ...cell(root, "cell-a", 4101).allocation,
              cpuMillis: 900,
            },
          }),
        ),
      ).toThrowError(/safety reserve/);
      expect(registry.listCells()).toEqual([]);
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns an identical operation replay and rejects changed plans", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-operation-"));
    const registry = new HostRegistry(root);
    try {
      registry.initializeHost(host());
      const input = {
        operationId: "op-create-a",
        planDigest: `sha256:${"a".repeat(64)}` as const,
        cellId: "cell-a",
        actorRef: "local-admin",
        action: "create" as const,
        resourceRefs: ["container:relay-cell-cell-a"],
      };
      const first = registry.beginOperation(input);
      const replay = registry.beginOperation(input);
      expect(first.replay).toBe(false);
      expect(replay.replay).toBe(true);
      expect(replay.receipt.receiptId).toBe(first.receipt.receiptId);
      expect(() =>
        registry.beginOperation({
          ...input,
          planDigest: `sha256:${"b".repeat(64)}`,
        }),
      ).toThrowError(/different plan/);
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when normalized reservation fields disagree with the strict record", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-host-corrupt-row-"));
    try {
      const registry = new HostRegistry(root);
      registry.initializeHost(host());
      registry.reserveCell(cell(root, "cell-a", 4101));
      registry.close();

      const db = new Database(join(root, "host.db"));
      db.prepare("UPDATE host_cells SET loopback_port = ? WHERE cell_id = ?").run(4999, "cell-a");
      db.close();

      const reopened = new HostRegistry(root);
      expect(() => reopened.getCell("cell-a")).toThrowError(/normalized fields disagree/);
      reopened.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
