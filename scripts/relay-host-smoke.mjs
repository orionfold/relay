#!/usr/bin/env node

import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File } from "./lib/relay-host-manifest.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const outputDir = resolve(process.argv[2] ?? "output/relay-host");
const runId = `g093-${process.pid}`;
const currentTag = `relay-host:${runId}`;
const priorTag = `relay-host:${runId}-prior`;
const priorRef = "v0.42.2";
const profile = process.argv[3] ?? "local";
const owned = { containers: [], networks: [], volumes: [], paths: [] };

function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `COMMAND_FAILED ${command} ${args.join(" ")}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result;
}

function docker(args, options) {
  return command("docker", args, options);
}

function create(kind, name) {
  docker([kind, "create", name]);
  owned[`${kind}s`].push(name);
}

function mappedPort(container) {
  const output = docker(["port", container, "3000/tcp"]).stdout.trim();
  const match = output.match(/127\.0\.0\.1:(\d+)/);
  if (!match) throw new Error(`LOOPBACK_PORT_MISSING ${container} ${output}`);
  return Number(match[1]);
}

async function waitFor(url, expectedStatus = 200, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.status === expectedStatus) return response;
      last = `${response.status} ${await response.text()}`;
    } catch (cause) {
      last = cause instanceof Error ? cause.message : String(cause);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`ENDPOINT_TIMEOUT ${url} ${last}`);
}

function currentRunArgs(name, network, volume, cellId) {
  return [
    "run",
    "-d",
    "--name",
    name,
    "--network",
    network,
    "--mount",
    `source=${volume},target=/var/lib/relay`,
    "--publish",
    "127.0.0.1::3000",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=268435456",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "1g",
    "--cpus",
    "1",
    "--pids-limit",
    "256",
    "--env",
    `RELAY_CELL_ID=${cellId}`,
    currentTag,
  ];
}

function exportVolume(volume, archivePath) {
  const exportDir = resolve(archivePath, "..");
  mkdirSync(exportDir, { recursive: true });
  docker([
    "run",
    "--rm",
    "--mount",
    `source=${volume},target=/source,readonly`,
    "--mount",
    `type=bind,source=${exportDir},target=/out`,
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
    "tar",
    "-cf",
    `/out/${archivePath.split("/").at(-1)}`,
    "-C",
    "/source",
    ".",
  ]);
}

function restoreVolume(volume, archivePath, uid, gid) {
  const exportDir = resolve(archivePath, "..");
  docker([
    "run",
    "--rm",
    "--mount",
    `source=${volume},target=/target`,
    "--mount",
    `type=bind,source=${exportDir},target=/out,readonly`,
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
    "tar",
    "-xf",
    `/out/${archivePath.split("/").at(-1)}`,
    "-C",
    "/target",
  ]);
  docker([
    "run",
    "--rm",
    "--mount",
    `source=${volume},target=/target`,
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
    "chown",
    "-R",
    `${uid}:${gid}`,
    "/target",
  ]);
}

function cleanup() {
  for (const container of owned.containers.reverse()) {
    docker(["rm", "-f", container], { allowFailure: true });
  }
  for (const network of owned.networks.reverse()) {
    docker(["network", "rm", network], { allowFailure: true });
  }
  for (const volume of owned.volumes.reverse()) {
    docker(["volume", "rm", volume], { allowFailure: true });
  }
  for (const path of owned.paths.reverse()) {
    rmSync(path, { recursive: true, force: true });
  }
}

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const keyDir = mkdtempSync(join(tmpdir(), `relay-host-key-${runId}-`));
  const priorContext = resolve(outputDir, `prior-${runId}`);
  const priorArchive = resolve(outputDir, `prior-${runId}.tar`);
  const priorMetadataPath = resolve(outputDir, `prior-${runId}-metadata.json`);
  owned.paths.push(priorContext, priorArchive, priorMetadataPath, keyDir);
  rmSync(priorContext, { recursive: true, force: true });
  mkdirSync(priorContext, { recursive: true });
  command("git", ["archive", "--format=tar", `--output=${priorArchive}`, priorRef]);
  command("tar", ["-xf", priorArchive, "-C", priorContext]);
  const priorNextConfigPath = resolve(priorContext, "next.config.mjs");
  const priorNextConfig = readFileSync(priorNextConfigPath, "utf8");
  const priorWorkerAnchor = "const nextConfig = {";
  assert.ok(
    priorNextConfig.includes(priorWorkerAnchor),
    `${priorRef} next.config.mjs no longer exposes the expected worker anchor`,
  );
  writeFileSync(
    priorNextConfigPath,
    priorNextConfig.replace(
      priorWorkerAnchor,
      `${priorWorkerAnchor}\n  // Conformance fixture: prevent build-time SQLite bootstrap races.\n  experimental: { cpus: 1 },`,
    ),
  );
  const priorProvidersRoutePath = resolve(
    priorContext,
    "src/app/api/settings/providers/route.ts",
  );
  const priorProvidersRoute = readFileSync(priorProvidersRoutePath, "utf8");
  const priorRouteAnchor = "export async function GET(request?: Request)";
  assert.ok(
    priorProvidersRoute.includes(priorRouteAnchor),
    `${priorRef} providers route no longer exposes the expected compatibility anchor`,
  );
  writeFileSync(
    priorProvidersRoutePath,
    priorProvidersRoute.replace(
      priorRouteAnchor,
      "export async function GET(request: Request)",
    ),
  );
  writeFileSync(
    resolve(priorContext, "Dockerfile.relay-host-prior-fixture"),
    readFileSync(resolve(root, "Dockerfile.relay-host-prior-fixture")),
  );
  docker(
    [
      "buildx",
      "build",
      "--load",
      "--provenance=false",
      "--tag",
      priorTag,
      "--file",
      resolve(priorContext, "Dockerfile.relay-host-prior-fixture"),
      "--metadata-file",
      priorMetadataPath,
      priorContext,
    ],
    { capture: false },
  );
  const priorDigest = JSON.parse(readFileSync(priorMetadataPath, "utf8"))[
    "containerimage.digest"
  ];
  assert.match(priorDigest, /^sha256:[a-f0-9]{64}$/);

  command("node", ["scripts/generate-relay-host-test-key.mjs", keyDir], {
    capture: false,
  });
  copyFileSync(
    resolve(keyDir, "local-test-public.pem"),
    resolve(outputDir, "relay-host-signing-public.pem"),
  );
  command(
    "node",
    [
      "scripts/build-relay-host-artifact.mjs",
      "--rollback-digest",
      priorDigest,
      "--private-key",
      resolve(keyDir, "local-test-private.pem"),
      "--public-key",
      resolve(keyDir, "local-test-public.pem"),
      "--out",
      outputDir,
      "--tag",
      currentTag,
      "--profile",
      profile,
    ],
    { capture: false },
  );

  const cells = ["a", "b"].map((suffix) => ({
    id: `cell-${suffix}`,
    container: `relay-${runId}-${suffix}`,
    network: `relay-${runId}-net-${suffix}`,
    volume: `relay-${runId}-data-${suffix}`,
  }));
  for (const cell of cells) {
    create("network", cell.network);
    create("volume", cell.volume);
    docker(currentRunArgs(cell.container, cell.network, cell.volume, cell.id));
    owned.containers.push(cell.container);
  }

  for (const cell of cells) {
    cell.port = mappedPort(cell.container);
    const response = await waitFor(
      `http://127.0.0.1:${cell.port}/api/health/ready`,
    );
    const health = await response.json();
    assert.equal(health.cellId, cell.id);
    assert.equal(health.status, "ready");
  }
  assert.notEqual(cells[0].port, cells[1].port);

  for (const cell of cells) {
    const inspect = JSON.parse(docker(["inspect", cell.container]).stdout)[0];
    assert.equal(inspect.Config.User, "10001:10001");
    assert.equal(inspect.HostConfig.ReadonlyRootfs, true);
    assert.deepEqual(inspect.HostConfig.CapDrop, ["ALL"]);
    assert.ok(inspect.HostConfig.SecurityOpt.includes("no-new-privileges"));
    assert.equal(inspect.HostConfig.Memory, 1_073_741_824);
    assert.equal(inspect.HostConfig.PidsLimit, 256);
    assert.deepEqual(Object.keys(inspect.NetworkSettings.Networks), [cell.network]);
    assert.equal(
      inspect.HostConfig.PortBindings["3000/tcp"][0].HostIp,
      "127.0.0.1",
    );
    assert.equal(
      inspect.Mounts.find((mount) => mount.Destination === "/var/lib/relay")
        ?.Name,
      cell.volume,
    );
  }
  assert.notEqual(cells[0].network, cells[1].network);
  assert.notEqual(cells[0].volume, cells[1].volume);

  const isolation = docker([
    "exec",
    cells[0].container,
    "/nodejs/bin/node",
    "-e",
    `fetch('http://${cells[1].container}:3000/api/health/live',{signal:AbortSignal.timeout(1500)}).then(()=>process.exit(9)).catch(()=>process.exit(0))`,
  ], { allowFailure: true });
  assert.equal(isolation.status, 0, "cell A unexpectedly reached cell B");

  const missingMount = docker(
    ["run", "--rm", "--env", "RELAY_CELL_ID=missing-mount", currentTag],
    { allowFailure: true },
  );
  assert.notEqual(missingMount.status, 0);
  assert.match(`${missingMount.stdout}${missingMount.stderr}`, /DATA_MOUNT_REQUIRED/);

  docker([
    "exec",
    cells[0].container,
    "/nodejs/bin/node",
    "-e",
    "require('node:fs').writeFileSync('/var/lib/relay/persistence-marker','cell-a')",
  ]);
  docker(["restart", cells[0].container]);
  cells[0].port = mappedPort(cells[0].container);
  await waitFor(`http://127.0.0.1:${cells[0].port}/api/health/ready`);
  assert.equal(
    docker([
      "exec",
      cells[0].container,
      "/nodejs/bin/node",
      "-e",
      "process.stdout.write(require('node:fs').readFileSync('/var/lib/relay/persistence-marker','utf8'))",
    ]).stdout,
    "cell-a",
  );

  docker([
    "exec",
    cells[0].container,
    "/nodejs/bin/node",
    "-e",
    "const D=require('better-sqlite3');const d=new D('/var/lib/relay/relay.db');const n=Date.now();d.prepare(\"INSERT INTO tasks (id,title,status,priority,resume_count,created_at,updated_at) VALUES ('g080-running','signal fixture','running',2,0,?,?)\").run(n,n);d.close()",
  ]);
  docker(["stop", "--time", "20", cells[0].container]);
  let logs = docker(["logs", cells[0].container]).stdout;
  assert.match(logs, /ACTIVE_TASKS_RETAINED count=1/);
  assert.match(logs, /"checkpointed":true/);
  docker(["start", cells[0].container]);
  cells[0].port = mappedPort(cells[0].container);
  await waitFor(`http://127.0.0.1:${cells[0].port}/api/health/ready`);

  docker([
    "exec",
    cells[0].container,
    "/nodejs/bin/node",
    "-e",
    "const f=require('node:fs');const c=require('node:crypto');f.mkdirSync('/var/lib/relay/uploads',{recursive:true});const h=f.openSync('/var/lib/relay/uploads/g080-backup.bin','w');for(let i=0;i<96;i++)f.writeSync(h,c.randomBytes(1024*1024));f.closeSync(h)",
  ]);
  const backupRequest = fetch(`http://127.0.0.1:${cells[0].port}/api/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "G-080 signal backup" }),
  }).catch(() => null);
  let backupObserved = false;
  const backupDeadline = Date.now() + 20_000;
  while (Date.now() < backupDeadline && !backupObserved) {
    const response = await fetch(
      `http://127.0.0.1:${cells[0].port}/api/snapshots`,
    );
    const body = await response.json();
    backupObserved = body.snapshots?.some(
      (snapshot) => snapshot.status === "in_progress",
    );
    if (!backupObserved) await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.equal(backupObserved, true, "snapshot never entered in_progress");
  docker(["stop", "--time", "20", cells[0].container]);
  await backupRequest;
  logs = docker(["logs", cells[0].container]).stdout;
  assert.match(logs, /SNAPSHOT_IN_PROGRESS/);
  docker(["start", cells[0].container]);
  cells[0].port = mappedPort(cells[0].container);
  await waitFor(`http://127.0.0.1:${cells[0].port}/api/health/ready`);
  const recoverySnapshot = await fetch(
    `http://127.0.0.1:${cells[0].port}/api/snapshots`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "G-080 post-signal recovery" }),
    },
  );
  assert.equal(recoverySnapshot.status, 201);

  const rollbackNetwork = `relay-${runId}-rollback-net`;
  const priorVolume = `relay-${runId}-prior-data`;
  const upgradedVolume = `relay-${runId}-upgrade-data`;
  const restoredVolume = `relay-${runId}-restored-data`;
  create("network", rollbackNetwork);
  for (const volume of [priorVolume, upgradedVolume, restoredVolume]) create("volume", volume);
  const priorContainer = `relay-${runId}-prior-cell`;
  docker([
    "run",
    "-d",
    "--name",
    priorContainer,
    "--network",
    rollbackNetwork,
    "--mount",
    `source=${priorVolume},target=/var/lib/relay`,
    "--publish",
    "127.0.0.1::3000",
    priorTag,
  ]);
  owned.containers.push(priorContainer);
  const priorPort = mappedPort(priorContainer);
  await waitFor(`http://127.0.0.1:${priorPort}/`);
  docker(["stop", "--time", "20", priorContainer]);
  const exportPath = resolve(outputDir, "relay-cell-v1-export.tar");
  exportVolume(priorVolume, exportPath);
  const exportDigest = sha256File(exportPath);
  restoreVolume(upgradedVolume, exportPath, 10001, 10001);

  const upgradedContainer = `relay-${runId}-upgrade-cell`;
  docker(currentRunArgs(upgradedContainer, rollbackNetwork, upgradedVolume, "upgrade-cell"));
  owned.containers.push(upgradedContainer);
  const upgradedPort = mappedPort(upgradedContainer);
  await waitFor(`http://127.0.0.1:${upgradedPort}/api/health/ready`);
  docker(["stop", "--time", "20", upgradedContainer]);

  restoreVolume(restoredVolume, exportPath, 1000, 1000);
  const restoredContainer = `relay-${runId}-restored-prior-cell`;
  docker([
    "run",
    "-d",
    "--name",
    restoredContainer,
    "--network",
    rollbackNetwork,
    "--mount",
    `source=${restoredVolume},target=/var/lib/relay`,
    "--publish",
    "127.0.0.1::3000",
    priorTag,
  ]);
  owned.containers.push(restoredContainer);
  const restoredPort = mappedPort(restoredContainer);
  await waitFor(`http://127.0.0.1:${restoredPort}/`);

  const evidence = {
    contractVersion: 2,
    currentTag,
    priorRef,
    priorDigest,
    cells: cells.map(({ id, network, volume, port }) => ({ id, network, volume, port })),
    missingMountReason: "DATA_MOUNT_REQUIRED",
    taskSignal: "ACTIVE_TASKS_RETAINED count=1",
    backupSignal: "SNAPSHOT_IN_PROGRESS",
    exportDigest,
    restoreOwnership: { upgrade: "10001:10001", rollback: "1000:1000" },
    rollbackRestored: true,
    optimizedArtifact: JSON.parse(
      readFileSync(resolve(outputDir, "measurements.json"), "utf8"),
    ),
    publication: "none",
  };
  writeFileSync(
    resolve(outputDir, "smoke-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify(evidence, null, 2));
}

try {
  await main();
} catch (cause) {
  for (const container of owned.containers) {
    const logs = docker(["logs", container], { allowFailure: true });
    console.error(`[smoke-debug] ${container}\n${logs.stdout ?? ""}${logs.stderr ?? ""}`);
  }
  throw cause;
} finally {
  cleanup();
}
