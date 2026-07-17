#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File } from "./lib/relay-host-manifest.mjs";
import { RelayHostArtifactPolicyError } from "./lib/relay-host-artifact-policy.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);

function parseArgs() {
  const options = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new RelayHostArtifactPolicyError("ARGUMENT_INVALID", `invalid argument near ${key ?? "end"}`);
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
    maxBuffer: 200 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new RelayHostArtifactPolicyError(
      "HOST_CONFORMANCE_FAILED",
      `${command} ${args.join(" ")} failed with status ${result.status}`,
    );
  }
}

function dockerPlatform() {
  const result = spawnSync(
    "docker",
    ["version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0 || !/^linux\/(?:arm64|amd64)$/u.test(result.stdout.trim())) {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_TOOL_UNAVAILABLE",
      `Docker Linux platform unavailable: ${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()}`,
    );
  }
  return result.stdout.trim();
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeChecksums(outputDir) {
  const names = readdirSync(outputDir)
    .filter((name) => name !== "SHA256SUMS" && statSync(resolve(outputDir, name)).isFile())
    .sort();
  writeFileSync(
    resolve(outputDir, "SHA256SUMS"),
    `${names.map((name) => `${sha256File(resolve(outputDir, name)).slice(7)}  ${name}`).join("\n")}\n`,
  );
}

const options = parseArgs();
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const platform = dockerPlatform();
const profile = options.profile ?? "local";
if (!(["local", "publication"].includes(profile))) {
  throw new RelayHostArtifactPolicyError("ARGUMENT_INVALID", `unsupported profile: ${profile}`);
}
const outputDir = resolve(
  options.out ?? `output/relay-host/${pkg.version}/${platform.replace("/", "-")}`,
);
const started = Date.now();
run("node", ["scripts/relay-host-smoke.mjs", outputDir, profile]);
const conformanceMs = Date.now() - started;
const summaryPath = resolve(outputDir, "summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
summary.checks.conformance = "pass";
summary.conformanceReceipt = "smoke-evidence.json";
writeJson(summaryPath, summary);
const timingsPath = resolve(outputDir, "timings.json");
const timings = JSON.parse(readFileSync(timingsPath, "utf8"));
timings.fullArtifactAndConformanceMs = conformanceMs;
writeJson(timingsPath, timings);
writeChecksums(outputDir);
console.log(JSON.stringify({
  status: "verified",
  outputDir,
  imageDigest: summary.immutableImageDigest,
  imageBytes: summary.measurements.imageBytes,
  reductionFraction: summary.measurements.reductionFraction,
  publication: "none",
}, null, 2));
