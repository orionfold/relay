#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_PREFLIGHT_LANES,
  ReleasePreflightError,
  computeReleasePolicyDigest,
  computeSourceTreeDigest,
  createChecks,
  createLaneReceipt,
  createProductionDependencyEvidence,
  createReleaseReceipt,
  inspectSource,
  validateReleaseReceipt,
} from "./lib/release-preflight.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new ReleasePreflightError("RELEASE_PREFLIGHT_ARGUMENT_INVALID", `unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new ReleasePreflightError("RELEASE_PREFLIGHT_ARGUMENT_INVALID", `missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  const value = options[key];
  if (!value) throw new ReleasePreflightError("RELEASE_PREFLIGHT_ARGUMENT_INVALID", `missing --${key}`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJson(path, value) {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function packageVersion() {
  return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
}

function runGh(args, options = {}) {
  try {
    const output = execFileSync("gh", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    return typeof output === "string" ? output.trim() : "";
  } catch (error) {
    throw new ReleasePreflightError(
      "RELEASE_PREFLIGHT_GITHUB_FAILED",
      `gh ${args.join(" ")} failed`,
      error?.stderr?.toString().trim(),
    );
  }
}

function candidateRuns() {
  const output = runGh([
    "run", "list",
    "--workflow", "release-candidate.yml",
    "--branch", "main",
    "--event", "workflow_dispatch",
    "--limit", "50",
    "--json", "databaseId,headSha,status,conclusion,createdAt",
  ]);
  return JSON.parse(output);
}

async function waitForNewRun(sourceRevision, beforeIds) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const match = candidateRuns().find((run) => run.headSha === sourceRevision && !beforeIds.has(run.databaseId));
    if (match) return String(match.databaseId);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  throw new ReleasePreflightError("RELEASE_PREFLIGHT_RUN_MISSING", `dispatched candidate for ${sourceRevision} was not discoverable within 60 seconds`);
}

function latestSuccessfulRun(sourceRevision) {
  const match = candidateRuns().find((run) =>
    run.headSha === sourceRevision &&
    run.status === "completed" &&
    run.conclusion === "success"
  );
  if (!match) throw new ReleasePreflightError("RELEASE_PREFLIGHT_RUN_MISSING", `no successful release candidate exists for ${sourceRevision}`);
  return String(match.databaseId);
}

function loadLanes(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true })
    .filter((path) => path.endsWith(".json"))
    .map((path) => readJson(resolve(directory, path)))
    .filter((value) => value?.kind === "orionfold.release-preflight-lane")
    .map(({ lane }) => lane);
}

function buildExpected(options) {
  const revision = required(options, "source-sha");
  return {
    scope: required(options, "scope"),
    version: required(options, "version"),
    sourceRevision: revision,
    sourceTreeDigest: computeSourceTreeDigest(root, revision),
    policyDigest: computeReleasePolicyDigest(root),
    ...(options["run-id"] ? { workflowRunId: options["run-id"] } : {}),
  };
}

function dependencyEvidence(report, source) {
  return createProductionDependencyEvidence(report, {
    reportDigest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
  });
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "lane") {
    const statusMap = { success: "pass", failure: "fail", cancelled: "cancelled", skipped: "skipped", pass: "pass", fail: "fail" };
    const rawStatus = required(options, "status");
    const lane = createLaneReceipt({ id: required(options, "id"), status: statusMap[rawStatus] ?? rawStatus });
    writeJson(required(options, "out"), {
      schemaVersion: 1,
      kind: "orionfold.release-preflight-lane",
      lane,
    });
    return;
  }

  if (command === "checks") {
    const auditSource = readFileSync(resolve(required(options, "audit")), "utf8");
    writeJson(required(options, "out"), {
      checks: createChecks(required(options, "scope")),
      evidence: {
        productionDependencies: dependencyEvidence(JSON.parse(auditSource), auditSource),
      },
    });
    return;
  }

  if (command === "aggregate") {
    const expected = buildExpected(options);
    const checksPath = resolve(required(options, "checks"));
    const checkEnvelope = existsSync(checksPath)
      ? readJson(checksPath)
      : {
          checks: createChecks(expected.scope, "missing"),
          evidence: {},
        };
    const receipt = createReleaseReceipt({
      ...expected,
      mode: options.mode ?? "candidate",
      workflowRunId: required(options, "run-id"),
      workflowRunAttempt: Number(options["run-attempt"] ?? "1"),
      lanes: loadLanes(resolve(required(options, "lanes-dir"))),
      checks: checkEnvelope.checks,
      evidence: checkEnvelope.evidence,
      createdAt: options["created-at"] ?? new Date().toISOString(),
    });
    writeJson(required(options, "out"), receipt);
    return;
  }

  if (command === "validate") {
    const expected = buildExpected(options);
    const receipt = readJson(required(options, "receipt"));
    validateReleaseReceipt(receipt, expected, {
      allowDryRun: options["allow-dry-run"] === "true",
      now: options.now ? new Date(options.now) : new Date(),
    });
    process.stdout.write(`${JSON.stringify({
      status: "eligible",
      scope: receipt.scope,
      version: receipt.version,
      sourceRevision: receipt.source.revision,
      receiptDigest: receipt.receiptDigest,
      expiresAt: receipt.expiresAt,
    }, null, 2)}\n`);
    return;
  }

  if (command === "local-dry-run") {
    const version = required(options, "version");
    if (version !== packageVersion()) throw new ReleasePreflightError("RELEASE_PREFLIGHT_VERSION_MISMATCH", `package version ${packageVersion()} differs from ${version}`);
    const source = inspectSource(root);
    const receipt = createReleaseReceipt({
      mode: "dry-run",
      scope: required(options, "scope"),
      version,
      sourceRevision: source.revision,
      sourceTreeDigest: source.treeDigest,
      policyDigest: computeReleasePolicyDigest(root),
      workflowRunId: "local-dry-run",
      lanes: RELEASE_PREFLIGHT_LANES.map((lane) => createLaneReceipt({ id: lane.id, status: "pass" })),
      checks: createChecks(options.scope),
      evidence: {
        productionDependencies: dependencyEvidence({
          metadata: {
            vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
          },
        }, "local-dry-run"),
      },
    });
    validateReleaseReceipt(receipt, {
      scope: options.scope,
      version,
      sourceRevision: source.revision,
      sourceTreeDigest: source.treeDigest,
      policyDigest: computeReleasePolicyDigest(root),
      workflowRunId: "local-dry-run",
    }, { allowDryRun: true });
    writeJson(required(options, "out"), receipt);
    process.stdout.write(`${JSON.stringify({
      status: "dry-run-only",
      publicationEligible: false,
      receipt: resolve(options.out),
      receiptDigest: receipt.receiptDigest,
      next: `dispatch release-candidate.yml for ${source.revision}`,
    }, null, 2)}\n`);
    return;
  }

  if (command === "prepare") {
    const scope = required(options, "scope");
    const version = required(options, "version");
    if (version !== packageVersion()) throw new ReleasePreflightError("RELEASE_PREFLIGHT_VERSION_MISMATCH", `package version ${packageVersion()} differs from ${version}`);
    const source = inspectSource(root);
    const branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim();
    if (branch !== "main") throw new ReleasePreflightError("RELEASE_PREFLIGHT_SOURCE_NOT_MAIN", `release candidate must be prepared from main, not ${branch || "detached HEAD"}`);
    const originMain = execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim();
    if (originMain !== source.revision) throw new ReleasePreflightError("RELEASE_PREFLIGHT_SOURCE_NOT_PUSHED", `HEAD ${source.revision} differs from local origin/main ${originMain}`);

    let runId = options["run-id"];
    if (options.dispatch === "true") {
      const beforeIds = new Set(candidateRuns().map((run) => run.databaseId));
      runGh([
        "workflow", "run", "release-candidate.yml",
        "--ref", "main",
        "-f", `scope=${scope}`,
        "-f", `version=${version}`,
        "-f", `source_sha=${source.revision}`,
      ]);
      runId = await waitForNewRun(source.revision, beforeIds);
      runGh(["run", "watch", runId, "--exit-status"], { stdio: "inherit" });
    }
    runId ??= latestSuccessfulRun(source.revision);

    const artifact = `release-preflight-${scope}-${version}`;
    const outputDirectory = resolve(options.out ?? `output/release-preflight/run-${runId}`);
    mkdirSync(outputDirectory, { recursive: true });
    runGh(["run", "download", runId, "--name", artifact, "--dir", outputDirectory]);
    const receiptPath = resolve(outputDirectory, `${artifact}.json`);
    const receiptValue = readJson(receiptPath);
    validateReleaseReceipt(receiptValue, {
      scope,
      version,
      sourceRevision: source.revision,
      sourceTreeDigest: source.treeDigest,
      policyDigest: computeReleasePolicyDigest(root),
      workflowRunId: runId,
    });
    const tag = scope === "cell" ? `cell-v${version}` : `v${version}`;
    process.stdout.write(`${JSON.stringify({
      status: "tag-eligible",
      externalWritesPerformed: options.dispatch === "true" ? ["candidate-workflow-dispatch"] : [],
      sourceRevision: source.revision,
      runId,
      receiptDigest: receiptValue.receiptDigest,
      expiresAt: receiptValue.expiresAt,
      eligibleTag: tag,
      nextCommands: [`git tag ${tag} ${source.revision}`, `git push origin ${tag}`],
      note: "Commands are printed for the separately authorized release step; this driver never creates or pushes a tag.",
    }, null, 2)}\n`);
    return;
  }

  throw new ReleasePreflightError("RELEASE_PREFLIGHT_ARGUMENT_INVALID", `unknown command: ${command ?? "missing"}`);
}

main().catch((error) => {
  const code = error instanceof ReleasePreflightError ? error.code : "RELEASE_PREFLIGHT_UNEXPECTED";
  process.stderr.write(`${code}: ${error.message}\n`);
  if (error?.details) process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
  process.exitCode = 1;
});
