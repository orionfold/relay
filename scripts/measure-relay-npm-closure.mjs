#!/usr/bin/env node

import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { extractAndMeasureNpmClosure } from "./lib/npm-closure.mjs";
import { sha256File } from "./lib/relay-host-manifest.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const directory = mkdtempSync(join(tmpdir(), "relay-npm-closure-"));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`NPM_CLOSURE_COMMAND_FAILED ${command} ${args.join(" ")} ${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()}`);
  return result.stdout.trim();
}

try {
  run("npm", ["pack", "--pack-destination", directory]);
  const name = readdirSync(directory).find((entry) => entry.endsWith(".tgz"));
  if (!name) throw new Error("NPM_TARBALL_MISSING npm pack produced no tarball");
  const tarball = join(directory, name);
  run("node", ["scripts/check-public-boundary.mjs", "npm", tarball]);
  const unpacked = join(directory, "unpacked");
  mkdirSync(unpacked);
  const closure = await extractAndMeasureNpmClosure(tarball, unpacked);
  console.log(JSON.stringify({
    status: "verified",
    publication: "none",
    externalWrites: 0,
    name,
    digest: sha256File(tarball),
    compressedBytes: statSync(tarball).size,
    ...closure,
  }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
