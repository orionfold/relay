import { describe, expect, it } from "vitest";
import type { CellRecord } from "../contracts";
import {
  DockerHostRuntimeAdapter,
  FakeHostRuntimeAdapter,
  KeylessRelayArtifactVerifier,
  type HostCommandRunner,
} from "../runtime";
import { HOST_CAPACITY, manifest } from "./helpers";

function record(cellId = "cell-a"): CellRecord {
  const input = manifest(cellId, 4101);
  return {
    schemaVersion: 1,
    cellId,
    ownerRef: input.ownerRef,
    artifact: input.artifact,
    desiredState: "stopped",
    actualState: "stopped",
    allocation: {
      containerName: `relay-cell-${cellId}`,
      dataRoot: `/host/cells/${cellId}/data`,
      secretRootRef: `/host/cells/${cellId}/data/.keyfile`,
      networkName: `relay-cell-${cellId}-net`,
      hostLoopbackPort: input.loopbackPort,
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
  };
}

class RecordingRunner implements HostCommandRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];
  responses: string[] = [];
  run(command: string, args: readonly string[]): string {
    this.calls.push({ command, args: [...args] });
    return this.responses.shift() ?? "";
  }
}

class FailingRunner implements HostCommandRunner {
  run(): string {
    throw new Error("docker daemon unavailable");
  }
}

describe("Host runtime adapters", () => {
  it("keeps fake Cells isolated and injects named failures", () => {
    const runtime = new FakeHostRuntimeAdapter();
    const cell = record();
    runtime.create(cell, "host-a");
    runtime.start(cell);
    expect(runtime.inspect(cell, "host-a")).toMatchObject({ exists: true, running: true });
    runtime.stop(cell);
    expect(runtime.inspect(cell, "host-a")).toMatchObject({ exists: true, running: false });
    runtime.failNext("start");
    expect(() => runtime.start(cell)).toThrowError(/Synthetic Relay Host runtime start failure/);
    runtime.remove(cell, "host-a");
    expect(runtime.inspect(cell, "host-a").exists).toBe(false);
    expect(HOST_CAPACITY.reservePercent).toBe(20);
  });

  it("verifies the exact keyless release identity and attestation subject", () => {
    const runner = new RecordingRunner();
    const verifier = new KeylessRelayArtifactVerifier(runner);
    verifier.verify(record().artifact.imageReference);
    expect(runner.calls.map((call) => call.command)).toEqual(["cosign", "cosign"]);
    expect(runner.calls[0].args).toContain("--certificate-oidc-issuer");
    expect(runner.calls[0].args.join(" ")).toContain("publish-relay-cell");
    expect(runner.calls[1].args).toEqual([
      "verify-attestation",
      record().artifact.imageReference,
      "--type",
      "https://slsa.dev/provenance/v1",
      "--certificate-oidc-issuer",
      "https://token.actions.githubusercontent.com",
      "--certificate-identity-regexp",
      "^https://github\\.com/orionfold/relay/\\.github/workflows/publish-relay-cell\\.yml@refs/tags/cell-v[0-9]+\\.[0-9]+\\.[0-9]+$",
    ]);
  });

  it("builds a loopback-only, non-root, read-only, bounded Docker Cell", () => {
    const runner = new RecordingRunner();
    const verifier = { verify: (imageReference: string) => expect(imageReference).toContain("@sha256:") };
    const runtime = new DockerHostRuntimeAdapter(runner, verifier);
    const cell = record();
    runtime.prepareArtifact(cell);
    runtime.create(cell, "host-a");

    expect(runner.calls[0]).toEqual({ command: "docker", args: ["pull", cell.artifact.imageReference] });
    expect(runner.calls[1].args).toEqual([
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
      "--cap-add",
      "DAC_READ_SEARCH",
      "--security-opt",
      "no-new-privileges",
      "--entrypoint",
      "/nodejs/bin/node",
      "--mount",
      `type=bind,src=${cell.allocation.dataRoot},dst=/var/lib/relay`,
      cell.artifact.imageReference,
      "-e",
      expect.stringContaining("fs.lchownSync(target,10001,10001)"),
    ]);
    expect(runner.calls[2].args.slice(0, 3)).toEqual(["network", "create", "--driver"]);
    expect(runner.calls[2].args).toContain("com.docker.network.bridge.enable_icc=false");
    const create = runner.calls[3];
    expect(create.command).toBe("docker");
    expect(create.args[0]).toBe("create");
    expect(create.args).toContain("127.0.0.1:4101:3000");
    expect(create.args).toContain("--read-only");
    expect(create.args).toContain("10001:10001");
    expect(create.args).toContain("ALL");
    expect(create.args).toContain("no-new-privileges");
    expect(create.args).toContain("256");
    expect(create.args).toContain(`type=bind,src=${cell.allocation.dataRoot},dst=/var/lib/relay`);
    expect(create.args).not.toContain("0.0.0.0:4101:3000");
  });

  it("purges Cell data through a networkless least-privilege helper", () => {
    const runner = new RecordingRunner();
    const runtime = new DockerHostRuntimeAdapter(runner, { verify: () => undefined });
    const cell = record();
    runtime.purgeData(cell);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0].command).toBe("docker");
    expect(runner.calls[0].args).toContain("none");
    expect(runner.calls[0].args).toContain("DAC_OVERRIDE");
    expect(runner.calls[0].args).toContain("DAC_READ_SEARCH");
    expect(runner.calls[0].args).toContain("no-new-privileges");
    expect(runner.calls[0].args.at(-1)).toContain("fs.rmSync");
  });

  it("does not misreport a Docker command failure as a missing Cell", () => {
    const runtime = new DockerHostRuntimeAdapter(new FailingRunner(), { verify: () => undefined });
    expect(() => runtime.inspect(record(), "host-a")).toThrowError(/docker daemon unavailable/);
  });

  it("refuses mount-option injection and does not remove mismatched Docker resources", () => {
    const mountRunner = new RecordingRunner();
    const unsafe = record();
    unsafe.allocation.dataRoot = "/host/cells/cell-a/data,readonly";
    const mountRuntime = new DockerHostRuntimeAdapter(mountRunner, { verify: () => undefined });
    expect(() => mountRuntime.prepareArtifact(unsafe)).toThrowError(/cannot contain control characters or commas/);
    expect(mountRunner.calls).toEqual([]);

    const ownerRunner = new RecordingRunner();
    ownerRunner.responses.push(
      `relay-cell-cell-a|exited|other-host|cell-a|${record().manifestDigest}`,
    );
    const ownerRuntime = new DockerHostRuntimeAdapter(ownerRunner, { verify: () => undefined });
    expect(() => ownerRuntime.remove(record(), "host-a")).toThrowError(/ownership does not match/);
    expect(ownerRunner.calls).toHaveLength(1);
  });
});
