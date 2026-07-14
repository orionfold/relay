#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COVERAGE_RATCHET_BASELINE,
  RISK_SURFACES,
} from "./quality-policy.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export class QualityCoverageError extends Error {
  constructor(message, failures = []) {
    super(message);
    this.name = "QualityCoverageError";
    this.failures = failures;
  }
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function eligibleProductionFiles(root = repoRoot) {
  const candidates = [resolve(root, "src"), resolve(root, "bin")].flatMap(walk);
  return candidates
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .filter((path) => !path.endsWith(".d.ts"))
    .filter((path) => !path.includes("/__tests__/"))
    .filter((path) => !path.startsWith("src/test/"))
    .filter(
      (path) =>
        !["src/app/layout.tsx", "src/app/error.tsx", "src/app/global-error.tsx"].includes(
          path
        )
    )
    .sort();
}

function relativeCoveragePath(path, root) {
  const normalized = path.replaceAll("\\", "/");
  const normalizedRoot = root.replaceAll("\\", "/");
  return normalized.startsWith(`${normalizedRoot}/`)
    ? normalized.slice(normalizedRoot.length + 1)
    : normalized;
}

function aggregate(entries, metric) {
  const totals = entries.reduce(
    (sum, entry) => ({
      covered: sum.covered + entry.metrics[metric].covered,
      total: sum.total + entry.metrics[metric].total,
    }),
    { covered: 0, total: 0 }
  );
  return {
    ...totals,
    pct:
      totals.total === 0
        ? 100
        : Math.round((totals.covered / totals.total) * 10_000) / 100,
  };
}

function isBelowBaseline(actual, minimum) {
  if (actual.total === 0) return minimum.covered > 0;
  return actual.covered * minimum.total < minimum.covered * actual.total;
}

function formatRatio(metric) {
  return `${metric.covered}/${metric.total} (${metric.pct}%)`;
}

export function evaluateCoveragePolicy({
  summary,
  eligibleFiles,
  riskSurfaces = RISK_SURFACES,
  root = repoRoot,
}) {
  const entries = Object.entries(summary)
    .filter(([path]) => path !== "total")
    .map(([path, metrics]) => ({
      path: relativeCoveragePath(path, root),
      metrics,
    }));
  const coveredPaths = new Set(entries.map((entry) => entry.path));
  const missingFiles = eligibleFiles.filter((path) => !coveredPaths.has(path));
  const failures = missingFiles.map((path) => `eligible production source missing: ${path}`);

  const surfaces = riskSurfaces.map((surface) => {
    const matching = entries.filter((entry) =>
      surface.prefixes.some((prefix) => entry.path.startsWith(prefix))
    );
    const lines = aggregate(matching, "lines");
    const branches = aggregate(matching, "branches");
    if (matching.length === 0) {
      failures.push(`${surface.label}: no coverage entries matched ${surface.prefixes.join(", ")}`);
    }
    if (surface.minimum) {
      for (const [metric, minimum] of Object.entries(surface.minimum)) {
        const actual = metric === "lines" ? lines : branches;
        if (isBelowBaseline(actual, minimum)) {
          const minimumPct =
            minimum.total === 0
              ? 100
              : Math.round((minimum.covered / minimum.total) * 10_000) / 100;
          failures.push(
            `${surface.label} ${metric} regressed: ${formatRatio(actual)} < ` +
              `${minimum.covered}/${minimum.total} (${minimumPct}%) baseline`
          );
        }
      }
    }
    return {
      id: surface.id,
      label: surface.label,
      tier: surface.tier,
      files: matching.length,
      lines,
      branches,
      minimum: surface.minimum,
      boundaryException: surface.boundaryException ?? null,
    };
  });

  return {
    ok: failures.length === 0,
    baseline: COVERAGE_RATCHET_BASELINE,
    eligibleFiles: eligibleFiles.length,
    reportedFiles: entries.length,
    missingFiles,
    surfaces,
    failures,
  };
}

export function runCoveragePolicy(root = repoRoot) {
  const summaryPath = resolve(root, "coverage/coverage-summary.json");
  if (!existsSync(summaryPath)) {
    throw new QualityCoverageError(
      "coverage/coverage-summary.json is missing; run the default coverage lane first"
    );
  }
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const report = evaluateCoveragePolicy({
    summary,
    eligibleFiles: eligibleProductionFiles(root),
    root,
  });
  if (!report.ok) {
    throw new QualityCoverageError(
      `Quality coverage policy failed with ${report.failures.length} finding(s)`,
      report.failures
    );
  }
  return report;
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const report = runCoveragePolicy();
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const enforced = report.surfaces.filter((surface) => surface.minimum).length;
      console.log(
        `[quality-coverage] OK — ${report.eligibleFiles} eligible files reported; ${enforced} risk surfaces at or above ratchet floors.`
      );
    }
  } catch (error) {
    const failures = error instanceof QualityCoverageError ? error.failures : [];
    console.error(
      `[quality-coverage] ERROR — ${error instanceof Error ? error.message : String(error)}`
    );
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}
