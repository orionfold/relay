export const QUALITY_PROFILES = ["pr", "release"];

export const ALWAYS_LANES = [
  "typecheck",
  "test-projects",
  "build-cli",
  "default-coverage",
  "coverage-policy",
  "test-audit",
  "quality-policy-tests",
  "hook-tests",
  "public-boundary-tests",
  "doc-link-tests",
  "public-boundary",
  "doc-links",
  "pack-taxonomy",
  "pack-tarball",
  "design-tokens",
  "runtime-graph",
];

export const CONDITIONAL_LANES = [
  "harness-safety",
  "mutation-strength",
  "pack-compat",
];

export const RELEASE_ONLY_LANES = [
  "release-preflight-tests",
  "relay-cell-publication-tests",
];

export const COVERAGE_RATCHET_BASELINE = {
  commit: "2852e89c",
  measuredAt: "2026-07-14",
  node: "22.18.0",
  npm: "11.6.0",
  eligibleProductionFiles: 965,
  topology: "node-jsdom-browser",
};

const qualityControlPaths = [
  ".github/workflows/quality-gate.yml",
  ".github/workflows/publish.yml",
  ".github/workflows/publish-relay-cell.yml",
  ".github/workflows/release-candidate.yml",
  ".github/workflows/fresh-clone-dev.yml",
  "package.json",
  "package-lock.json",
  "scripts/release-preflight.mjs",
  "scripts/lib/release-preflight.mjs",
  "scripts/release-preflight.test.mjs",
  "scripts/quality-policy.mjs",
  "scripts/quality-gate.mjs",
  "scripts/check-quality-coverage.mjs",
  "scripts/quality-gate.test.mjs",
  "scripts/test-audit.mjs",
  "scripts/test-projects.mjs",
  "scripts/check-test-projects.mjs",
  "vitest.config.ts",
];

export const PATH_LANE_RULES = {
  "harness-safety": [
    ...qualityControlPaths,
    "src/test/**",
    "scripts/test-harness-safety.mjs",
    "vitest.config.e2e.ts",
  ],
  "mutation-strength": [
    ...qualityControlPaths,
    "scripts/mutation-strength-manifest.mjs",
    "scripts/test-mutation-strength.mjs",
    "src/lib/db/bootstrap.ts",
    "src/lib/db/__tests__/bootstrap.test.ts",
    "src/lib/workflows/engine.ts",
    "src/lib/workflows/__tests__/engine.test.ts",
    "src/lib/schedules/slot-claim.ts",
    "src/lib/schedules/__tests__/slot-claim.test.ts",
    "src/lib/agents/runtime/execution-target.ts",
    "src/lib/agents/runtime/__tests__/execution-target.test.ts",
    "src/lib/chat/reconcile.ts",
    "src/lib/chat/__tests__/reconcile.test.ts",
    "src/lib/packs/provenance.ts",
    "src/lib/packs/__tests__/provenance.test.ts",
    "src/lib/licensing/verify.ts",
    "src/lib/licensing/__tests__/verify.test.ts",
  ],
  "pack-compat": [
    ...qualityControlPaths,
    "scripts/check-pack-compat.mjs",
    "scripts/check-pack-taxonomy.mjs",
    "scripts/check-pack-tarball.mjs",
    "src/lib/packs/templates/**",
    "src/lib/packs/taxonomy.json",
    "src/lib/packs/taxonomy.ts",
  ],
};

// Exact all-source values measured after the G-067 environment split. V8's
// Node instrumentation omits a directive/source-map line that jsdom counted as
// both covered and executable in several server modules; the affected floors
// were rebaselined only where that paired decrement lowered the ratio. These
// prevent regression; they are not claims that weak surfaces have reached the
// long-term targets in docs/quality/regression-strategy.md.
export const RISK_SURFACES = [
  {
    id: "database",
    label: "Database",
    tier: 0,
    prefixes: ["src/lib/db/"],
    minimum: {
      lines: { covered: 214, total: 279 },
      branches: { covered: 12, total: 16 },
    },
  },
  {
    id: "workflows",
    label: "Workflows",
    tier: 0,
    prefixes: ["src/lib/workflows/"],
    minimum: {
      lines: { covered: 557, total: 1325 },
      branches: { covered: 346, total: 883 },
    },
  },
  {
    id: "schedules",
    label: "Schedules",
    tier: 0,
    prefixes: ["src/lib/schedules/"],
    minimum: {
      lines: { covered: 684, total: 1070 },
      branches: { covered: 489, total: 919 },
    },
  },
  {
    id: "runtime",
    label: "Runtime adapters/catalog",
    tier: 0,
    prefixes: ["src/lib/agents/runtime/"],
    minimum: {
      lines: { covered: 282, total: 1428 },
      branches: { covered: 227, total: 1128 },
    },
  },
  {
    id: "agents",
    label: "Agents overall",
    tier: 1,
    prefixes: ["src/lib/agents/"],
    minimum: {
      lines: { covered: 1016, total: 2611 },
      branches: { covered: 715, total: 2044 },
    },
  },
  {
    id: "chat",
    label: "Chat",
    tier: 0,
    prefixes: ["src/lib/chat/"],
    minimum: {
      lines: { covered: 1102, total: 2706 },
      branches: { covered: 600, total: 2044 },
    },
  },
  {
    id: "packs",
    label: "Packs",
    tier: 0,
    prefixes: ["src/lib/packs/"],
    minimum: {
      lines: { covered: 823, total: 906 },
      branches: { covered: 505, total: 670 },
    },
  },
  {
    id: "licensing",
    label: "Licensing",
    tier: 0,
    prefixes: ["src/lib/licensing/"],
    minimum: {
      lines: { covered: 275, total: 307 },
      branches: { covered: 215, total: 267 },
    },
  },
  {
    id: "instance",
    label: "Instance bootstrap/upgrade",
    tier: 0,
    prefixes: ["src/lib/instance/"],
    minimum: {
      lines: { covered: 204, total: 246 },
      branches: { covered: 98, total: 136 },
    },
  },
  {
    id: "desktop",
    label: "Desktop artifact helpers",
    tier: 0,
    prefixes: ["src/lib/desktop/"],
    minimum: {
      lines: { covered: 125, total: 135 },
      branches: { covered: 54, total: 66 },
    },
  },
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
  {
    id: "components",
    label: "Components",
    tier: 2,
    prefixes: ["src/components/"],
    minimum: null,
  },
  {
    id: "cli",
    label: "CLI",
    tier: 0,
    prefixes: ["bin/"],
    minimum: null,
    boundaryException: "Customer-identical fresh-clone and packaged npx smokes",
  },
];

export class QualityPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "QualityPolicyError";
  }
}

export function normalizeChangedPath(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new QualityPolicyError("Changed paths must be non-empty strings");
  }
  const normalized = candidate.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.includes("\0") ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new QualityPolicyError(`Unsafe changed path: ${candidate}`);
  }
  return normalized;
}

export function pathMatchesPattern(path, pattern) {
  if (pattern.endsWith("/**")) {
    return path.startsWith(pattern.slice(0, -2));
  }
  return path === pattern;
}

export function planQualityGate({ profile, changedFiles = [] }) {
  if (!QUALITY_PROFILES.includes(profile)) {
    throw new QualityPolicyError(
      `Unknown quality profile ${JSON.stringify(profile)}; expected ${QUALITY_PROFILES.join(", ")}`
    );
  }
  const normalizedFiles = [...new Set(changedFiles.map(normalizeChangedPath))].sort();
  if (profile === "pr" && normalizedFiles.length === 0) {
    throw new QualityPolicyError(
      "The PR profile requires at least one verified changed path"
    );
  }

  const laneReasons = Object.fromEntries(
    ALWAYS_LANES.map((lane) => [lane, ["always required"]])
  );
  if (profile === "release") {
    for (const lane of CONDITIONAL_LANES) laneReasons[lane] = ["release profile"];
    for (const lane of RELEASE_ONLY_LANES) laneReasons[lane] = ["release profile"];
  } else {
    for (const [lane, patterns] of Object.entries(PATH_LANE_RULES)) {
      const matches = normalizedFiles.filter((path) =>
        patterns.some((pattern) => pathMatchesPattern(path, pattern))
      );
      if (matches.length > 0) laneReasons[lane] = matches;
    }
  }

  const ordered = [
    ...ALWAYS_LANES,
    ...CONDITIONAL_LANES,
    ...RELEASE_ONLY_LANES,
  ].filter((lane) => laneReasons[lane]);
  return {
    profile,
    changedFiles: normalizedFiles,
    lanes: ordered,
    laneReasons,
  };
}
