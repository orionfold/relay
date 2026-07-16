import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  evaluateCoveragePolicy,
  eligibleProductionFiles,
} from "./check-quality-coverage.mjs";
import {
  changedFilesFromGit,
  evaluateLaneResult,
  LANE_DEFINITIONS,
  parseCli,
} from "./quality-gate.mjs";
import {
  ALWAYS_LANES,
  CONDITIONAL_LANES,
  COVERAGE_RATCHET_BASELINE,
  planQualityGate,
  QualityPolicyError,
  RELEASE_ONLY_LANES,
} from "./quality-policy.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function fakeMetrics({ linesCovered, linesTotal, branchesCovered, branchesTotal }) {
  return {
    lines: { covered: linesCovered, total: linesTotal, skipped: 0, pct: 0 },
    branches: {
      covered: branchesCovered,
      total: branchesTotal,
      skipped: 0,
      pct: 0,
    },
    statements: { covered: 0, total: 0, skipped: 0, pct: 100 },
    functions: { covered: 0, total: 0, skipped: 0, pct: 100 },
  };
}

test("PR plans always include the deterministic contract", () => {
  const plan = planQualityGate({ profile: "pr", changedFiles: ["README.md"] });
  assert.deepEqual(plan.lanes, ALWAYS_LANES);
});

test("CLI integration artifact is built before default coverage in every profile", () => {
  for (const profile of ["pr", "release"]) {
    const plan = planQualityGate({
      profile,
      changedFiles: profile === "pr" ? ["README.md"] : [],
    });
    assert.ok(plan.lanes.includes("build-cli"), profile);
    assert.ok(
      plan.lanes.indexOf("build-cli") < plan.lanes.indexOf("default-coverage"),
      profile
    );
  }
  assert.equal(RELEASE_ONLY_LANES.includes("build-cli"), false);
});

test("isolated quality harnesses depend only on tracked project inputs", () => {
  for (const path of [
    "scripts/runtime-module-graph-smoke.mjs",
    "scripts/test-mutation-strength.mjs",
  ]) {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    assert.doesNotMatch(source, /next-env\.d\.ts/, path);
  }
});

test("runtime graph smoke is always-on for transitive dependencies", () => {
  const plan = planQualityGate({
    profile: "pr",
    changedFiles: ["src/lib/settings/budget-guardrails.ts"],
  });
  assert.equal(plan.lanes.includes("runtime-graph"), true);
  assert.equal(plan.lanes.includes("harness-safety"), false);
});

test("protected workflow chokepoints add runtime and mutation controls", () => {
  const plan = planQualityGate({
    profile: "pr",
    changedFiles: ["src/lib/workflows/engine.ts"],
  });
  assert.equal(plan.lanes.includes("runtime-graph"), true);
  assert.equal(plan.lanes.includes("mutation-strength"), true);
});

test("all seven mutation chokepoints retain their fault-injection lane", () => {
  const protectedPaths = [
    "src/lib/db/bootstrap.ts",
    "src/lib/workflows/engine.ts",
    "src/lib/schedules/slot-claim.ts",
    "src/lib/agents/runtime/execution-target.ts",
    "src/lib/chat/reconcile.ts",
    "src/lib/packs/provenance.ts",
    "src/lib/licensing/verify.ts",
  ];
  for (const path of protectedPaths) {
    const plan = planQualityGate({ profile: "pr", changedFiles: [path] });
    assert.equal(plan.lanes.includes("mutation-strength"), true, path);
  }
});

test("quality-control changes conservatively add every conditional lane", () => {
  const plan = planQualityGate({ profile: "pr", changedFiles: ["package.json"] });
  for (const lane of CONDITIONAL_LANES) assert.equal(plan.lanes.includes(lane), true);
});

test("Pack manifest changes add compatibility without unrelated conditional controls", () => {
  const plan = planQualityGate({
    profile: "pr",
    changedFiles: ["src/lib/packs/templates/relay-agency-pro/base/manifest.yaml"],
  });
  assert.equal(plan.lanes.includes("pack-compat"), true);
  assert.equal(plan.lanes.includes("runtime-graph"), true);
  assert.equal(plan.lanes.includes("harness-safety"), false);
  assert.equal(plan.lanes.includes("mutation-strength"), false);
});

test("release plans run every conditional and release-only lane", () => {
  const plan = planQualityGate({ profile: "release" });
  assert.deepEqual(plan.lanes, [
    ...ALWAYS_LANES,
    ...CONDITIONAL_LANES,
    ...RELEASE_ONLY_LANES,
  ]);
});

test("unsafe, empty, and unknown PR planning inputs fail closed", () => {
  assert.throws(
    () => planQualityGate({ profile: "pr", changedFiles: ["../private.txt"] }),
    QualityPolicyError
  );
  assert.throws(
    () => planQualityGate({ profile: "pr", changedFiles: [] }),
    /requires at least one verified changed path/
  );
  assert.throws(
    () => planQualityGate({ profile: "unknown", changedFiles: ["README.md"] }),
    /Unknown quality profile/
  );
});

test("CLI parsing rejects missing values and unknown switches", () => {
  assert.throws(() => parseCli(["--wat"]), /Unknown quality-gate argument/);
  assert.throws(() => parseCli([]), /Missing required --profile/);
});

test("unresolvable git diff evidence fails closed", () => {
  assert.throws(
    () =>
      changedFilesFromGit({
        base: "definitely-not-a-ref",
        head: "also-not-a-ref",
        root: repoRoot,
      }),
    /Could not resolve verified PR diff/
  );
});

test("non-zero, signal, launch error, and missing semantic evidence are named failures", () => {
  const lane = LANE_DEFINITIONS["runtime-graph"];
  assert.match(
    evaluateLaneResult(lane, { status: 2, signal: null, stdout: "", stderr: "" })
      .reason,
    /exited 2/
  );
  assert.match(
    evaluateLaneResult(lane, {
      status: null,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
    }).reason,
    /signal SIGTERM/
  );
  const launchError = new Error("not found");
  assert.match(
    evaluateLaneResult(lane, {
      status: null,
      signal: null,
      error: launchError,
      stdout: "",
      stderr: "",
    }).reason,
    /could not start: not found/
  );
  assert.match(
    evaluateLaneResult(lane, {
      status: 0,
      signal: null,
      stdout: JSON.stringify({ ok: true }),
      stderr: "",
    }).reason,
    /lacks completed task\/workflow\/Chat runtime receipt/
  );
});

test("test-project membership lane requires its one-to-one receipt", () => {
  const lane = LANE_DEFINITIONS["test-projects"];
  assert.equal(
    evaluateLaneResult(lane, {
      status: 0,
      signal: null,
      stdout: "[test-projects] OK node=315 jsdom=100 browser=1 total=416",
      stderr: "",
    }).ok,
    true
  );
  assert.match(
    evaluateLaneResult(lane, {
      status: 0,
      signal: null,
      stdout: "",
      stderr: "",
    }).reason,
    /one-to-one Node\/jsdom\/browser project receipt/
  );
});

test("coverage policy fails when an eligible source disappears", () => {
  const report = evaluateCoveragePolicy({
    summary: { total: fakeMetrics({ linesCovered: 0, linesTotal: 0, branchesCovered: 0, branchesTotal: 0 }) },
    eligibleFiles: ["src/lib/db/example.ts"],
    riskSurfaces: [],
    root: "/fixture",
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.missingFiles, ["src/lib/db/example.ts"]);
});

test("coverage policy fails a lowered path-risk floor", () => {
  const report = evaluateCoveragePolicy({
    summary: {
      total: fakeMetrics({ linesCovered: 76, linesTotal: 100, branchesCovered: 75, branchesTotal: 100 }),
      "/fixture/src/lib/db/example.ts": fakeMetrics({
        linesCovered: 76,
        linesTotal: 100,
        branchesCovered: 75,
        branchesTotal: 100,
      }),
    },
    eligibleFiles: ["src/lib/db/example.ts"],
    riskSurfaces: [
      {
        id: "database",
        label: "Database",
        tier: 0,
        prefixes: ["src/lib/db/"],
        minimum: {
          lines: { covered: 215, total: 280 },
          branches: { covered: 12, total: 16 },
        },
      },
    ],
    root: "/fixture",
  });
  assert.equal(report.ok, false);
  assert.match(report.failures.join("\n"), /Database lines regressed/);
});

test("coverage ratchet detects one uncovered line below a large exact baseline", () => {
  const report = evaluateCoveragePolicy({
    summary: {
      total: fakeMetrics({ linesCovered: 577, linesTotal: 3678, branchesCovered: 266, branchesTotal: 2189 }),
      "/fixture/src/app/api/example.ts": fakeMetrics({
        linesCovered: 577,
        linesTotal: 3678,
        branchesCovered: 266,
        branchesTotal: 2189,
      }),
    },
    eligibleFiles: ["src/app/api/example.ts"],
    riskSurfaces: [
      {
        id: "api",
        label: "API routes",
        tier: 1,
        prefixes: ["src/app/api/"],
        minimum: {
          lines: { covered: 577, total: 3677 },
          branches: { covered: 266, total: 2189 },
        },
      },
    ],
    root: "/fixture",
  });
  assert.equal(report.ok, false);
  assert.match(report.failures.join("\n"), /577\/3678 \(15\.69%\).*577\/3677 \(15\.69%\)/);
});

test("eligible production inventory keeps approved exclusions explicit", () => {
  const files = eligibleProductionFiles(repoRoot);
  assert.equal(files.includes("bin/cli.ts"), true);
  assert.equal(files.includes("src/app/layout.tsx"), false);
  assert.equal(files.some((path) => path.includes("/__tests__/")), false);
});

test("workflow contract is always-on, reusable, read-only, and release-blocking", () => {
  const qualityPath = resolve(repoRoot, ".github/workflows/quality-gate.yml");
  const publishPath = resolve(repoRoot, ".github/workflows/publish.yml");
  const freshClonePath = resolve(repoRoot, ".github/workflows/fresh-clone-dev.yml");
  const qualitySource = readFileSync(qualityPath, "utf8");
  const publishSource = readFileSync(publishPath, "utf8");
  const quality = yaml.load(qualitySource);
  const publish = yaml.load(publishSource);
  const freshClone = yaml.load(readFileSync(freshClonePath, "utf8"));

  assert.equal(Object.hasOwn(quality.on, "pull_request"), true);
  assert.equal(Object.hasOwn(quality.on, "merge_group"), true);
  assert.equal(Object.hasOwn(quality.on, "workflow_call"), true);
  assert.equal(quality.on.pull_request, null);
  assert.equal(quality.permissions.contents, "read");
  assert.equal(quality.jobs.quality.name, "Relay quality gate");
  assert.equal(quality.jobs.quality["timeout-minutes"], 15);
  assert.equal(qualitySource.includes("paths:"), false);
  assert.match(qualitySource, /npm run quality:gate -- --profile pr/);
  assert.match(qualitySource, /persist-credentials: false/);

  const qualitySetupNode = quality.jobs.quality.steps.find(
    (step) => step.uses === "actions/setup-node@v5"
  );
  const publishSetupNode = publish.jobs.publish.steps.find(
    (step) => step.uses === "actions/setup-node@v5"
  );
  assert.equal(qualitySetupNode?.with?.["node-version"], COVERAGE_RATCHET_BASELINE.node);
  assert.equal(publishSetupNode?.with?.["node-version"], COVERAGE_RATCHET_BASELINE.node);
  assert.equal(
    qualitySource.includes(
      `npm install --global npm@${COVERAGE_RATCHET_BASELINE.npm}`
    ),
    true
  );
  assert.equal(
    publishSource.includes(`npm install -g npm@${COVERAGE_RATCHET_BASELINE.npm}`),
    true
  );

  assert.equal(
    publish.jobs.quality.uses,
    "./.github/workflows/quality-gate.yml"
  );
  assert.equal(publish.jobs.quality.with.profile, "release");
  assert.deepEqual(publish.jobs.publish.needs, ["quality", "npm12-first-run"]);
  assert.equal(publish.jobs["npm12-first-run"].needs, "quality");
  assert.equal(publish.jobs["npm12-first-run"].permissions.contents, "read");
  assert.equal(publish.jobs["npm12-first-run"]["timeout-minutes"], 15);
  const npm12SetupNode = publish.jobs["npm12-first-run"].steps.find(
    (step) => step.uses === "actions/setup-node@v5"
  );
  assert.equal(npm12SetupNode?.with?.["node-version"], "24.15.0");
  assert.match(publishSource, /npm install --global npm@12\.0\.1/);
  assert.match(publishSource, /npm run smoke:npm12/);
  assert.doesNotMatch(publishSource, /npx vitest run src\/lib\/licensing/);
  assert.match(publishSource, /node scripts\/npx-prod-smoke\.mjs/);
  assert.equal(Object.hasOwn(freshClone.on, "pull_request"), true);
  assert.ok(freshClone.on.pull_request.paths.length > 0);
});

test("required quality scripts use installed tools without opportunistic npx downloads", () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
  for (const lane of ALWAYS_LANES) {
    const definition = LANE_DEFINITIONS[lane];
    if (definition.command !== (process.platform === "win32" ? "npm.cmd" : "npm")) {
      continue;
    }
    const script = packageJson.scripts[definition.args[1]];
    assert.ok(script, `${lane} references a missing package script`);
    assert.doesNotMatch(script, /(?:^|\s)npx(?:\s|$)/, lane);
  }
});
