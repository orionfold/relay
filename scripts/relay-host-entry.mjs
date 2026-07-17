#!/usr/bin/env node

import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

class RelayCellStartupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RelayCellStartupError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new RelayCellStartupError(code, message);
}

function decodeMountPath(value) {
  return value
    .replaceAll("\\040", " ")
    .replaceAll("\\011", "\t")
    .replaceAll("\\012", "\n")
    .replaceAll("\\134", "\\");
}

function isMountPoint(path) {
  if (process.platform !== "linux") return false;
  const mountInfo = readFileSync("/proc/self/mountinfo", "utf8");
  return mountInfo.split("\n").some((line) => {
    const fields = line.split(" ");
    return fields.length > 4 && decodeMountPath(fields[4]) === path;
  });
}

function preflight() {
  const cellId = process.env.RELAY_CELL_ID;
  if (!cellId || !/^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(cellId)) {
    fail("CELL_ID_INVALID", "RELAY_CELL_ID must be a lowercase DNS label");
  }

  if (typeof process.getuid === "function" && process.getuid() === 0) {
    fail("ROOT_IDENTITY_FORBIDDEN", "Relay cells must run as a non-root user");
  }

  const dataDir = resolve(process.env.RELAY_DATA_DIR ?? "");
  if (!process.env.RELAY_DATA_DIR || dataDir === "/") {
    fail("DATA_DIR_INVALID", "RELAY_DATA_DIR must be an explicit non-root path");
  }

  mkdirSync(dataDir, { recursive: true });
  if (lstatSync(dataDir).isSymbolicLink()) {
    fail("DATA_DIR_SYMLINK", "RELAY_DATA_DIR must not be a symbolic link");
  }
  const canonicalDataDir = realpathSync(dataDir);
  if (
    process.env.RELAY_REQUIRE_DATA_MOUNT === "true" &&
    !isMountPoint(canonicalDataDir)
  ) {
    fail(
      "DATA_MOUNT_REQUIRED",
      `RELAY_DATA_DIR is not a dedicated mount point: ${canonicalDataDir}`,
    );
  }

  const probe = resolve(canonicalDataDir, `.relay-write-probe-${randomUUID()}`);
  try {
    writeFileSync(probe, "ok", { flag: "wx", mode: 0o600 });
    rmSync(probe);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    fail("DATA_DIR_NOT_WRITABLE", detail);
  }

  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const artifactVersion = process.env.RELAY_ARTIFACT_VERSION;
  if (!artifactVersion || artifactVersion !== pkg.version) {
    fail(
      "ARTIFACT_VERSION_MISMATCH",
      `image=${artifactVersion ?? "missing"} package=${pkg.version ?? "missing"}`,
    );
  }
  if (!/^[a-f0-9]{7,64}$/.test(process.env.RELAY_SOURCE_REVISION ?? "")) {
    fail("SOURCE_REVISION_INVALID", "RELAY_SOURCE_REVISION must be a git object ID");
  }

  mkdirSync(resolve(canonicalDataDir, "workspace"), { recursive: true });
  mkdirSync(resolve(canonicalDataDir, "home"), { recursive: true });
  console.log(
    `[cell-startup] ready cell=${cellId} version=${artifactVersion} uid=${process.getuid?.() ?? "unknown"}`,
  );
}

function launch() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  if (!command) fail("SERVER_COMMAND_MISSING", "No Relay server command was provided");

  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  let forwarding = false;
  let forceTimer;

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (forwarding) return;
      forwarding = true;
      console.log(`[cell-entry] forwarding ${signal}`);
      child.kill(signal);
      forceTimer = setTimeout(() => {
        console.error("[cell-entry] SHUTDOWN_TIMEOUT forcing SIGKILL");
        child.kill("SIGKILL");
      }, 20_000);
      forceTimer.unref();
    });
  }

  child.once("error", (cause) => {
    console.error(`[cell-entry] SERVER_SPAWN_FAILED ${cause.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (forceTimer) clearTimeout(forceTimer);
    if (signal) {
      console.error(`[cell-entry] server exited from signal=${signal}`);
      process.exitCode = 128;
    } else {
      process.exitCode = code ?? 1;
    }
  });
}

try {
  preflight();
  launch();
} catch (cause) {
  if (cause instanceof RelayCellStartupError) {
    console.error(`[cell-startup] ${cause.code} ${cause.message}`);
  } else {
    console.error(
      `[cell-startup] STARTUP_FAILED ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  process.exitCode = 1;
}
