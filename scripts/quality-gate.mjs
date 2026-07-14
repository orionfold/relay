#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { planQualityGate, QualityPolicyError } from "./quality-policy.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const PROFILE_BUDGET_MS = { pr: 10 * 60_000, release: 12 * 60_000 };

function npmLane(id, script, evidence) {
  return {
    id,
    command: npmExecutable,
    args: ["run", script],
    evidence,
  };
}

export const LANE_DEFINITIONS = {
  typecheck: {
    id: "typecheck",
    command: process.execPath,
    args: ["node_modules/typescript/bin/tsc", "--noEmit"],
    evidence: "exit-zero",
  },
  "default-coverage": {
    id: "default-coverage",
    command: process.execPath,
    args: ["node_modules/vitest/vitest.mjs", "run", "--coverage"],
    evidence: "default-coverage",
  },
  "coverage-policy": {
    id: "coverage-policy",
    command: process.execPath,
    args: ["scripts/check-quality-coverage.mjs"],
    evidence: "quality-coverage",
  },
  "test-audit": {
    id: "test-audit",
    command: process.execPath,
    args: ["scripts/test-audit.mjs", "--json"],
    evidence: "audit-json",
  },
  "quality-policy-tests": npmLane(
    "quality-policy-tests",
    "test:quality-gate",
    "node-tests"
  ),
  "hook-tests": npmLane("hook-tests", "test:hooks", "node-tests"),
  "public-boundary-tests": npmLane(
    "public-boundary-tests",
    "test:public-boundary",
    "node-tests"
  ),
  "doc-link-tests": npmLane("doc-link-tests", "test:doc-links", "node-tests"),
  "public-boundary": npmLane(
    "public-boundary",
    "check:public-boundary",
    "public-boundary"
  ),
  "doc-links": npmLane("doc-links", "check:doc-links", "doc-links"),
  "pack-taxonomy": npmLane(
    "pack-taxonomy",
    "check:pack-taxonomy",
    "pack-taxonomy"
  ),
  "pack-tarball": npmLane(
    "pack-tarball",
    "check:pack-tarball",
    "pack-tarball"
  ),
  "design-tokens": npmLane(
    "design-tokens",
    "validate:tokens",
    "design-tokens"
  ),
  "harness-safety": npmLane(
    "harness-safety",
    "test:harness-safety",
    "harness-safety"
  ),
  "runtime-graph": {
    id: "runtime-graph",
    command: process.execPath,
    args: ["scripts/runtime-module-graph-smoke.mjs"],
    evidence: "runtime-json",
  },
  "mutation-strength": {
    id: "mutation-strength",
    command: process.execPath,
    args: ["scripts/test-mutation-strength.mjs"],
    evidence: "mutation-json",
  },
  "pack-compat": npmLane("pack-compat", "check:pack-compat", "pack-compat"),
  "build-cli": npmLane("build-cli", "build:cli", "build-cli"),
};

export class QualityGateError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "QualityGateError";
    this.details = details;
  }
}

function stripAnsi(output) {
  return output.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    ""
  );
}

function parseJson(output, laneId) {
  try {
    return JSON.parse(output.trim());
  } catch (error) {
    throw new QualityGateError(
      `${laneId} exited zero but did not emit its required JSON receipt`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function validateAudit(report) {
  if (report.schemaVersion !== 4) {
    return `test audit schema drifted: expected 4, received ${report.schemaVersion ?? "missing"}`;
  }
  const requiredTopology = [
    "defaultExcludesE2e",
    "coverageIncludesProductionSurface",
    "coverageReportsOnFailure",
    "defaultHarnessOwnsMutableState",
    "runtimeGraphSmokeConfigured",
    "mutationStrengthConfigured",
    "qualityGateConfigured",
    "e2eUsesCurrentSingleWorkerConfig",
  ];
  const missing = requiredTopology.filter((key) => report.topology?.[key] !== true);
  if (missing.length > 0) {
    return `test audit reports missing topology controls: ${missing.join(", ")}`;
  }
  if (!report.coverage || report.coverage.files !== report.scope.productionFiles - 3) {
    return "test audit does not report the complete eligible production denominator";
  }
  if (
    !report.topology.fullSuiteWorkflowReferences?.includes(
      ".github/workflows/quality-gate.yml"
    )
  ) {
    return "test audit cannot find the quality-gate workflow's full-suite contract";
  }
  return null;
}

export function evaluateLaneResult(lane, result, root = repoRoot) {
  if (result.error) {
    return {
      ok: false,
      reason: `${lane.id} could not start: ${result.error.message}`,
    };
  }
  if (result.signal) {
    return { ok: false, reason: `${lane.id} terminated by signal ${result.signal}` };
  }
  if (result.status !== 0) {
    return { ok: false, reason: `${lane.id} exited ${result.status}` };
  }

  const output = stripAnsi(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  let missing = null;
  switch (lane.evidence) {
    case "exit-zero":
      break;
    case "default-coverage":
      if (
        !/Test Files\s+\d+ passed/.test(output) ||
        !/Tests\s+\d+ passed/.test(output) ||
        !output.includes("Coverage summary") ||
        !existsSync(resolve(root, "coverage/coverage-summary.json"))
      ) {
        missing = "green default-suite counts and coverage summary";
      }
      break;
    case "quality-coverage":
      if (!output.includes("[quality-coverage] OK")) missing = "quality coverage receipt";
      break;
    case "audit-json": {
      let report;
      try {
        report = parseJson(result.stdout ?? "", lane.id);
      } catch (error) {
        return { ok: false, reason: error.message };
      }
      const auditFailure = validateAudit(report);
      if (auditFailure) missing = auditFailure;
      break;
    }
    case "node-tests":
      if (!/# pass [1-9]\d*/.test(output) || !/# fail 0/.test(output)) {
        missing = "non-zero Node test count with zero failures";
      }
      break;
    case "public-boundary":
      if (!output.includes("[public-boundary] OK")) missing = "public-boundary receipt";
      break;
    case "doc-links":
      if (!output.includes("[doc-links] OK")) missing = "documentation-link receipt";
      break;
    case "pack-taxonomy":
      if (!output.includes("[pack-taxonomy] OK")) missing = "Pack-taxonomy receipt";
      break;
    case "pack-tarball":
      if (!output.includes("[pack-tarball] OK")) missing = "Pack-tarball receipt";
      break;
    case "design-tokens":
      if (!output.includes("All design token validations passed")) {
        missing = "design-token validation receipt";
      }
      break;
    case "harness-safety":
      if (!output.includes("Harness safety verified")) missing = "harness cleanup receipt";
      break;
    case "runtime-json": {
      let report;
      try {
        report = parseJson(result.stdout ?? "", lane.id);
      } catch (error) {
        return { ok: false, reason: error.message };
      }
      if (
        report.ok !== true ||
        report.chatTermination !== "stream.completed" ||
        !Array.isArray(report.taskLogs) ||
        !report.taskLogs.includes("completed")
      ) {
        missing = "completed task/workflow/Chat runtime receipt";
      }
      break;
    }
    case "mutation-json": {
      let report;
      try {
        report = parseJson(result.stdout ?? "", lane.id);
      } catch (error) {
        return { ok: false, reason: error.message };
      }
      if (
        report.ok !== true ||
        report.summary?.killed !== 7 ||
        report.summary?.survivorControls !== 1 ||
        report.restoration?.matchesBaseline !== true ||
        report.cleanup?.removed !== true
      ) {
        missing = "7/7 kill, survivor, restoration, and cleanup receipt";
      }
      break;
    }
    case "pack-compat":
      if (!output.includes("[pack-compat] OK")) missing = "Pack-compatibility receipt";
      break;
    case "build-cli":
      if (!/Build success|DTS Build success/.test(output)) missing = "CLI build receipt";
      break;
    default:
      missing = `known evidence validator for ${lane.evidence}`;
  }
  return missing
    ? { ok: false, reason: `${lane.id} exited zero but lacks ${missing}` }
    : { ok: true, reason: null };
}

export function changedFilesFromGit({ base, head, root = repoRoot }) {
  if (!base || !head) {
    throw new QualityPolicyError("The PR profile requires explicit base and head refs");
  }
  let output;
  try {
    output = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error.message;
    throw new QualityPolicyError(
      `Could not resolve verified PR diff ${base}...${head}: ${detail}`
    );
  }
  return output.split("\n").filter(Boolean);
}

function displayCommand(lane) {
  return [lane.command, ...lane.args]
    .map((part) => (/^[a-zA-Z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

export function runQualityGate(plan, { root = repoRoot } = {}) {
  const startedAt = performance.now();
  const budgetMs = PROFILE_BUDGET_MS[plan.profile];
  const receipt = {
    schemaVersion: 1,
    profile: plan.profile,
    changedFiles: plan.changedFiles,
    node: process.version,
    npmUserAgent: process.env.npm_config_user_agent ?? null,
    budgetMs,
    lanes: [],
    ok: false,
  };
  console.log(
    `[quality-gate] plan profile=${plan.profile} lanes=${plan.lanes.join(",")}`
  );
  for (const laneId of plan.lanes) {
    const lane = LANE_DEFINITIONS[laneId];
    if (!lane) throw new QualityGateError(`No command is registered for lane ${laneId}`);
    console.log(`[quality-gate] START ${lane.id}: ${displayCommand(lane)}`);
    const laneStartedAt = performance.now();
    const result = spawnSync(lane.command, lane.args, {
      cwd: root,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    const durationMs = Math.round(performance.now() - laneStartedAt);
    const evaluation = evaluateLaneResult(lane, result, root);
    receipt.lanes.push({ id: lane.id, durationMs, ok: evaluation.ok });
    if (!evaluation.ok) {
      throw new QualityGateError(evaluation.reason, receipt);
    }
    console.log(`[quality-gate] PASS ${lane.id} (${durationMs} ms)`);
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs > budgetMs) {
      throw new QualityGateError(
        `${plan.profile} profile exceeded its ${budgetMs} ms execution budget`,
        receipt
      );
    }
  }
  receipt.ok = true;
  receipt.totalDurationMs = Math.round(performance.now() - startedAt);
  console.log(`[quality-gate] RECEIPT ${JSON.stringify(receipt)}`);
  return receipt;
}

export function parseCli(argv) {
  const options = {
    profile: null,
    base: process.env.QUALITY_BASE_SHA || null,
    head: process.env.QUALITY_HEAD_SHA || null,
    changedFiles: [],
    dryRun: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--profile") options.profile = argv[++index];
    else if (arg === "--base") options.base = argv[++index];
    else if (arg === "--head") options.head = argv[++index];
    else if (arg === "--changed-file") options.changedFiles.push(argv[++index]);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else throw new QualityPolicyError(`Unknown quality-gate argument: ${arg}`);
  }
  if (!options.profile) {
    throw new QualityPolicyError("Missing required --profile pr|release");
  }
  return options;
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const options = parseCli(process.argv.slice(2));
    const changedFiles =
      options.profile === "pr" && options.changedFiles.length === 0
        ? changedFilesFromGit({ base: options.base, head: options.head })
        : options.changedFiles;
    const plan = planQualityGate({ profile: options.profile, changedFiles });
    if (options.dryRun) {
      console.log(options.json ? JSON.stringify(plan, null, 2) : plan.lanes.join("\n"));
    } else {
      runQualityGate(plan);
    }
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[quality-gate] FAIL ${message}`);
    if (error instanceof QualityGateError && error.details) {
      console.error(`[quality-gate] PARTIAL ${JSON.stringify(error.details)}`);
    }
    process.exitCode = 1;
  }
}
