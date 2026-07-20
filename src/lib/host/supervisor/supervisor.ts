import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  evaluateHostAction,
  selectEffectiveHostLicense,
  type HostLifecycleAction,
  type HostLicenseInspection,
  type ManagedCellState,
} from "@/lib/licensing/host-entitlement";
import {
  HOST_REGISTRY_SCHEMA_VERSION,
  HostConfigSchema,
  type CellActualState,
  type CellManifest,
  type CellRecord,
  type HostCapacity,
  type HostConfig,
  type HostOperationAction,
  type LifecycleReceipt,
} from "./contracts";
import { RelayHostError, hostError } from "./errors";
import {
  inspectStoredHostLicenses,
  requireEffectiveHostLicense,
} from "./license";
import {
  assertContentFree,
  assertPathInside,
  hostPlanDigest,
  parseCellManifest,
} from "./policy";
import { HostRegistry } from "./registry";
import type { HostRuntimeAdapter, RuntimeCellObservation } from "./runtime";
import {
  FileHostCheckpointVerifier,
  type HostCheckpointVerifier,
} from "./checkpoint";

export type RelayHostSupervisorOptions = {
  registry: HostRegistry;
  runtime: HostRuntimeAdapter;
  licenseDir: string;
  actorRef: string;
  now?: () => Date;
  checkpointVerifier?: HostCheckpointVerifier;
};

export type HostInventory = {
  host: HostConfig;
  cells: CellRecord[];
  runtime: RuntimeCellObservation[];
  operations: LifecycleReceipt[];
};

function stateForAdmission(state: CellActualState): ManagedCellState {
  if (state === "running") return "running";
  if (state === "retained") return "retained";
  if (state === "exported") return "exported";
  if (state === "purged" || state === "absent") return "purged";
  return "stopped";
}

function reasonCode(error: unknown, fallback: string): string {
  return error instanceof RelayHostError ? error.code : fallback;
}

function assertAdmission(result: ReturnType<typeof evaluateHostAction>): void {
  if (!result.allowed) {
    throw new RelayHostError(result.code, result.detail, {
      managedCells: result.managedCells,
      ...(result.limit == null ? {} : { limit: result.limit }),
    });
  }
}

export function initializeRelayHost(input: {
  root?: string;
  hostId: string;
  runtimeKind: "docker" | "podman";
  capacity: HostCapacity;
  licenseDir: string;
  supervisorVersion: string;
  now?: Date;
}): { registry: HostRegistry; host: HostConfig } {
  const inspection = requireEffectiveHostLicense({
    licenseDir: input.licenseDir,
    now: input.now,
  });
  assertAdmission(
    evaluateHostAction({
      action: "claim_replacement_host",
      inspection,
      replacementHostRetired: true,
    }),
  );
  const now = (input.now ?? new Date()).getTime();
  const parsedHost = HostConfigSchema.safeParse({
    schemaVersion: HOST_REGISTRY_SCHEMA_VERSION,
    hostId: input.hostId,
    licenseeRef: inspection.grant.licensee.ref,
    licenseId: inspection.licenseId,
    supervisorVersion: input.supervisorVersion,
    runtimeKind: input.runtimeKind,
    desiredState: "ready",
    actualState: "ready",
    capacity: input.capacity,
    createdAt: now,
    updatedAt: now,
  });
  if (!parsedHost.success) {
    throw new RelayHostError(
      "HOST_CONFIG_INVALID",
      `Relay Host configuration is invalid: ${String(parsedHost.error.issues[0]?.message ?? "unknown error")}`,
    );
  }
  const registry = new HostRegistry(input.root);
  try {
    const host = registry.initializeHost(parsedHost.data);
    return { registry, host };
  } catch (error) {
    registry.close();
    throw error;
  }
}

export class RelayHostSupervisor {
  private readonly now: () => Date;
  private readonly checkpointVerifier: HostCheckpointVerifier;

  constructor(private readonly options: RelayHostSupervisorOptions) {
    this.now = options.now ?? (() => new Date());
    this.checkpointVerifier = options.checkpointVerifier ?? new FileHostCheckpointVerifier();
  }

  inventory(): HostInventory {
    const host = this.requireHost();
    return {
      host,
      cells: this.options.registry.listCells(),
      runtime: this.options.runtime.inventory(host.hostId),
      operations: this.options.registry.listOperations(),
    };
  }

  create(input: {
    operationId: string;
    manifest: unknown;
  }): LifecycleReceipt {
    const host = this.requireHost();
    if (host.actualState !== "ready" || host.desiredState !== "ready") {
      throw new RelayHostError(
        "HOST_NOT_READY",
        `Relay Host ${host.hostId} is not admitting managed Cells.`,
      );
    }
    const manifest = parseCellManifest(input.manifest);
    const inspection = requireEffectiveHostLicense({
      licenseDir: this.options.licenseDir,
      now: this.now(),
      expectedLicenseeRef: host.licenseeRef,
    });
    assertAdmission(
      evaluateHostAction({
        action: manifest.origin,
        inspection,
        cellStates: this.options.registry
          .listCells()
          .map((cell) => stateForAdmission(cell.actualState)),
      }),
    );

    const planDigest = hostPlanDigest({ action: "create", manifest });
    const allocation = this.deriveAllocation(manifest);
    const startedAt = this.now().getTime();
    const record: CellRecord = {
      schemaVersion: HOST_REGISTRY_SCHEMA_VERSION,
      cellId: manifest.cellId,
      ownerRef: manifest.ownerRef,
      artifact: manifest.artifact,
      desiredState: "stopped",
      actualState: "creating",
      allocation,
      manifestDigest: planDigest,
      health: "unknown",
      backupStatus: "unknown",
      checkpointRef: null,
      lastReceiptId: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    };
    assertContentFree(record);
    const operation = this.options.registry.beginOperation({
      operationId: input.operationId,
      planDigest,
      cellId: manifest.cellId,
      actorRef: this.options.actorRef,
      action: "create",
      resourceRefs: this.resourceRefs(record),
      now: startedAt,
    });
    if (operation.replay) return this.replay(operation.receipt);

    try {
      this.options.registry.reserveCell(record);
      this.prepareCellRoot(record);
      this.options.runtime.prepareArtifact(record);
      this.options.runtime.create(record, host.hostId);
      const stopped = this.options.registry.updateCellState(
        record.cellId,
        "creating",
        "stopped",
        { health: "unknown", lastReceiptId: operation.receipt.receiptId },
      );
      const observed = this.options.runtime.inspect(stopped, host.hostId);
      if (!observed.exists || observed.running) {
        throw new RelayHostError(
          "HOST_RUNTIME_VERIFICATION_FAILED",
          `Created Relay Cell ${record.cellId} did not settle stopped.`,
        );
      }
      return this.options.registry.completeOperation(
        input.operationId,
        "succeeded",
        "HOST_CELL_CREATED",
        this.now().getTime(),
      );
    } catch (error) {
      this.rescueCreate(record);
      return this.options.registry.completeOperation(
        input.operationId,
        this.options.registry.getCell(record.cellId)?.actualState === "partial"
          ? "rollback_partial"
          : "failed",
        reasonCode(error, "HOST_CELL_CREATE_FAILED"),
        this.now().getTime(),
      );
    }
  }

  start(input: { operationId: string; cellId: string }): LifecycleReceipt {
    return this.withCellOperation("start", input, ["stopped", "retained"], (cell, host) => {
      const starting = this.options.registry.updateCellState(
        cell.cellId,
        cell.actualState,
        "starting",
        { desiredState: "running", health: "starting" },
      );
      const observed = this.options.runtime.inspect(starting, host.hostId);
      if (!observed.exists) {
        this.options.runtime.prepareArtifact(starting);
        this.options.runtime.create(starting, host.hostId);
      }
      this.options.runtime.start(starting);
      const running = this.options.runtime.inspect(starting, host.hostId);
      if (!running.exists || !running.running) {
        throw new RelayHostError(
          "HOST_RUNTIME_VERIFICATION_FAILED",
          `Relay Cell ${cell.cellId} did not become running.`,
        );
      }
      this.options.registry.updateCellState(cell.cellId, "starting", "running", {
        desiredState: "running",
        health: "healthy",
      });
    });
  }

  stop(input: { operationId: string; cellId: string }): LifecycleReceipt {
    return this.withCellOperation("stop", input, ["running"], (cell, host) => {
      const stopping = this.options.registry.updateCellState(
        cell.cellId,
        "running",
        "stopping",
        { desiredState: "stopped", health: "unknown" },
      );
      this.options.runtime.stop(stopping);
      const observed = this.options.runtime.inspect(stopping, host.hostId);
      if (!observed.exists || observed.running) {
        throw new RelayHostError(
          "HOST_RUNTIME_VERIFICATION_FAILED",
          `Relay Cell ${cell.cellId} did not become stopped.`,
        );
      }
      this.options.registry.updateCellState(cell.cellId, "stopping", "stopped", {
        desiredState: "stopped",
      });
    });
  }

  restart(input: { operationId: string; cellId: string }): LifecycleReceipt {
    return this.withCellOperation("restart", input, ["running"], (cell, host) => {
      const restarting = this.options.registry.updateCellState(
        cell.cellId,
        "running",
        "restarting",
        { health: "starting" },
      );
      this.options.runtime.stop(restarting);
      this.options.runtime.start(restarting);
      const observed = this.options.runtime.inspect(restarting, host.hostId);
      if (!observed.running) {
        throw new RelayHostError(
          "HOST_RUNTIME_VERIFICATION_FAILED",
          `Relay Cell ${cell.cellId} did not become running after restart.`,
        );
      }
      this.options.registry.updateCellState(cell.cellId, "restarting", "running", {
        desiredState: "running",
        health: "healthy",
      });
    });
  }

  retain(input: { operationId: string; cellId: string }): LifecycleReceipt {
    return this.withCellOperation("retain", input, ["running", "stopped"], (cell, host) => {
      const removing = this.options.registry.updateCellState(
        cell.cellId,
        cell.actualState,
        "removing",
        { desiredState: "absent", health: "unknown" },
      );
      this.removeRuntimeGracefully(removing, host.hostId);
      this.options.registry.updateCellState(cell.cellId, "removing", "retained", {
        desiredState: "absent",
      });
    });
  }

  exportRelease(input: {
    operationId: string;
    cellId: string;
    checkpointRef: string;
    checkpointReceiptPath: string;
    checkpointBundlePath: string;
  }): LifecycleReceipt {
    if (!/^sha256:[a-f0-9]{64}$/.test(input.checkpointRef)) {
      throw new RelayHostError(
        "HOST_CHECKPOINT_REQUIRED",
        "Export-and-release requires a verified sha256 checkpoint fingerprint.",
      );
    }
    this.requireCell(input.cellId);
    this.checkpointVerifier.verify({
      cellId: input.cellId,
      checkpointRef: input.checkpointRef,
      receiptPath: input.checkpointReceiptPath,
      bundlePath: input.checkpointBundlePath,
    });
    return this.withCellOperation(
      "export_release",
      input,
      ["running", "stopped", "retained"],
      (cell, host) => {
        const exporting = this.options.registry.updateCellState(
          cell.cellId,
          cell.actualState,
          "exporting",
          { desiredState: "absent", checkpointRef: input.checkpointRef },
        );
        this.removeRuntimeGracefully(exporting, host.hostId);
        this.options.registry.updateCellState(cell.cellId, "exporting", "exported", {
          desiredState: "absent",
          checkpointRef: input.checkpointRef,
          backupStatus: "verified",
        });
      },
      { checkpointRef: input.checkpointRef },
    );
  }

  purge(input: {
    operationId: string;
    cellId: string;
    confirmation: string;
  }): LifecycleReceipt {
    if (input.confirmation !== input.cellId) {
      throw new RelayHostError(
        "HOST_PURGE_CONFIRMATION_REQUIRED",
        `Purge requires confirmation equal to Cell ID ${input.cellId}.`,
      );
    }
    const cell = this.requireCell(input.cellId);
    if (cell.actualState === "purged") {
      throw new RelayHostError("HOST_CELL_PURGED", `Managed Cell ${input.cellId} is already purged.`);
    }
    return this.withCellOperation(
      "purge",
      input,
      [
        "running",
        "stopped",
        "retained",
        "exported",
        "partial",
        "error",
        "orphaned",
      ],
      (current, host) => {
        let removing = current;
        if (current.actualState !== "retained" && current.actualState !== "exported") {
          removing = this.options.registry.updateCellState(
            current.cellId,
            current.actualState,
            "removing",
            { desiredState: "absent", health: "unknown" },
          );
          this.removeRuntimeGracefully(removing, host.hostId);
          this.options.runtime.purgeData(removing);
          this.removeCellRoot(removing);
          this.options.registry.updateCellState(current.cellId, "removing", "purged", {
            desiredState: "absent",
            checkpointRef: null,
          });
          return;
        }
        this.removeRuntimeGracefully(removing, host.hostId);
        this.options.runtime.purgeData(removing);
        this.removeCellRoot(removing);
        this.options.registry.updateCellState(
          current.cellId,
          current.actualState,
          "purged",
          { desiredState: "absent", checkpointRef: null },
        );
      },
      { confirmation: input.confirmation },
    );
  }

  reconcile(): Array<{ cellId: string; registry: CellActualState; runtime: "missing" | "stopped" | "running" }> {
    const host = this.requireHost();
    this.reconcileRunningOperations(host);
    const drifts: Array<{
      cellId: string;
      registry: CellActualState;
      runtime: "missing" | "stopped" | "running";
    }> = [];
    for (const cell of this.options.registry.listCells()) {
      if (["retained", "exported", "purged"].includes(cell.actualState)) continue;
      const observed = this.options.runtime.inspect(cell, host.hostId);
      const runtime = !observed.exists ? "missing" : observed.running ? "running" : "stopped";
      const matches =
        (cell.actualState === "running" && runtime === "running") ||
        (cell.actualState === "stopped" && runtime === "stopped");
      if (!matches) drifts.push({ cellId: cell.cellId, registry: cell.actualState, runtime });
    }
    return drifts;
  }

  private reconcileRunningOperations(host: HostConfig): void {
    for (const operation of this.options.registry
      .listOperations()
      .filter((receipt) => receipt.outcome === "running")) {
      if (!operation.cellId) {
        this.options.registry.completeOperation(
          operation.operationId,
          "failed",
          "HOST_OPERATION_INTERRUPTED_NO_CELL",
          this.now().getTime(),
        );
        continue;
      }
      const cell = this.options.registry.getCell(operation.cellId);
      if (!cell) {
        this.options.registry.completeOperation(
          operation.operationId,
          "failed",
          "HOST_OPERATION_INTERRUPTED_NO_CELL",
          this.now().getTime(),
        );
        continue;
      }
      this.reconcileRunningOperation(operation, cell, host);
      this.options.registry.completeOperation(
        operation.operationId,
        "succeeded",
        "HOST_OPERATION_RECONCILED",
        this.now().getTime(),
      );
    }
  }

  private reconcileRunningOperation(
    operation: LifecycleReceipt,
    cell: CellRecord,
    host: HostConfig,
  ): void {
    switch (operation.action) {
      case "create": {
        if (cell.actualState === "stopped") return;
        if (cell.actualState !== "creating") {
          throw new RelayHostError(
            "HOST_OPERATION_RECONCILE_REFUSED",
            `Interrupted create cannot resume while Cell ${cell.cellId} is ${cell.actualState}.`,
          );
        }
        let observed = this.options.runtime.inspect(cell, host.hostId);
        if (!observed.exists) {
          this.options.runtime.remove(cell, host.hostId);
          this.prepareCellRoot(cell);
          this.options.runtime.prepareArtifact(cell);
          this.options.runtime.create(cell, host.hostId);
          observed = this.options.runtime.inspect(cell, host.hostId);
        }
        if (!observed.exists || observed.running) {
          throw new RelayHostError(
            "HOST_RUNTIME_VERIFICATION_FAILED",
            `Interrupted create for Relay Cell ${cell.cellId} did not settle stopped.`,
          );
        }
        this.options.registry.updateCellState(cell.cellId, "creating", "stopped", {
          health: "unknown",
          lastReceiptId: operation.receiptId,
        });
        return;
      }
      case "start": {
        if (cell.actualState === "running") return;
        if (cell.actualState !== "starting") {
          throw new RelayHostError(
            "HOST_OPERATION_RECONCILE_REFUSED",
            `Interrupted start cannot resume while Cell ${cell.cellId} is ${cell.actualState}.`,
          );
        }
        let observed = this.options.runtime.inspect(cell, host.hostId);
        if (!observed.exists) {
          this.options.runtime.remove(cell, host.hostId);
          this.options.runtime.prepareArtifact(cell);
          this.options.runtime.create(cell, host.hostId);
        }
        if (!observed.running) this.options.runtime.start(cell);
        observed = this.options.runtime.inspect(cell, host.hostId);
        if (!observed.running) {
          throw new RelayHostError(
            "HOST_RUNTIME_VERIFICATION_FAILED",
            `Interrupted start for Relay Cell ${cell.cellId} did not become running.`,
          );
        }
        this.options.registry.updateCellState(cell.cellId, "starting", "running", {
          desiredState: "running",
          health: "healthy",
        });
        return;
      }
      case "stop": {
        if (cell.actualState === "stopped") return;
        if (cell.actualState !== "stopping") {
          throw new RelayHostError(
            "HOST_OPERATION_RECONCILE_REFUSED",
            `Interrupted stop cannot resume while Cell ${cell.cellId} is ${cell.actualState}.`,
          );
        }
        const observed = this.options.runtime.inspect(cell, host.hostId);
        if (!observed.exists) {
          throw new RelayHostError(
            "HOST_RUNTIME_CELL_MISSING",
            `Interrupted stop cannot prove Relay Cell ${cell.cellId} is safely stopped.`,
          );
        }
        if (observed.running) this.options.runtime.stop(cell);
        const stopped = this.options.runtime.inspect(cell, host.hostId);
        if (stopped.running) {
          throw new RelayHostError(
            "HOST_RUNTIME_VERIFICATION_FAILED",
            `Interrupted stop for Relay Cell ${cell.cellId} did not become stopped.`,
          );
        }
        this.options.registry.updateCellState(cell.cellId, "stopping", "stopped", {
          desiredState: "stopped",
          health: "unknown",
        });
        return;
      }
      case "restart": {
        if (cell.actualState === "running") return;
        if (cell.actualState !== "restarting") {
          throw new RelayHostError(
            "HOST_OPERATION_RECONCILE_REFUSED",
            `Interrupted restart cannot resume while Cell ${cell.cellId} is ${cell.actualState}.`,
          );
        }
        const observed = this.options.runtime.inspect(cell, host.hostId);
        if (!observed.exists) {
          throw new RelayHostError(
            "HOST_RUNTIME_CELL_MISSING",
            `Interrupted restart cannot find Relay Cell ${cell.cellId}.`,
          );
        }
        if (!observed.running) this.options.runtime.start(cell);
        const running = this.options.runtime.inspect(cell, host.hostId);
        if (!running.running) {
          throw new RelayHostError(
            "HOST_RUNTIME_VERIFICATION_FAILED",
            `Interrupted restart for Relay Cell ${cell.cellId} did not become running.`,
          );
        }
        this.options.registry.updateCellState(cell.cellId, "restarting", "running", {
          desiredState: "running",
          health: "healthy",
        });
        return;
      }
      case "retain":
      case "export_release":
      case "purge": {
        const terminal =
          operation.action === "retain"
            ? "retained"
            : operation.action === "export_release"
              ? "exported"
              : "purged";
        if (cell.actualState === terminal) return;
        const expected = operation.action === "export_release" ? "exporting" : "removing";
        if (cell.actualState !== expected) {
          throw new RelayHostError(
            "HOST_OPERATION_RECONCILE_REFUSED",
            `Interrupted ${operation.action} cannot resume while Cell ${cell.cellId} is ${cell.actualState}.`,
          );
        }
        this.removeRuntimeGracefully(cell, host.hostId);
        if (operation.action === "purge") {
          this.options.runtime.purgeData(cell);
          this.removeCellRoot(cell);
        }
        this.options.registry.updateCellState(cell.cellId, expected, terminal, {
          desiredState: "absent",
          ...(operation.action === "purge" ? { checkpointRef: null } : {}),
          ...(operation.action === "export_release" ? { backupStatus: "verified" } : {}),
        });
        return;
      }
      case "reconcile":
        throw new RelayHostError(
          "HOST_OPERATION_RECONCILE_REFUSED",
          "Nested Relay Host reconcile operations are not supported.",
        );
    }
  }

  private withCellOperation(
    action: HostOperationAction,
    input: { operationId: string; cellId: string },
    allowedStates: readonly CellActualState[],
    effect: (cell: CellRecord, host: HostConfig) => void,
    extraPlan: Record<string, unknown> = {},
  ): LifecycleReceipt {
    const host = this.requireHost();
    const cell = this.requireCell(input.cellId);
    if (!allowedStates.includes(cell.actualState)) {
      throw new RelayHostError(
        "HOST_TRANSITION_ILLEGAL",
        `Action ${action} is not allowed while Cell ${cell.cellId} is ${cell.actualState}.`,
      );
    }
    const inspection = this.currentLicenseInspection(host.licenseeRef);
    assertAdmission(
      evaluateHostAction({
        action: this.policyAction(action),
        inspection,
        cellStates: this.options.registry
          .listCells()
          .map((item) => stateForAdmission(item.actualState)),
        hasManagedCellReceipt: Boolean(cell.lastReceiptId) || cell.createdAt > 0,
      }),
    );
    const planDigest = hostPlanDigest({
      action,
      cellId: cell.cellId,
      expectedState: cell.actualState,
      manifestDigest: cell.manifestDigest,
      ...extraPlan,
    });
    const operation = this.options.registry.beginOperation({
      operationId: input.operationId,
      planDigest,
      cellId: cell.cellId,
      actorRef: this.options.actorRef,
      action,
      resourceRefs: this.resourceRefs(cell),
      now: this.now().getTime(),
    });
    if (operation.replay) return this.replay(operation.receipt);
    try {
      effect(cell, host);
      return this.options.registry.completeOperation(
        input.operationId,
        "succeeded",
        `HOST_CELL_${action.toUpperCase()}_SUCCEEDED`,
        this.now().getTime(),
      );
    } catch (error) {
      this.markPartial(cell.cellId);
      return this.options.registry.completeOperation(
        input.operationId,
        "partial",
        reasonCode(error, `HOST_CELL_${action.toUpperCase()}_FAILED`),
        this.now().getTime(),
      );
    }
  }

  private replay(receipt: LifecycleReceipt): LifecycleReceipt {
    if (receipt.outcome === "running") {
      throw new RelayHostError(
        "HOST_OPERATION_IN_PROGRESS",
        `Operation ${receipt.operationId} is still non-terminal; reconcile before retrying.`,
      );
    }
    return receipt;
  }

  private policyAction(action: HostOperationAction): HostLifecycleAction {
    if (action === "retain") return "stop";
    if (action === "export_release") return "export_and_release";
    if (action === "reconcile") return "recover";
    return action;
  }

  private currentLicenseInspection(expectedLicenseeRef: string): HostLicenseInspection | null {
    const inspections = inspectStoredHostLicenses({
      licenseDir: this.options.licenseDir,
      now: this.now(),
      expectedLicenseeRef,
    });
    return (
      selectEffectiveHostLicense(inspections, expectedLicenseeRef) ??
      inspections.find((inspection) => !inspection.ok) ??
      null
    );
  }

  private deriveAllocation(manifest: CellManifest): CellRecord["allocation"] {
    const cellRoot = assertPathInside(
      this.options.registry.root,
      join(this.options.registry.root, "cells", manifest.cellId),
    );
    const dataRoot = assertPathInside(this.options.registry.root, join(cellRoot, "data"));
    return {
      containerName: `relay-cell-${manifest.cellId}`,
      dataRoot,
      secretRootRef: assertPathInside(
        this.options.registry.root,
        join(dataRoot, ".keyfile"),
      ),
      networkName: `relay-cell-${manifest.cellId}-net`,
      hostLoopbackPort: manifest.loopbackPort,
      cpuMillis: manifest.resources.cpuMillis,
      memoryBytes: manifest.resources.memoryBytes,
      storageBytes: manifest.resources.storageBytes,
    };
  }

  private prepareCellRoot(cell: CellRecord): void {
    const dataRoot = assertPathInside(this.options.registry.root, cell.allocation.dataRoot);
    mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
    chmodSync(dataRoot, 0o700);
  }

  private removeCellRoot(cell: CellRecord): void {
    const dataRoot = assertPathInside(this.options.registry.root, cell.allocation.dataRoot);
    const cellRoot = assertPathInside(this.options.registry.root, dirname(dataRoot));
    rmSync(cellRoot, { recursive: true, force: true });
  }

  private rescueCreate(record: CellRecord): void {
    const current = this.options.registry.getCell(record.cellId);
    if (!current) return;
    try {
      let rolling = current;
      if (["creating", "starting", "partial", "error"].includes(current.actualState)) {
        rolling = this.options.registry.updateCellState(
          current.cellId,
          current.actualState,
          "rolling_back",
          { desiredState: "absent", health: "unknown" },
        );
      }
      this.options.runtime.remove(rolling, this.requireHost().hostId);
      this.options.registry.updateCellState(
        rolling.cellId,
        "rolling_back",
        "error",
        { desiredState: "absent", health: "unreachable" },
      );
    } catch {
      const latest = this.options.registry.getCell(record.cellId);
      if (latest && latest.actualState !== "partial") {
        try {
          this.options.registry.updateCellState(
            latest.cellId,
            latest.actualState,
            "partial",
            { desiredState: "absent", health: "unreachable" },
          );
        } catch {
          // Existing durable non-terminal/error state is the remaining rescue evidence.
        }
      }
    }
  }

  private removeRuntimeGracefully(cell: CellRecord, hostId: string): void {
    const observed = this.options.runtime.inspect(cell, hostId);
    if (observed.exists && observed.running) {
      this.options.runtime.stop(cell);
      const stopped = this.options.runtime.inspect(cell, hostId);
      if (!stopped.exists || stopped.running) {
        throw new RelayHostError(
          "HOST_RUNTIME_VERIFICATION_FAILED",
          `Relay Cell ${cell.cellId} did not stop before runtime removal.`,
        );
      }
    }
    this.options.runtime.remove(cell, hostId);
  }

  private markPartial(cellId: string): void {
    const current = this.options.registry.getCell(cellId);
    if (!current || current.actualState === "partial") return;
    try {
      this.options.registry.updateCellState(
        cellId,
        current.actualState,
        "partial",
        { health: "unreachable" },
      );
    } catch {
      // The last durable state remains visible if no legal partial transition exists.
    }
  }

  private resourceRefs(cell: CellRecord): string[] {
    return [
      `container:${cell.allocation.containerName}`,
      `network:${cell.allocation.networkName}`,
      `port:127.0.0.1:${cell.allocation.hostLoopbackPort}`,
      `data-root:${cell.allocation.dataRoot}`,
      `secret-root:${cell.allocation.secretRootRef}`,
    ];
  }

  private requireHost(): HostConfig {
    const host = this.options.registry.getHost();
    if (!host) {
      throw new RelayHostError(
        "HOST_REGISTRY_NOT_INITIALIZED",
        "Initialize the Relay Host before managing Cells.",
      );
    }
    return host;
  }

  private requireCell(cellId: string): CellRecord {
    const cell = this.options.registry.getCell(cellId);
    if (!cell) {
      throw new RelayHostError("HOST_CELL_NOT_FOUND", `Managed Cell ${cellId} is not registered.`);
    }
    return cell;
  }
}
