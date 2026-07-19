import { existsSync } from "node:fs";
import { join } from "node:path";
import { licensesDir } from "@/lib/licensing/store";
import {
  selectEffectiveHostLicense,
  type HostLicenseInspection,
  type HostLicenseInspectionOk,
} from "@/lib/licensing/host-entitlement";
import { relayProductVersion } from "@/lib/config/version";
import {
  HOST_CELL_MANIFEST_SCHEMA,
  type CellRecord,
} from "@/lib/host/supervisor/contracts";
import { RelayHostError } from "@/lib/host/supervisor/errors";
import { inspectStoredHostLicenses } from "@/lib/host/supervisor/license";
import { hostPlanDigest } from "@/lib/host/supervisor/policy";
import { FakeHostBootstrapProvider } from "@/lib/host/supervisor/provider";
import { HostRegistry } from "@/lib/host/supervisor/registry";
import {
  DockerHostRuntimeAdapter,
  type HostRuntimeAdapter,
  type RuntimeCellObservation,
} from "@/lib/host/supervisor/runtime";
import {
  initializeRelayHost,
  RelayHostSupervisor,
} from "@/lib/host/supervisor/supervisor";
import {
  HostDeploymentDraftSchema,
  type HostDeploymentDraft,
  type HostDeploymentLicenseView,
  type HostDeploymentMutation,
  type HostDeploymentView,
} from "./contracts";
import { estimateHostDeployment, hostCapacityForDraft } from "./catalog";
import { HostDeploymentStore } from "./store";
import { currentRelayCellRelease } from "./artifact";

const GIB = 1024 ** 3;

class PreviewHostRuntimeAdapter implements HostRuntimeAdapter {
  readonly kind = "fake" as const;
  private readonly cells = new Map<string, RuntimeCellObservation>();

  constructor(records: CellRecord[]) {
    for (const cell of records) {
      if (["retained", "exported", "purged", "absent"].includes(cell.actualState)) continue;
      this.cells.set(cell.cellId, {
        cellId: cell.cellId,
        exists: true,
        running: cell.actualState === "running",
        containerName: cell.allocation.containerName,
        networkName: cell.allocation.networkName,
      });
    }
  }

  prepareArtifact(): void {}
  create(cell: CellRecord): void {
    if (this.cells.has(cell.cellId)) {
      throw new RelayHostError("HOST_RUNTIME_RESOURCE_COLLISION", `Preview Cell ${cell.cellId} already exists.`);
    }
    this.cells.set(cell.cellId, this.observation(cell, false));
  }
  start(cell: CellRecord): void {
    this.cells.set(cell.cellId, this.observation(cell, true));
  }
  stop(cell: CellRecord): void {
    if (!this.cells.has(cell.cellId)) {
      throw new RelayHostError("HOST_RUNTIME_CELL_MISSING", `Preview Cell ${cell.cellId} does not exist.`);
    }
    this.cells.set(cell.cellId, this.observation(cell, false));
  }
  remove(cell: CellRecord): void {
    this.cells.delete(cell.cellId);
  }
  inspect(cell: CellRecord): RuntimeCellObservation {
    return this.cells.get(cell.cellId) ?? {
      ...this.observation(cell, false),
      exists: false,
    };
  }
  inventory(): RuntimeCellObservation[] {
    return [...this.cells.values()].sort((left, right) => left.cellId.localeCompare(right.cellId));
  }
  private observation(cell: CellRecord, running: boolean): RuntimeCellObservation {
    return {
      cellId: cell.cellId,
      exists: true,
      running,
      containerName: cell.allocation.containerName,
      networkName: cell.allocation.networkName,
    };
  }
}

function licenseView(inspections: HostLicenseInspection[]): HostDeploymentLicenseView {
  const effective = selectEffectiveHostLicense(inspections);
  if (effective) {
    const active = effective.term === "active";
    return {
      status: active ? "active" : "lapsed",
      code: active ? "HOST_LICENSE_ACTIVE" : "HOST_LICENSE_LAPSED",
      detail: active
        ? `Managed Host rights are active through ${effective.expiresAt}.`
        : "Managed Host automation has lapsed. Existing continuity and recovery remain available.",
      licenseId: effective.licenseId,
      licenseeRef: effective.grant.licensee.ref,
      managedCellsLimit: effective.grant.limits.managed_cells,
      expiresAt: effective.expiresAt,
    };
  }
  const failure = inspections.find((inspection) =>
    !inspection.ok && !(
      inspection.code === "HOST_GRANT_INVALID" &&
      inspection.detail.startsWith("Host license product/tier must be")
    ));
  if (failure && !failure.ok) {
    return {
      status: "invalid",
      code: failure.code,
      detail: failure.detail,
      licenseId: null,
      licenseeRef: null,
      managedCellsLimit: null,
      expiresAt: null,
    };
  }
  return {
    status: "missing",
    code: "HOST_LICENSE_REQUIRED",
    detail: "A signed product:relay-host license is required for managed Host automation.",
    licenseId: null,
    licenseeRef: null,
    managedCellsLimit: null,
    expiresAt: null,
  };
}

function requireActiveLicense(inspections: HostLicenseInspection[]): HostLicenseInspectionOk {
  const effective = selectEffectiveHostLicense(inspections);
  if (!effective) {
    const view = licenseView(inspections);
    throw new RelayHostError(view.code, view.detail);
  }
  if (effective.term !== "active") {
    throw new RelayHostError(
      "HOST_LICENSE_LAPSED",
      "Managed Host expansion requires a current product:relay-host term.",
    );
  }
  return effective;
}

function draftPlan(draft: HostDeploymentDraft) {
  const estimate = estimateHostDeployment(draft);
  const release = currentRelayCellRelease();
  return {
    draft: { ...draft, updatedAt: 0 },
    estimate,
    artifactVersion: release.relayVersion,
    artifactDigest: release.imageDigest,
  };
}

function planDigest(draft: HostDeploymentDraft): `sha256:${string}` {
  return hostPlanDigest(draftPlan(draft));
}

function draftEqual(left: HostDeploymentDraft, right: HostDeploymentDraft): boolean {
  return planDigest(left) === planDigest(right);
}

export class HostDeploymentService {
  private readonly store: HostDeploymentStore;
  private readonly licenseDirectory: string;
  private readonly now: () => Date;

  constructor(options: { root?: string; licenseDir?: string; now?: () => Date } = {}) {
    this.store = new HostDeploymentStore(options.root);
    this.licenseDirectory = options.licenseDir ?? licensesDir();
    this.now = options.now ?? (() => new Date());
  }

  view(): HostDeploymentView {
    const journey = this.store.read();
    const inspections = this.inspections();
    let registry: HostRegistry | null = null;
    try {
      if (!existsSync(join(this.store.root, "host.db"))) {
        return {
          journey,
          license: licenseView(inspections),
          runtimeMode: this.runtimeMode(journey.draft),
          host: null,
          cells: [],
          receipts: [],
        };
      }
      registry = new HostRegistry(this.store.root);
      const host = registry.getHost();
      return {
        journey,
        license: licenseView(inspections),
        runtimeMode: this.runtimeMode(journey.draft),
        host: host
          ? {
              hostId: host.hostId,
              supervisorVersion: host.supervisorVersion,
              actualState: host.actualState,
              desiredState: host.desiredState,
              capacity: host.capacity,
            }
          : null,
        cells: registry.listCells().map((cell) => ({
          cellId: cell.cellId,
          ownerRef: cell.ownerRef,
          version: cell.artifact.version,
          imageDigest: cell.artifact.imageDigest,
          state: cell.actualState,
          health: cell.health,
          backupStatus: cell.backupStatus,
          loopbackPort: cell.allocation.hostLoopbackPort,
          cpuMillis: cell.allocation.cpuMillis,
          memoryBytes: cell.allocation.memoryBytes,
          storageBytes: cell.allocation.storageBytes,
          lastReceiptId: cell.lastReceiptId,
        })),
        receipts: registry.listOperations().slice(0, 20).map((receipt) => ({
          receiptId: receipt.receiptId,
          operationId: receipt.operationId,
          cellId: receipt.cellId,
          action: receipt.action,
          outcome: receipt.outcome,
          reasonCode: receipt.reasonCode,
          startedAt: receipt.startedAt,
          completedAt: receipt.completedAt,
        })),
      };
    } finally {
      registry?.close();
    }
  }

  mutate(mutation: HostDeploymentMutation): HostDeploymentView {
    if (mutation.action === "save_draft") {
      requireActiveLicense(this.inspections());
      const now = this.now().getTime();
      const draft = HostDeploymentDraftSchema.parse({ ...mutation.draft, updatedAt: now });
      this.store.update((current) => {
        if (draftEqual(current.draft, draft)) return { ...current, draft, updatedAt: now };
        if (existsSync(join(this.store.root, "host.db"))) {
          throw new RelayHostError(
            "HOST_DEPLOYMENT_CONFIG_LOCKED",
            "This Host is already installed. Placement and capacity changes require a separately confirmed migration or another Host root.",
          );
        }
        return {
          ...current,
          draft,
          stage: "configure",
          planDigest: null,
          estimate: null,
          providerHostRef: null,
          authorizationConfirmedAt: null,
          invalidatedReason: "Configuration changed. Review the new estimate and rerun preflight.",
          lastReasonCode: "HOST_DEPLOYMENT_PLAN_INVALIDATED",
          updatedAt: now,
        };
      });
      return this.view();
    }

    const journey = this.store.read();
    if (mutation.action === "estimate") {
      requireActiveLicense(this.inspections());
      const now = this.now().getTime();
      this.store.update((current) => ({
        ...current,
        stage: "estimated",
        planDigest: planDigest(current.draft),
        estimate: estimateHostDeployment(current.draft),
        invalidatedReason: null,
        lastReasonCode: "HOST_DEPLOYMENT_ESTIMATED",
        updatedAt: now,
      }));
      return this.view();
    }

    if (mutation.action === "preflight") {
      const license = requireActiveLicense(this.inspections());
      this.assertCurrentPlan(journey, mutation.planDigest);
      if (!journey.estimate) throw new RelayHostError("HOST_DEPLOYMENT_ESTIMATE_REQUIRED", "Run the Host estimate before preflight.");
      if (journey.draft.desiredCells > license.grant.limits.managed_cells) {
        throw new RelayHostError(
          "HOST_GRANT_MANAGED_CELL_LIMIT",
          `The signed Host license allows ${license.grant.limits.managed_cells} managed Cells.`,
        );
      }
      if (journey.estimate.hostCount !== 1) {
        throw new RelayHostError(
          "HOST_CAPACITY_SHARD_REQUIRED",
          "This Host size cannot admit the requested Cells. Choose a larger Host or reduce Cell count; multi-Host Fleet control is not part of this release.",
        );
      }
      if (journey.draft.placement === "cloud_preview" && journey.draft.exposure === "local") {
        throw new RelayHostError("HOST_EXPOSURE_INVALID", "Cloud preview requires tailnet or authenticated public ingress.");
      }
      const now = this.now().getTime();
      this.store.update((current) => ({
        ...current,
        stage: "preflight_passed",
        lastReasonCode: "HOST_DEPLOYMENT_PREFLIGHT_PASSED",
        updatedAt: now,
      }));
      return this.view();
    }

    if (mutation.action === "authorize") {
      requireActiveLicense(this.inspections());
      this.assertCurrentPlan(journey, mutation.planDigest);
      if (journey.stage !== "preflight_passed") {
        throw new RelayHostError("HOST_DEPLOYMENT_PREFLIGHT_REQUIRED", "Preflight must pass before authorization.");
      }
      const now = this.now().getTime();
      this.store.update((current) => ({
        ...current,
        stage: "authorized",
        authorizationConfirmedAt: now,
        lastReasonCode: "HOST_DEPLOYMENT_AUTHORIZED",
        updatedAt: now,
      }));
      return this.view();
    }

    if (mutation.action === "install") {
      const license = requireActiveLicense(this.inspections());
      this.assertCurrentPlan(journey, mutation.planDigest);
      if (journey.stage !== "authorized") {
        throw new RelayHostError("HOST_DEPLOYMENT_AUTHORIZATION_REQUIRED", "Confirm the Host plan before installation.");
      }
      let providerHostRef: string | null = null;
      if (journey.draft.placement === "cloud_preview") {
        providerHostRef = new FakeHostBootstrapProvider().provision(
          {
            providerKind: "fake",
            regionRef: journey.draft.regionRef,
            sizeRef: journey.draft.sizeRef,
            hostLabel: journey.draft.hostId,
          },
          "confirmed-in-memory",
        ).providerHostRef;
      }
      let registry: HostRegistry | null = null;
      try {
        if (existsSync(join(this.store.root, "host.db"))) {
          registry = new HostRegistry(this.store.root);
          const existing = registry.getHost();
          const expectedCapacity = hostCapacityForDraft(journey.draft);
          if (
            !existing ||
            existing.hostId !== journey.draft.hostId ||
            existing.licenseeRef !== license.grant.licensee.ref ||
            JSON.stringify(existing.capacity) !== JSON.stringify(expectedCapacity)
          ) {
            throw new RelayHostError("HOST_REGISTRY_ALREADY_INITIALIZED", "This Host root already has a different Host identity, licensee or capacity contract.");
          }
        } else {
          const initialized = initializeRelayHost({
            root: this.store.root,
            hostId: journey.draft.hostId,
            runtimeKind: "docker",
            capacity: hostCapacityForDraft(journey.draft),
            licenseDir: this.licenseDirectory,
            supervisorVersion: relayProductVersion(),
            now: this.now(),
          });
          registry = initialized.registry;
        }
      } finally {
        registry?.close();
      }
      const now = this.now().getTime();
      this.store.update((current) => ({
        ...current,
        stage: "installed",
        providerHostRef,
        lastReasonCode: "HOST_DEPLOYMENT_INSTALLED",
        updatedAt: now,
      }));
      return this.view();
    }

    if (mutation.action === "create_cell") {
      requireActiveLicense(this.inspections());
      if (!existsSync(join(this.store.root, "host.db"))) {
        throw new RelayHostError("HOST_REGISTRY_NOT_INITIALIZED", "Install the Relay Host before creating a Cell.");
      }
      this.withSupervisor(journey.draft, (supervisor, registry) => {
        const replay = registry.listOperations().find((receipt) => receipt.operationId === mutation.operationId);
        if (replay) {
          if (replay.action !== "create" || replay.cellId !== mutation.cellId) {
            throw new RelayHostError("HOST_OPERATION_REPLAY_CONFLICT", "Operation ID is already bound to a different Host lifecycle plan.");
          }
          return;
        }
        const used = new Set(registry.listCells().map((cell) => cell.allocation.hostLoopbackPort));
        let loopbackPort = 4100;
        while (used.has(loopbackPort)) loopbackPort += 1;
        const release = currentRelayCellRelease();
        const receipt = supervisor.create({
          operationId: mutation.operationId,
          manifest: {
            schema: HOST_CELL_MANIFEST_SCHEMA,
            cellId: mutation.cellId,
            ownerRef: mutation.ownerRef,
            origin: "create",
            artifact: {
              version: release.relayVersion,
              imageReference: `${release.imageRepository}@${release.imageDigest}`,
              imageDigest: release.imageDigest,
              schemaMin: 1,
              schemaMax: 1,
            },
            loopbackPort,
            resources: {
              cpuMillis: 500,
              memoryBytes: GIB,
              storageBytes: 10 * GIB,
            },
          },
        });
        this.recordLifecycle(receipt.reasonCode, receipt.outcome === "succeeded");
      });
      return this.view();
    }

    this.withSupervisor(journey.draft, (supervisor, registry) => {
      const replay = registry.listOperations().find((receipt) => receipt.operationId === mutation.operationId);
      if (replay) {
        if (replay.action !== mutation.lifecycle || replay.cellId !== mutation.cellId) {
          throw new RelayHostError("HOST_OPERATION_REPLAY_CONFLICT", "Operation ID is already bound to a different Host lifecycle plan.");
        }
        return;
      }
      const input = { operationId: mutation.operationId, cellId: mutation.cellId };
      const receipt =
        mutation.lifecycle === "start" ? supervisor.start(input)
          : mutation.lifecycle === "stop" ? supervisor.stop(input)
            : mutation.lifecycle === "restart" ? supervisor.restart(input)
              : mutation.lifecycle === "retain" ? supervisor.retain(input)
                : supervisor.purge({ ...input, confirmation: mutation.confirmation ?? "" });
      this.recordLifecycle(receipt.reasonCode, receipt.outcome === "succeeded");
    });
    return this.view();
  }

  private inspections(): HostLicenseInspection[] {
    return inspectStoredHostLicenses({ licenseDir: this.licenseDirectory, now: this.now() });
  }

  private assertCurrentPlan(journey: ReturnType<HostDeploymentStore["read"]>, supplied: string): void {
    const current = planDigest(journey.draft);
    if (!journey.planDigest || journey.planDigest !== current || supplied !== current) {
      throw new RelayHostError("HOST_DEPLOYMENT_PLAN_STALE", "The Host plan changed. Review the estimate and rerun preflight.");
    }
  }

  private runtimeMode(draft: HostDeploymentDraft): "preview" | "docker" {
    return draft.placement === "cloud_preview" || process.env.RELAY_HOST_UI_RUNTIME === "preview" || process.env.RELAY_DEV_MODE === "true" || process.env.NODE_ENV === "test"
      ? "preview"
      : "docker";
  }

  private withSupervisor(
    draft: HostDeploymentDraft,
    effect: (supervisor: RelayHostSupervisor, registry: HostRegistry) => void,
  ): void {
    const registry = new HostRegistry(this.store.root);
    try {
      const runtime = this.runtimeMode(draft) === "preview"
        ? new PreviewHostRuntimeAdapter(registry.listCells())
        : new DockerHostRuntimeAdapter();
      effect(new RelayHostSupervisor({
        registry,
        runtime,
        licenseDir: this.licenseDirectory,
        actorRef: "settings-admin",
        now: this.now,
      }), registry);
    } finally {
      registry.close();
    }
  }

  private recordLifecycle(reasonCode: string, succeeded: boolean): void {
    const now = this.now().getTime();
    this.store.update((current) => ({
      ...current,
      stage: succeeded ? "ready" : "failed",
      lastReasonCode: reasonCode,
      updatedAt: now,
    }));
  }
}
