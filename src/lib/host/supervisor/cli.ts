import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { licensesDir } from "@/lib/licensing/store";
import { RelayHostError, hostError } from "./errors";
import { HostRegistry, relayHostRoot } from "./registry";
import {
  DockerHostRuntimeAdapter,
  type HostRuntimeAdapter,
} from "./runtime";
import {
  initializeRelayHost,
  RelayHostSupervisor,
} from "./supervisor";

export interface HostCommandIo {
  log: (message: string) => void;
  error: (message: string) => void;
}

export interface HostCommandDependencies {
  version: string;
  now?: () => Date;
  runtimeFactory?: (kind: "docker" | "podman") => HostRuntimeAdapter;
}

const USAGE = [
  "Usage: relay host <action> [options]",
  "  init --host-id <id> --cpu-millis <n> --memory-bytes <n> --storage-bytes <n>",
  "  inventory",
  "  create --manifest <file> [--operation-id <id>]",
  "  start|stop|restart|retain --cell-id <id> [--operation-id <id>]",
  "  export-release --cell-id <id> --checkpoint-ref sha256:<digest> --checkpoint-receipt <file> --checkpoint-bundle <file>",
  "  purge --cell-id <id> --confirm <id>",
  "  reconcile",
  "Common: --host-root <path> --license-dir <path> --actor-ref <opaque-ref>",
].join("\n");

const COMMON_OPTIONS = ["host-root", "license-dir", "actor-ref"] as const;
const ACTION_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  help: [],
  init: ["host-id", "cpu-millis", "memory-bytes", "storage-bytes", "reserve-percent", "runtime"],
  inventory: [],
  create: ["manifest", "operation-id"],
  start: ["cell-id", "operation-id"],
  stop: ["cell-id", "operation-id"],
  restart: ["cell-id", "operation-id"],
  retain: ["cell-id", "operation-id"],
  "export-release": ["cell-id", "operation-id", "checkpoint-ref", "checkpoint-receipt", "checkpoint-bundle"],
  purge: ["cell-id", "operation-id", "confirm"],
  reconcile: [],
};

function parseOptions(argv: string[]): { action: string | undefined; values: Map<string, string> } {
  const [action, ...rest] = argv;
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new RelayHostError("HOST_CLI_ARGUMENT_INVALID", `Unexpected argument: ${token}`);
    }
    const equal = token.indexOf("=");
    if (equal > 2) {
      const name = token.slice(2, equal);
      if (values.has(name)) {
        throw new RelayHostError("HOST_CLI_ARGUMENT_INVALID", `Duplicate --${name} option.`);
      }
      values.set(name, token.slice(equal + 1));
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new RelayHostError("HOST_CLI_ARGUMENT_INVALID", `Missing value for ${token}.`);
    }
    const name = token.slice(2);
    if (values.has(name)) {
      throw new RelayHostError("HOST_CLI_ARGUMENT_INVALID", `Duplicate --${name} option.`);
    }
    values.set(name, value);
    index += 1;
  }
  return { action, values };
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) {
    throw new RelayHostError("HOST_CLI_ARGUMENT_REQUIRED", `Missing --${name}.`);
  }
  return value;
}

function assertKnownOptions(action: string, values: Map<string, string>): void {
  const allowed = new Set([...COMMON_OPTIONS, ...(ACTION_OPTIONS[action] ?? [])]);
  for (const name of values.keys()) {
    if (!allowed.has(name)) {
      throw new RelayHostError(
        "HOST_CLI_ARGUMENT_INVALID",
        `Unknown --${name} option for relay host ${action}.`,
      );
    }
  }
}

function positiveInteger(values: Map<string, string>, name: string): number {
  const raw = required(values, name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RelayHostError(
      "HOST_CLI_ARGUMENT_INVALID",
      `--${name} must be a positive integer.`,
    );
  }
  return value;
}

function operationId(values: Map<string, string>): string {
  return values.get("operation-id") ?? randomUUID();
}

function defaultRuntimeFactory(kind: "docker" | "podman"): HostRuntimeAdapter {
  if (kind !== "docker") {
    throw new RelayHostError(
      "HOST_RUNTIME_UNSUPPORTED",
      "Podman is represented by the Host contract but is not a supported launch adapter yet.",
    );
  }
  return new DockerHostRuntimeAdapter();
}

export async function runHostCommand(
  argv: string[],
  io: HostCommandIo,
  dependencies: HostCommandDependencies,
): Promise<number> {
  let registry: HostRegistry | undefined;
  try {
    const { action, values } = parseOptions(argv);
    if (!action || action === "help") {
      io.log(USAGE);
      return action === "help" ? 0 : 1;
    }
    if (!(action in ACTION_OPTIONS)) {
      throw new RelayHostError(
        "HOST_CLI_ACTION_UNKNOWN",
        `Unknown Relay Host action: ${action}.`,
      );
    }
    assertKnownOptions(action, values);
    const root = relayHostRoot(values.get("host-root"));
    const licenseDirectory = values.get("license-dir") ?? licensesDir();
    const actorRef = values.get("actor-ref") ?? "local-admin";
    const runtimeFactory = dependencies.runtimeFactory ?? defaultRuntimeFactory;

    if (action === "init") {
      const runtimeKind = (values.get("runtime") ?? "docker") as "docker" | "podman";
      if (runtimeKind !== "docker") {
        throw new RelayHostError(
          "HOST_RUNTIME_UNSUPPORTED",
          `Unsupported Relay Host runtime: ${runtimeKind}. The current CLI supports Docker only.`,
        );
      }
      const reservePercent = Number(values.get("reserve-percent") ?? "20");
      if (!Number.isSafeInteger(reservePercent) || reservePercent < 0 || reservePercent > 50) {
        throw new RelayHostError(
          "HOST_CLI_ARGUMENT_INVALID",
          "--reserve-percent must be an integer from 0 through 50.",
        );
      }
      const initialized = initializeRelayHost({
        root,
        hostId: required(values, "host-id"),
        runtimeKind,
        capacity: {
          cpuMillis: positiveInteger(values, "cpu-millis"),
          memoryBytes: positiveInteger(values, "memory-bytes"),
          storageBytes: positiveInteger(values, "storage-bytes"),
          reservePercent,
        },
        licenseDir: licenseDirectory,
        supervisorVersion: dependencies.version,
        now: dependencies.now?.(),
      });
      registry = initialized.registry;
      io.log(JSON.stringify({ status: "ready", host: initialized.host }, null, 2));
      return 0;
    }

    registry = new HostRegistry(root);
    const host = registry.getHost();
    if (!host) {
      throw new RelayHostError(
        "HOST_REGISTRY_NOT_INITIALIZED",
        `Run relay host init before ${action}.`,
      );
    }
    const supervisor = new RelayHostSupervisor({
      registry,
      runtime: runtimeFactory(host.runtimeKind),
      licenseDir: licenseDirectory,
      actorRef,
      now: dependencies.now,
    });

    if (action === "inventory") {
      io.log(JSON.stringify(supervisor.inventory(), null, 2));
      return 0;
    }
    if (action === "reconcile") {
      const drifts = supervisor.reconcile();
      io.log(JSON.stringify({ status: drifts.length === 0 ? "consistent" : "drift", drifts }, null, 2));
      return drifts.length === 0 ? 0 : 1;
    }

    let receipt;
    if (action === "create") {
      const manifestPath = required(values, "manifest");
      let manifest: unknown;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch (error) {
        throw new RelayHostError(
          "HOST_MANIFEST_UNREADABLE",
          `Could not read a JSON Cell manifest from ${manifestPath}.`,
          undefined,
          { cause: error },
        );
      }
      receipt = supervisor.create({ operationId: operationId(values), manifest });
    } else {
      const cellId = required(values, "cell-id");
      const operation = operationId(values);
      switch (action) {
        case "start":
          receipt = supervisor.start({ operationId: operation, cellId });
          break;
        case "stop":
          receipt = supervisor.stop({ operationId: operation, cellId });
          break;
        case "restart":
          receipt = supervisor.restart({ operationId: operation, cellId });
          break;
        case "retain":
          receipt = supervisor.retain({ operationId: operation, cellId });
          break;
        case "export-release":
          receipt = supervisor.exportRelease({
            operationId: operation,
            cellId,
            checkpointRef: required(values, "checkpoint-ref"),
            checkpointReceiptPath: required(values, "checkpoint-receipt"),
            checkpointBundlePath: required(values, "checkpoint-bundle"),
          });
          break;
        case "purge":
          receipt = supervisor.purge({
            operationId: operation,
            cellId,
            confirmation: required(values, "confirm"),
          });
          break;
        default:
          throw new RelayHostError(
            "HOST_CLI_ACTION_UNKNOWN",
            `Unknown Relay Host action: ${action}.`,
          );
      }
    }
    io.log(JSON.stringify(receipt, null, 2));
    return receipt.outcome === "succeeded" || receipt.outcome === "rolled_back" ? 0 : 1;
  } catch (error) {
    const named = hostError(error);
    io.error(`${named.code}: ${named.message}`);
    if (named.details) io.error(JSON.stringify(named.details));
    io.error(USAGE);
    return 1;
  } finally {
    registry?.close();
  }
}
