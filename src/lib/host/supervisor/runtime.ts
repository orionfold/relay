import { execFileSync } from "node:child_process";
import type { CellRecord } from "./contracts";
import { RelayHostError } from "./errors";

export type RuntimeCellObservation = {
  cellId: string;
  exists: boolean;
  running: boolean;
  containerName: string;
  networkName: string;
};

export interface HostRuntimeAdapter {
  readonly kind: "fake" | "docker" | "podman";
  prepareArtifact(cell: CellRecord): void;
  create(cell: CellRecord, hostId: string): void;
  start(cell: CellRecord): void;
  stop(cell: CellRecord): void;
  remove(cell: CellRecord, hostId: string): void;
  inspect(cell: CellRecord, hostId: string): RuntimeCellObservation;
  inventory(hostId: string): RuntimeCellObservation[];
}

export type RuntimeEffect =
  | "prepare"
  | "create"
  | "start"
  | "stop"
  | "remove"
  | "inspect"
  | "inventory";

export class FakeHostRuntimeAdapter implements HostRuntimeAdapter {
  readonly kind = "fake" as const;
  private readonly cells = new Map<string, RuntimeCellObservation>();
  private readonly failures = new Map<RuntimeEffect, number>();

  failNext(effect: RuntimeEffect, count = 1): void {
    this.failures.set(effect, count);
  }

  private effect(name: RuntimeEffect): void {
    const remaining = this.failures.get(name) ?? 0;
    if (remaining > 0) {
      this.failures.set(name, remaining - 1);
      throw new RelayHostError(
        "HOST_RUNTIME_EFFECT_FAILED",
        `Synthetic Relay Host runtime ${name} failure.`,
      );
    }
  }

  prepareArtifact(): void {
    this.effect("prepare");
  }

  create(cell: CellRecord): void {
    this.effect("create");
    if (this.cells.has(cell.cellId)) {
      throw new RelayHostError(
        "HOST_RUNTIME_RESOURCE_COLLISION",
        `Runtime Cell ${cell.cellId} already exists.`,
      );
    }
    this.cells.set(cell.cellId, {
      cellId: cell.cellId,
      exists: true,
      running: false,
      containerName: cell.allocation.containerName,
      networkName: cell.allocation.networkName,
    });
  }

  start(cell: CellRecord): void {
    this.effect("start");
    const current = this.cells.get(cell.cellId);
    if (!current) {
      this.cells.set(cell.cellId, {
        cellId: cell.cellId,
        exists: true,
        running: true,
        containerName: cell.allocation.containerName,
        networkName: cell.allocation.networkName,
      });
      return;
    }
    this.cells.set(cell.cellId, { ...current, running: true });
  }

  stop(cell: CellRecord): void {
    this.effect("stop");
    const current = this.cells.get(cell.cellId);
    if (!current) {
      throw new RelayHostError(
        "HOST_RUNTIME_CELL_MISSING",
        `Runtime Cell ${cell.cellId} does not exist.`,
      );
    }
    this.cells.set(cell.cellId, { ...current, running: false });
  }

  remove(cell: CellRecord, _hostId: string): void {
    this.effect("remove");
    this.cells.delete(cell.cellId);
  }

  inspect(cell: CellRecord, _hostId: string): RuntimeCellObservation {
    this.effect("inspect");
    return (
      this.cells.get(cell.cellId) ?? {
        cellId: cell.cellId,
        exists: false,
        running: false,
        containerName: cell.allocation.containerName,
        networkName: cell.allocation.networkName,
      }
    );
  }

  inventory(): RuntimeCellObservation[] {
    this.effect("inventory");
    return [...this.cells.values()].sort((left, right) =>
      left.cellId.localeCompare(right.cellId),
    );
  }
}

export interface HostCommandRunner {
  run(command: string, args: readonly string[]): string;
}

export class SyncHostCommandRunner implements HostCommandRunner {
  run(command: string, args: readonly string[]): string {
    try {
      return execFileSync(command, [...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new RelayHostError(
        code === "ENOENT"
          ? "HOST_RUNTIME_TOOL_UNAVAILABLE"
          : "HOST_RUNTIME_COMMAND_FAILED",
        `${command} could not complete the requested Relay Host operation.`,
        { command },
        { cause: error },
      );
    }
  }
}

export interface RelayArtifactVerifier {
  verify(imageReference: string): void;
}

const DISTROLESS_NODE = "/nodejs/bin/node";
const NORMALIZE_DATA_OWNERSHIP = [
  "const fs=require('node:fs');",
  "const path=require('node:path');",
  "function own(target){",
  "const stat=fs.lstatSync(target);",
  "if(stat.isDirectory()){for(const name of fs.readdirSync(target)){own(path.join(target,name));}}",
  "fs.lchownSync(target,10001,10001);",
  "}",
  "own('/var/lib/relay');",
].join("");

export class KeylessRelayArtifactVerifier implements RelayArtifactVerifier {
  constructor(private readonly runner: HostCommandRunner) {}

  verify(imageReference: string): void {
    this.runner.run("cosign", [
      "verify",
      imageReference,
      "--certificate-oidc-issuer",
      "https://token.actions.githubusercontent.com",
      "--certificate-identity-regexp",
      "^https://github\\.com/orionfold/relay/\\.github/workflows/publish-relay-cell\\.yml@refs/tags/cell-v[0-9]+\\.[0-9]+\\.[0-9]+$",
    ]);
    this.runner.run("gh", [
      "attestation",
      "verify",
      `oci://${imageReference}`,
      "--repo",
      "orionfold/relay",
    ]);
  }
}

export class DockerHostRuntimeAdapter implements HostRuntimeAdapter {
  readonly kind = "docker" as const;

  constructor(
    private readonly runner: HostCommandRunner = new SyncHostCommandRunner(),
    private readonly verifier: RelayArtifactVerifier = new KeylessRelayArtifactVerifier(
      runner,
    ),
  ) {}

  prepareArtifact(cell: CellRecord): void {
    this.assertMountSource(cell.allocation.dataRoot);
    this.verifier.verify(cell.artifact.imageReference);
    this.runner.run("docker", ["pull", cell.artifact.imageReference]);
    this.runner.run("docker", [
      "run",
      "--rm",
      "--user",
      "0:0",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--cap-add",
      "CHOWN",
      "--security-opt",
      "no-new-privileges",
      "--entrypoint",
      DISTROLESS_NODE,
      "--mount",
      `type=bind,src=${cell.allocation.dataRoot},dst=/var/lib/relay`,
      cell.artifact.imageReference,
      "-e",
      NORMALIZE_DATA_OWNERSHIP,
    ]);
  }

  create(cell: CellRecord, hostId: string): void {
    this.assertMountSource(cell.allocation.dataRoot);
    const labels = [
      "--label",
      `orionfold.relay.host-id=${hostId}`,
      "--label",
      `orionfold.relay.cell-id=${cell.cellId}`,
      "--label",
      `orionfold.relay.manifest-digest=${cell.manifestDigest}`,
    ];
    this.runner.run("docker", [
      "network",
      "create",
      "--driver",
      "bridge",
      "--opt",
      "com.docker.network.bridge.enable_icc=false",
      ...labels,
      cell.allocation.networkName,
    ]);
    this.runner.run("docker", [
        "create",
        "--name",
        cell.allocation.containerName,
        ...labels,
        "--network",
        cell.allocation.networkName,
        "--publish",
        `127.0.0.1:${cell.allocation.hostLoopbackPort}:3000`,
        "--cpus",
        String(cell.allocation.cpuMillis / 1000),
        "--memory",
        String(cell.allocation.memoryBytes),
        "--memory-swap",
        String(cell.allocation.memoryBytes),
        "--pids-limit",
        "256",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=67108864",
        "--user",
        "10001:10001",
        "--env",
        `RELAY_CELL_ID=${cell.cellId}`,
        "--env",
        "RELAY_DATA_DIR=/var/lib/relay",
        "--mount",
        `type=bind,src=${cell.allocation.dataRoot},dst=/var/lib/relay`,
        cell.artifact.imageReference,
    ]);
  }

  start(cell: CellRecord): void {
    this.runner.run("docker", ["start", cell.allocation.containerName]);
  }

  stop(cell: CellRecord): void {
    this.runner.run("docker", ["stop", "--time", "30", cell.allocation.containerName]);
  }

  remove(cell: CellRecord, hostId: string): void {
    const observation = this.inspect(cell, hostId);
    if (observation.exists) {
      this.runner.run("docker", ["rm", "--force", cell.allocation.containerName]);
    }
    if (this.networkExists(cell, hostId)) {
      this.runner.run("docker", ["network", "rm", cell.allocation.networkName]);
    }
  }

  inspect(cell: CellRecord, hostId: string): RuntimeCellObservation {
    const output = this.runner.run("docker", [
      "ps",
      "--all",
      "--filter",
      `name=^/${cell.allocation.containerName}$`,
      "--format",
      "{{.Names}}|{{.State}}|{{.Label \"orionfold.relay.host-id\"}}|{{.Label \"orionfold.relay.cell-id\"}}|{{.Label \"orionfold.relay.manifest-digest\"}}",
    ]);
    if (!output) {
      return {
        cellId: cell.cellId,
        exists: false,
        running: false,
        containerName: cell.allocation.containerName,
        networkName: cell.allocation.networkName,
      };
    }
    const [containerName, state, observedHostId, observedCellId, observedManifest] = output.split("|");
    if (
      containerName !== cell.allocation.containerName ||
      observedHostId !== hostId ||
      observedCellId !== cell.cellId ||
      observedManifest !== cell.manifestDigest
    ) {
      throw new RelayHostError(
        "HOST_RUNTIME_RESOURCE_OWNERSHIP_MISMATCH",
        `Docker resource ownership does not match managed Relay Cell ${cell.cellId}.`,
      );
    }
    return {
      cellId: cell.cellId,
      exists: true,
      running: state === "running",
      containerName,
      networkName: cell.allocation.networkName,
    };
  }

  inventory(hostId: string): RuntimeCellObservation[] {
    const output = this.runner.run("docker", [
      "ps",
      "--all",
      "--filter",
      `label=orionfold.relay.host-id=${hostId}`,
      "--format",
      "{{.Label \"orionfold.relay.cell-id\"}}|{{.Names}}|{{.State}}",
    ]);
    if (!output) return [];
    return output.split("\n").map((line) => {
      const [cellId, containerName, state] = line.split("|");
      if (
        !/^[a-z0-9](?:[a-z0-9._-]{0,62})$/.test(cellId) ||
        containerName !== `relay-cell-${cellId}`
      ) {
        throw new RelayHostError(
          "HOST_RUNTIME_INSPECTION_INVALID",
          "Docker returned an invalid Relay Host inventory record.",
        );
      }
      return {
        cellId,
        exists: true,
        running: state === "running",
        containerName,
        networkName: `relay-cell-${cellId}-net`,
      };
    });
  }

  private networkExists(cell: CellRecord, hostId: string): boolean {
    const networkName = cell.allocation.networkName;
    const output = this.runner.run("docker", [
      "network",
      "ls",
      "--filter",
      `name=^${networkName}$`,
      "--format",
      "{{.Name}}",
    ]);
    if (!output) return false;
    if (output !== networkName) {
      throw new RelayHostError(
        "HOST_RUNTIME_INSPECTION_INVALID",
        `Docker returned an unexpected network while inspecting ${networkName}.`,
      );
    }
    const labels = this.runner.run("docker", [
      "network",
      "inspect",
      "--format",
      "{{index .Labels \"orionfold.relay.host-id\"}}|{{index .Labels \"orionfold.relay.cell-id\"}}|{{index .Labels \"orionfold.relay.manifest-digest\"}}",
      networkName,
    ]);
    if (labels !== `${hostId}|${cell.cellId}|${cell.manifestDigest}`) {
      throw new RelayHostError(
        "HOST_RUNTIME_RESOURCE_OWNERSHIP_MISMATCH",
        `Docker network ownership does not match managed Relay Cell ${cell.cellId}.`,
      );
    }
    return true;
  }

  private assertMountSource(path: string): void {
    if (/[\0\r\n,]/.test(path)) {
      throw new RelayHostError(
        "HOST_RESOURCE_PATH_UNSUPPORTED",
        "Relay Host data roots cannot contain control characters or commas required by Docker mount syntax.",
      );
    }
  }
}
