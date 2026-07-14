#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = new Set(process.argv.slice(2));
const jsonOnly = args.has("--json");

function walk(directory) {
  if (!existsSync(directory)) return [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name)
  );
  return entries.flatMap((entry) => {
    if (entry.isSymbolicLink()) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

function areaFor(path) {
  const parts = path.split("/");
  if (parts[0] !== "src") return parts[0] ?? "other";
  if (parts[1] === "lib") return `src/lib/${parts[2] ?? "root"}`;
  return `src/${parts[1] ?? "root"}`;
}

function relativeFiles(directory) {
  return walk(resolve(repoRoot, directory))
    .map((path) => relative(repoRoot, path).replaceAll("\\", "/"))
    .sort((left, right) => left.localeCompare(right));
}

const srcFiles = relativeFiles("src");
const binFiles = relativeFiles("bin");
const vitestFiles = srcFiles.filter((path) =>
  /\/__tests__\/.*\.test\.(?:ts|tsx)$/.test(path)
);
const e2eFiles = srcFiles.filter((path) =>
  /^src\/__tests__\/e2e\/.*\.test\.ts$/.test(path)
);
const defaultVitestFiles = vitestFiles.filter(
  (path) => !path.startsWith("src/__tests__/e2e/")
);
const productionFiles = [...srcFiles, ...binFiles].filter(
  (path) =>
    /\.(?:ts|tsx)$/.test(path) &&
    !path.endsWith(".d.ts") &&
    !path.includes("/__tests__/") &&
    !path.startsWith("src/test/")
);
const nodeTestFiles = [
  ...relativeFiles(".codex/hooks"),
  ...relativeFiles("scripts"),
].filter((path) => /\.test\.(?:js|cjs|mjs)$/.test(path));

const vitestFileStats = vitestFiles.map((path) => {
  const source = readFileSync(resolve(repoRoot, path), "utf8");
  return {
    path,
    lines: source.split("\n").length,
    directDeclarations: countMatches(
      source,
      /\b(?:it|test)(?:\.(?:skip|todo|concurrent|each|skipIf|runIf))?\s*\(/g
    ),
    parameterizedDeclarations: countMatches(source, /\.(?:each)\s*\(/g),
    skippedOrConditionalDeclarations: countMatches(
      source,
      /\b(?:it|test)\.(?:skip|todo|skipIf|runIf)\s*\(/g
    ),
    mockDeclarations: countMatches(source, /\bvi\.mock\s*\(/g),
    environmentOverrides: countMatches(source, /@vitest-environment\s+\w+/g),
  };
});
const nodeTestFileStats = nodeTestFiles.map((path) => {
  const source = readFileSync(resolve(repoRoot, path), "utf8");
  return {
    path,
    directDeclarations: countMatches(
      source,
      /\btest(?:\.(?:skip|todo))?\s*\(/g
    ),
  };
});

const byArea = Object.entries(
  vitestFileStats.reduce((counts, file) => {
    const area = areaFor(file.path);
    counts[area] = (counts[area] ?? 0) + 1;
    return counts;
  }, {})
)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([area, files]) => ({ area, files }));

const apiRoutes = srcFiles.filter((path) =>
  /^src\/app\/api\/.*\/route\.ts$/.test(path)
);
const apiRouteTestFiles = vitestFiles.filter((path) =>
  path.startsWith("src/app/api/")
);
const workflowDirectory = resolve(repoRoot, ".github/workflows");
const workflowFiles = walk(workflowDirectory)
  .map((path) => relative(repoRoot, path).replaceAll("\\", "/"))
  .filter((path) => /\.ya?ml$/.test(path));
const fullSuiteWorkflowReferences = workflowFiles.filter((path) => {
  const source = readFileSync(resolve(repoRoot, path), "utf8");
  return /(?:npm\s+(?:run\s+)?test(?:\s|$)|npx\s+vitest\s+run\s*(?:\n|$))/m.test(
    source
  );
});

const vitestConfig = readFileSync(resolve(repoRoot, "vitest.config.ts"), "utf8");
const e2eVitestConfig = readFileSync(
  resolve(repoRoot, "vitest.config.e2e.ts"),
  "utf8"
);
const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, "package.json"), "utf8")
);

const coverageSummaryPath = resolve(repoRoot, "coverage/coverage-summary.json");
const coverageSummary = existsSync(coverageSummaryPath)
  ? JSON.parse(readFileSync(coverageSummaryPath, "utf8"))
  : null;
const coverageEntries = coverageSummary
  ? Object.entries(coverageSummary)
      .filter(([path]) => path !== "total")
      .map(([path, metrics]) => ({
        path: relative(repoRoot, path).replaceAll("\\", "/"),
        metrics,
      }))
      .sort((left, right) => left.path.localeCompare(right.path))
  : [];
const riskSurfaceDefinitions = [
  ["Database", ["src/lib/db/"]],
  ["Workflows", ["src/lib/workflows/"]],
  ["Schedules", ["src/lib/schedules/"]],
  ["Runtime adapters/catalog", ["src/lib/agents/runtime/"]],
  ["Agents overall", ["src/lib/agents/"]],
  ["Chat", ["src/lib/chat/"]],
  ["Packs", ["src/lib/packs/"]],
  ["Licensing", ["src/lib/licensing/"]],
  ["Instance bootstrap/upgrade", ["src/lib/instance/"]],
  ["Desktop artifact helpers", ["src/lib/desktop/"]],
  ["API routes", ["src/app/api/"]],
  ["Components", ["src/components/"]],
  ["CLI", ["bin/"]],
];

function aggregateMetric(entries, metric) {
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

const coverage = coverageSummary
  ? {
      summaryPath: "coverage/coverage-summary.json",
      total: coverageSummary.total,
      files: coverageEntries.length,
      zeroLineFiles: coverageEntries.filter(
        (entry) =>
          entry.metrics.lines.total > 0 && entry.metrics.lines.covered === 0
      ).length,
      byRiskSurface: riskSurfaceDefinitions.map(([surface, prefixes]) => {
        const entries = coverageEntries.filter((entry) =>
          prefixes.some((prefix) => entry.path.startsWith(prefix))
        );
        return {
          surface,
          prefixes,
          files: entries.length,
          lines: aggregateMetric(entries, "lines"),
          branches: aggregateMetric(entries, "branches"),
        };
      }),
    }
  : null;

const report = {
  schemaVersion: 2,
  scope: {
    productionFiles: productionFiles.length,
    totalTestFiles: vitestFiles.length + nodeTestFiles.length,
    vitestTestFiles: vitestFiles.length,
    defaultVitestTestFiles: defaultVitestFiles.length,
    e2eVitestTestFiles: e2eFiles.length,
    nodeTestFiles: nodeTestFiles.length,
    totalDirectTestDeclarations:
      vitestFileStats.reduce(
        (total, file) => total + file.directDeclarations,
        0
      ) +
      nodeTestFileStats.reduce(
        (total, file) => total + file.directDeclarations,
        0
      ),
    directVitestTestDeclarations: vitestFileStats.reduce(
      (total, file) => total + file.directDeclarations,
      0
    ),
    directNodeTestDeclarations: nodeTestFileStats.reduce(
      (total, file) => total + file.directDeclarations,
      0
    ),
    parameterizedDeclarations: vitestFileStats.reduce(
      (total, file) => total + file.parameterizedDeclarations,
      0
    ),
    skippedOrConditionalDeclarations: vitestFileStats.reduce(
      (total, file) => total + file.skippedOrConditionalDeclarations,
      0
    ),
    mockDeclarations: vitestFileStats.reduce(
      (total, file) => total + file.mockDeclarations,
      0
    ),
    environmentOverrideFiles: vitestFileStats.filter(
      (file) => file.environmentOverrides > 0
    ).length,
    snapshotFiles: srcFiles.filter(
      (path) => path.includes("/__snapshots__/") || path.endsWith(".snap")
    ).length,
    apiRouteModules: apiRoutes.length,
    apiRouteTestFiles: apiRouteTestFiles.length,
  },
  topology: {
    byArea,
    nodeTestFiles,
    workflowFiles,
    fullSuiteWorkflowReferences,
    defaultExcludesE2e:
      vitestConfig.includes('exclude: ["src/__tests__/e2e/**"]') &&
      packageJson.scripts?.["test:e2e"]?.includes("vitest.config.e2e.ts"),
    coverageIncludesProductionSurface:
      vitestConfig.includes('"src/**/*.{ts,tsx}"') &&
      vitestConfig.includes('"bin/**/*.ts"') &&
      !vitestConfig.includes('"src/components/ui/**"'),
    coverageReportsOnFailure: vitestConfig.includes("reportOnFailure: true"),
    defaultHarnessOwnsMutableState:
      vitestConfig.includes('globalSetup: ["./src/test/global-setup.ts"]') &&
      vitestConfig.includes("unstubEnvs: true") &&
      vitestConfig.includes("unstubGlobals: true") &&
      packageJson.scripts?.["test:harness-safety"] ===
        "node scripts/test-harness-safety.mjs",
    e2eUsesCurrentSingleWorkerConfig:
      e2eVitestConfig.includes("maxWorkers: 1") &&
      e2eVitestConfig.includes("isolate: false") &&
      !/\bpoolOptions\s*:/.test(e2eVitestConfig),
  },
  coverage,
  largestVitestFiles: [...vitestFileStats]
    .sort(
      (left, right) =>
        right.directDeclarations - left.directDeclarations ||
        right.lines - left.lines ||
        left.path.localeCompare(right.path)
    )
    .slice(0, 15)
    .map(({ path, lines, directDeclarations }) => ({
      path,
      lines,
      directDeclarations,
    })),
  notes: [
    "direct declaration counts are static heuristics, not expanded test.each rows or runtime-generated cases",
    "apiRouteTestFiles is an adjacency inventory, not proof that every route behavior is covered",
    "coverage is read from coverage/coverage-summary.json when present; run test:coverage immediately before this command",
    "risk-surface groups are independent prefix aggregates, so Agents overall intentionally overlaps Runtime adapters/catalog",
  ],
};

if (jsonOnly) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const rows = [
    ["Production TypeScript files", report.scope.productionFiles],
    ["Test files (repository)", report.scope.totalTestFiles],
    ["Vitest files (default)", report.scope.defaultVitestTestFiles],
    ["Vitest files (E2E)", report.scope.e2eVitestTestFiles],
    ["Node test files", report.scope.nodeTestFiles],
    ["Direct declarations (all)", report.scope.totalDirectTestDeclarations],
    ["Mock declarations", report.scope.mockDeclarations],
    ["API route modules", report.scope.apiRouteModules],
    ["API route test files", report.scope.apiRouteTestFiles],
  ];
  console.log("Relay test audit inventory");
  for (const [label, value] of rows) {
    console.log(`${label.padEnd(30)} ${value}`);
  }
  console.log(
    `Default/E2E separation`.padEnd(30),
    report.topology.defaultExcludesE2e ? "configured" : "MISSING"
  );
  console.log(
    `Production coverage include`.padEnd(30),
    report.topology.coverageIncludesProductionSurface ? "configured" : "MISSING"
  );
  console.log(
    `Coverage on failure`.padEnd(30),
    report.topology.coverageReportsOnFailure ? "configured" : "MISSING"
  );
  console.log(
    `Harness-owned mutable state`.padEnd(30),
    report.topology.defaultHarnessOwnsMutableState ? "configured" : "MISSING"
  );
  console.log(
    `Vitest 4 E2E worker config`.padEnd(30),
    report.topology.e2eUsesCurrentSingleWorkerConfig ? "configured" : "MISSING"
  );
  console.log(
    `Full-suite workflow refs`.padEnd(30),
    report.topology.fullSuiteWorkflowReferences.length
  );
}
