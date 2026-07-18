import { chmodSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  CellRecordSchema,
  HOST_REGISTRY_SCHEMA_VERSION,
  HostConfigSchema,
  LifecycleReceiptSchema,
  type CellActualState,
  type CellRecord,
  type HostConfig,
  type HostOperationAction,
  type LifecycleReceipt,
} from "./contracts";
import { RelayHostError, hostError } from "./errors";
import { assertCellTransition, assertContentFree } from "./policy";

type CellRow = {
  cellId: string;
  recordJson: string;
  actualState: string;
  active: number;
  containerName: string;
  dataRoot: string;
  secretRootRef: string;
  networkName: string;
  loopbackPort: number;
  cpuMillis: number;
  memoryBytes: number;
  storageBytes: number;
  manifestDigest: string;
};

type OperationRow = {
  operationId: string;
  planDigest: string;
  cellId: string | null;
  action: string;
  outcome: string;
  receiptJson: string;
};

function parseJson(value: string, code: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new RelayHostError(code, "Relay Host registry contains invalid JSON.", undefined, {
      cause: error,
    });
  }
}

const CELL_ROW_SELECT = `
  cell_id AS cellId,
  record_json AS recordJson,
  actual_state AS actualState,
  active,
  container_name AS containerName,
  data_root AS dataRoot,
  secret_root_ref AS secretRootRef,
  network_name AS networkName,
  loopback_port AS loopbackPort,
  cpu_millis AS cpuMillis,
  memory_bytes AS memoryBytes,
  storage_bytes AS storageBytes,
  manifest_digest AS manifestDigest
`;

function parseCellRow(row: CellRow): CellRecord {
  const parsed = CellRecordSchema.safeParse(
    parseJson(row.recordJson, "HOST_REGISTRY_CORRUPT"),
  );
  if (!parsed.success) {
    throw new RelayHostError(
      "HOST_REGISTRY_CORRUPT",
      `Relay Host registry contains an invalid Cell record for ${row.cellId}.`,
    );
  }
  const record = parsed.data;
  const expectedActive = ["absent", "exported", "purged"].includes(record.actualState)
    ? 0
    : 1;
  if (
    record.cellId !== row.cellId ||
    record.actualState !== row.actualState ||
    expectedActive !== row.active ||
    record.allocation.containerName !== row.containerName ||
    record.allocation.dataRoot !== row.dataRoot ||
    record.allocation.secretRootRef !== row.secretRootRef ||
    record.allocation.networkName !== row.networkName ||
    record.allocation.hostLoopbackPort !== row.loopbackPort ||
    record.allocation.cpuMillis !== row.cpuMillis ||
    record.allocation.memoryBytes !== row.memoryBytes ||
    record.allocation.storageBytes !== row.storageBytes ||
    record.manifestDigest !== row.manifestDigest
  ) {
    throw new RelayHostError(
      "HOST_REGISTRY_CORRUPT",
      `Relay Host registry normalized fields disagree with Cell record ${row.cellId}.`,
    );
  }
  return record;
}

export function relayHostRoot(explicit?: string): string {
  return resolve(
    explicit ??
      process.env.RELAY_HOST_ROOT ??
      join(process.env.HOME ?? process.cwd(), ".relay-host"),
  );
}

export class HostRegistry {
  readonly root: string;
  readonly path: string;
  private readonly db: Database.Database;

  constructor(root?: string) {
    this.root = relayHostRoot(root);
    this.path = join(this.root, "host.db");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    chmodSync(this.root, 0o700);
    try {
      this.db = new Database(this.path);
      chmodSync(this.path, 0o600);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      this.bootstrap();
      for (const candidate of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
        try {
          chmodSync(candidate, 0o600);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    } catch (error) {
      if (error instanceof RelayHostError) throw error;
      throw new RelayHostError(
        "HOST_REGISTRY_UNAVAILABLE",
        `Could not open the Relay Host registry at ${this.path}.`,
        undefined,
        { cause: error },
      );
    }
  }

  private bootstrap(): void {
    const version = Number(this.db.pragma("user_version", { simple: true }));
    if (version > HOST_REGISTRY_SCHEMA_VERSION) {
      throw new RelayHostError(
        "HOST_REGISTRY_SCHEMA_UNSUPPORTED",
        `Relay Host registry schema ${version} is newer than supported schema ${HOST_REGISTRY_SCHEMA_VERSION}.`,
      );
    }
    if (version !== 0 && version !== HOST_REGISTRY_SCHEMA_VERSION) {
      throw new RelayHostError(
        "HOST_REGISTRY_SCHEMA_UNSUPPORTED",
        `Relay Host registry schema ${version} is unsupported.`,
      );
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS host_config (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS host_cells (
        cell_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL,
        actual_state TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        container_name TEXT NOT NULL,
        data_root TEXT NOT NULL,
        secret_root_ref TEXT NOT NULL,
        network_name TEXT NOT NULL,
        loopback_port INTEGER NOT NULL,
        cpu_millis INTEGER NOT NULL,
        memory_bytes INTEGER NOT NULL,
        storage_bytes INTEGER NOT NULL,
        manifest_digest TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS host_cells_active_container
        ON host_cells(container_name) WHERE active = 1;
      CREATE UNIQUE INDEX IF NOT EXISTS host_cells_active_data_root
        ON host_cells(data_root) WHERE active = 1;
      CREATE UNIQUE INDEX IF NOT EXISTS host_cells_active_secret_root
        ON host_cells(secret_root_ref) WHERE active = 1;
      CREATE UNIQUE INDEX IF NOT EXISTS host_cells_active_network
        ON host_cells(network_name) WHERE active = 1;
      CREATE UNIQUE INDEX IF NOT EXISTS host_cells_active_port
        ON host_cells(loopback_port) WHERE active = 1;
      CREATE TABLE IF NOT EXISTS host_operations (
        operation_id TEXT PRIMARY KEY,
        plan_digest TEXT NOT NULL,
        cell_id TEXT,
        action TEXT NOT NULL,
        outcome TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS host_operations_cell_created
        ON host_operations(cell_id, created_at DESC);
    `);
    this.db.pragma(`user_version = ${HOST_REGISTRY_SCHEMA_VERSION}`);
  }

  close(): void {
    this.db.close();
  }

  quickCheck(): void {
    if (this.db.pragma("quick_check", { simple: true }) !== "ok") {
      throw new RelayHostError(
        "HOST_REGISTRY_CORRUPT",
        "Relay Host registry failed SQLite integrity verification.",
      );
    }
  }

  initializeHost(record: HostConfig): HostConfig {
    const parsed = HostConfigSchema.parse(record);
    assertContentFree(parsed);
    const initialize = this.db.transaction(() => {
      const current = this.getHost();
      if (current) {
        if (
          current.hostId !== parsed.hostId ||
          current.licenseeRef !== parsed.licenseeRef ||
          current.runtimeKind !== parsed.runtimeKind
        ) {
          throw new RelayHostError(
            "HOST_REGISTRY_ALREADY_INITIALIZED",
            "Relay Host registry is already initialized with a different Host identity.",
          );
        }
        return current;
      }
      this.db
        .prepare("INSERT INTO host_config (singleton, record_json) VALUES (1, ?)")
        .run(JSON.stringify(parsed));
      return parsed;
    });
    try {
      return initialize.immediate();
    } catch (error) {
      throw hostError(error, "HOST_REGISTRY_TRANSACTION_FAILED");
    }
  }

  getHost(): HostConfig | null {
    const row = this.db
      .prepare("SELECT record_json AS recordJson FROM host_config WHERE singleton = 1")
      .get() as { recordJson: string } | undefined;
    if (!row) return null;
    const parsed = HostConfigSchema.safeParse(
      parseJson(row.recordJson, "HOST_REGISTRY_CORRUPT"),
    );
    if (!parsed.success) {
      throw new RelayHostError(
        "HOST_REGISTRY_CORRUPT",
        "Relay Host registry contains an invalid Host record.",
      );
    }
    return parsed.data;
  }

  getCell(cellId: string): CellRecord | null {
    const row = this.db
      .prepare(`SELECT ${CELL_ROW_SELECT} FROM host_cells WHERE cell_id = ?`)
      .get(cellId) as CellRow | undefined;
    if (!row) return null;
    return parseCellRow(row);
  }

  listCells(): CellRecord[] {
    const rows = this.db
      .prepare(`SELECT ${CELL_ROW_SELECT} FROM host_cells ORDER BY cell_id`)
      .all() as CellRow[];
    return rows.map(parseCellRow);
  }

  reserveCell(record: CellRecord): void {
    const parsed = CellRecordSchema.parse(record);
    assertContentFree(parsed);
    const host = this.getHost();
    if (!host) {
      throw new RelayHostError(
        "HOST_REGISTRY_NOT_INITIALIZED",
        "Initialize the Relay Host before creating a managed Cell.",
      );
    }
    const reserve = this.db.transaction(() => {
      const existing = this.getCell(parsed.cellId);
      if (existing) {
        throw new RelayHostError(
          existing.actualState === "purged"
            ? "HOST_CELL_ID_RETIRED"
            : "HOST_CELL_ALREADY_EXISTS",
          `Managed Cell ${parsed.cellId} is already registered.`,
        );
      }
      const used = this.db
        .prepare(`
          SELECT
            COALESCE(SUM(cpu_millis), 0) AS cpuMillis,
            COALESCE(SUM(memory_bytes), 0) AS memoryBytes,
            COALESCE(SUM(storage_bytes), 0) AS storageBytes
          FROM host_cells WHERE active = 1
        `)
        .get() as { cpuMillis: number; memoryBytes: number; storageBytes: number };
      const factor = (100 - host.capacity.reservePercent) / 100;
      const available = {
        cpuMillis: Math.floor(host.capacity.cpuMillis * factor),
        memoryBytes: Math.floor(host.capacity.memoryBytes * factor),
        storageBytes: Math.floor(host.capacity.storageBytes * factor),
      };
      const requested = parsed.allocation;
      if (
        used.cpuMillis + requested.cpuMillis > available.cpuMillis ||
        used.memoryBytes + requested.memoryBytes > available.memoryBytes ||
        used.storageBytes + requested.storageBytes > available.storageBytes
      ) {
        throw new RelayHostError(
          "HOST_PHYSICAL_CAPACITY_EXCEEDED",
          "Relay Host capacity plus its safety reserve cannot admit this Cell.",
          {
            usedCpuMillis: used.cpuMillis,
            availableCpuMillis: available.cpuMillis,
            usedMemoryBytes: used.memoryBytes,
            availableMemoryBytes: available.memoryBytes,
            usedStorageBytes: used.storageBytes,
            availableStorageBytes: available.storageBytes,
          },
        );
      }
      try {
        this.db
          .prepare(`
            INSERT INTO host_cells (
              cell_id, record_json, actual_state, active, container_name,
              data_root, secret_root_ref, network_name, loopback_port,
              cpu_millis, memory_bytes, storage_bytes, manifest_digest
            ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            parsed.cellId,
            JSON.stringify(parsed),
            parsed.actualState,
            parsed.allocation.containerName,
            parsed.allocation.dataRoot,
            parsed.allocation.secretRootRef,
            parsed.allocation.networkName,
            parsed.allocation.hostLoopbackPort,
            parsed.allocation.cpuMillis,
            parsed.allocation.memoryBytes,
            parsed.allocation.storageBytes,
            parsed.manifestDigest,
          );
      } catch (error) {
        if ((error as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT")) {
          throw new RelayHostError(
            "HOST_RESOURCE_COLLISION",
            "A Relay Host resource is already reserved by another managed Cell.",
          );
        }
        throw error;
      }
    });
    try {
      reserve.immediate();
    } catch (error) {
      throw hostError(error, "HOST_REGISTRY_TRANSACTION_FAILED");
    }
  }

  updateCellState(
    cellId: string,
    expected: CellActualState | readonly CellActualState[],
    next: CellActualState,
    patch: Partial<Pick<CellRecord, "desiredState" | "health" | "backupStatus" | "checkpointRef" | "lastReceiptId">> = {},
  ): CellRecord {
    const expectedStates = Array.isArray(expected) ? expected : [expected];
    const update = this.db.transaction(() => {
      const current = this.getCell(cellId);
      if (!current) {
        throw new RelayHostError("HOST_CELL_NOT_FOUND", `Managed Cell ${cellId} is not registered.`);
      }
      if (!expectedStates.includes(current.actualState)) {
        throw new RelayHostError(
          "HOST_TRANSITION_STALE",
          `Managed Cell ${cellId} is ${current.actualState}, expected ${expectedStates.join(" or ")}.`,
        );
      }
      assertCellTransition(current.actualState, next);
      const record = CellRecordSchema.parse({
        ...current,
        ...patch,
        actualState: next,
        updatedAt: Date.now(),
      });
      assertContentFree(record);
      const active = next === "absent" || next === "exported" || next === "purged" ? 0 : 1;
      const result = this.db
        .prepare(`
          UPDATE host_cells
          SET record_json = ?, actual_state = ?, active = ?
          WHERE cell_id = ? AND actual_state = ?
        `)
        .run(JSON.stringify(record), next, active, cellId, current.actualState);
      if (result.changes !== 1) {
        throw new RelayHostError(
          "HOST_TRANSITION_STALE",
          `Managed Cell ${cellId} changed during the lifecycle operation.`,
        );
      }
      return record;
    });
    try {
      return update.immediate();
    } catch (error) {
      throw hostError(error, "HOST_REGISTRY_TRANSACTION_FAILED");
    }
  }

  beginOperation(input: {
    operationId: string;
    planDigest: `sha256:${string}`;
    cellId: string | null;
    actorRef: string;
    action: HostOperationAction;
    resourceRefs: string[];
    now?: number;
  }): { replay: boolean; receipt: LifecycleReceipt } {
    const existing = this.getOperation(input.operationId);
    if (existing) {
      if (existing.planDigest !== input.planDigest) {
        throw new RelayHostError(
          "HOST_OPERATION_REPLAY_CONFLICT",
          `Operation ${input.operationId} already exists with a different plan.`,
        );
      }
      return { replay: true, receipt: existing };
    }
    const now = input.now ?? Date.now();
    const receipt = LifecycleReceiptSchema.parse({
      schemaVersion: HOST_REGISTRY_SCHEMA_VERSION,
      receiptId: randomUUID(),
      operationId: input.operationId,
      planDigest: input.planDigest,
      hostId: this.getHost()?.hostId,
      cellId: input.cellId,
      actorRef: input.actorRef,
      action: input.action,
      outcome: "running",
      reasonCode: "HOST_OPERATION_STARTED",
      resourceRefs: input.resourceRefs,
      startedAt: now,
      completedAt: null,
    });
    assertContentFree(receipt);
    try {
      this.db
        .prepare(`
          INSERT INTO host_operations (
            operation_id, plan_digest, cell_id, action, outcome,
            receipt_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          receipt.operationId,
          receipt.planDigest,
          receipt.cellId,
          receipt.action,
          receipt.outcome,
          JSON.stringify(receipt),
          now,
          now,
        );
    } catch (error) {
      if ((error as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT")) {
        const raced = this.getOperation(input.operationId);
        if (raced?.planDigest === input.planDigest) return { replay: true, receipt: raced };
        throw new RelayHostError(
          "HOST_OPERATION_REPLAY_CONFLICT",
          `Operation ${input.operationId} was claimed concurrently with a different plan.`,
        );
      }
      throw hostError(error, "HOST_REGISTRY_TRANSACTION_FAILED");
    }
    return { replay: false, receipt };
  }

  completeOperation(
    operationId: string,
    outcome: Exclude<LifecycleReceipt["outcome"], "running">,
    reasonCode: string,
    now = Date.now(),
  ): LifecycleReceipt {
    const current = this.getOperation(operationId);
    if (!current) {
      throw new RelayHostError(
        "HOST_OPERATION_NOT_FOUND",
        `Operation ${operationId} is not registered.`,
      );
    }
    if (current.outcome !== "running") return current;
    const receipt = LifecycleReceiptSchema.parse({
      ...current,
      outcome,
      reasonCode,
      completedAt: now,
    });
    assertContentFree(receipt);
    const result = this.db
      .prepare(`
        UPDATE host_operations
        SET outcome = ?, receipt_json = ?, updated_at = ?
        WHERE operation_id = ? AND outcome = 'running'
      `)
      .run(outcome, JSON.stringify(receipt), now, operationId);
    if (result.changes !== 1) return this.getOperation(operationId) ?? receipt;
    return receipt;
  }

  getOperation(operationId: string): LifecycleReceipt | null {
    const row = this.db
      .prepare(`
        SELECT operation_id AS operationId, plan_digest AS planDigest,
          cell_id AS cellId, action, outcome, receipt_json AS receiptJson
        FROM host_operations WHERE operation_id = ?
      `)
      .get(operationId) as OperationRow | undefined;
    if (!row) return null;
    const parsed = LifecycleReceiptSchema.safeParse(
      parseJson(row.receiptJson, "HOST_REGISTRY_CORRUPT"),
    );
    if (
      !parsed.success ||
      parsed.data.operationId !== row.operationId ||
      parsed.data.planDigest !== row.planDigest ||
      parsed.data.cellId !== row.cellId ||
      parsed.data.action !== row.action ||
      parsed.data.outcome !== row.outcome
    ) {
      throw new RelayHostError(
        "HOST_REGISTRY_CORRUPT",
        `Relay Host registry contains an invalid operation ${operationId}.`,
      );
    }
    return parsed.data;
  }

  listOperations(): LifecycleReceipt[] {
    const rows = this.db
      .prepare("SELECT operation_id AS operationId FROM host_operations ORDER BY created_at, operation_id")
      .all() as Array<{ operationId: string }>;
    return rows.map((row) => this.getOperation(row.operationId)!);
  }

}
