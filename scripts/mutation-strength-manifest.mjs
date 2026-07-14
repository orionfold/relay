export const BASELINE_TEST_FILES = [
  "src/lib/db/__tests__/bootstrap.test.ts",
  "src/lib/workflows/__tests__/engine.test.ts",
  "src/lib/schedules/__tests__/slot-claim.test.ts",
  "src/lib/agents/runtime/__tests__/execution-target.test.ts",
  "src/lib/chat/__tests__/reconcile.test.ts",
  "src/lib/packs/__tests__/provenance.test.ts",
  "src/lib/licensing/__tests__/verify.test.ts",
];

const receiptUniqueFind =
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_operations_receipts_source_key ON operations_receipts(source_key);";
const receiptUniqueReplace =
  "CREATE INDEX IF NOT EXISTS idx_operations_receipts_source_key ON operations_receipts(source_key);";

/**
 * A deliberately small mutation sample over named load-bearing invariants.
 * Exact source anchors make source drift visible instead of silently skipping a
 * mutant. `failureEvidence` must occur in Vitest's verbose output before a
 * non-zero result can count as a kill.
 */
export const MUTATION_STRENGTH_MANIFEST = [
  {
    id: "db-receipt-source-key-unique",
    surface: "database-integrity",
    file: "src/lib/db/bootstrap.ts",
    find: receiptUniqueFind,
    replace: receiptUniqueReplace,
    testArgs: [
      "src/lib/db/__tests__/bootstrap.test.ts",
      "-t",
      "enforces unique Operations Receipt source keys",
    ],
    expectedOutcome: "killed",
    failureEvidence: "enforces unique Operations Receipt source keys",
    invariant: "Operations Receipt source keys remain idempotently unique",
  },
  {
    id: "workflow-failed-child-propagates",
    surface: "workflow-execution",
    file: "src/lib/workflows/engine.ts",
    find:
      '  if (completedTask?.status === "completed") {\n    return { taskId, status: "completed", result: completedTask.result ?? "" };\n  }',
    replace:
      '  if (completedTask?.status !== "completed") {\n    return { taskId, status: "completed", result: completedTask.result ?? "" };\n  }',
    testArgs: [
      "src/lib/workflows/__tests__/engine.test.ts",
      "-t",
      "returns failed when the persisted child task did not complete",
    ],
    expectedOutcome: "killed",
    failureEvidence: "returns failed when the persisted child task did not complete",
    invariant: "A failed child task cannot complete its workflow",
  },
  {
    id: "schedule-cap-boundary",
    surface: "schedule-atomic-claim",
    file: "src/lib/schedules/slot-claim.ts",
    find:
      "AND (SELECT COUNT(*) FROM tasks WHERE status = 'running' AND source_type IN ('scheduled', 'heartbeat')) < ?\";",
    replace:
      "AND (SELECT COUNT(*) FROM tasks WHERE status = 'running' AND source_type IN ('scheduled', 'heartbeat')) <= ?\";",
    testArgs: ["src/lib/schedules/__tests__/slot-claim.test.ts"],
    expectedOutcome: "killed",
    failureEvidence: "refuses to claim when cap=0",
    invariant: "A schedule claim never exceeds the configured global cap",
  },
  {
    id: "runtime-fallback-truth",
    surface: "runtime-target-resolution",
    file: "src/lib/agents/runtime/execution-target.ts",
    find:
      "          fallbackApplied: true,\n          fallbackReason: buildRuntimeFallbackReason({",
    replace:
      "          fallbackApplied: false,\n          fallbackReason: buildRuntimeFallbackReason({",
    testArgs: ["src/lib/agents/runtime/__tests__/execution-target.test.ts"],
    expectedOutcome: "killed",
    failureEvidence:
      "falls back from an unavailable requested task runtime to a compatible alternate",
    invariant: "Requested/effective runtime substitution is reported truthfully",
  },
  {
    id: "chat-stale-finalization-error",
    surface: "chat-finalization",
    file: "src/lib/chat/reconcile.ts",
    find: '      .set({ status: "error", content: salvage })',
    replace: '      .set({ status: "complete", content: salvage })',
    testArgs: ["src/lib/chat/__tests__/reconcile.test.ts"],
    expectedOutcome: "killed",
    failureEvidence:
      "sweeps a 20-min-old streaming row with empty content to error state with fallback",
    invariant: "A stale interrupted Chat stream cannot be reported complete",
  },
  {
    id: "pack-tamper-never-trusted",
    surface: "pack-provenance",
    file: "src/lib/packs/provenance.ts",
    find:
      '  if (!ok) return { tier: "community", verified: false }; // bad sig → downgrade, never trust',
    replace:
      "  if (!ok) return { tier: known.tier, verified: true, label: known.label }; // deliberate fault",
    testArgs: ["src/lib/packs/__tests__/provenance.test.ts"],
    expectedOutcome: "killed",
    failureEvidence:
      "downgrades a tampered manifest to community/unverified — never trusted",
    invariant: "Tampered Pack bytes never inherit a trusted tier",
  },
  {
    id: "license-signature-fail-closed",
    surface: "license-verification",
    file: "src/lib/licensing/verify.ts",
    find: "  return crypto.verify(null, message, key, sig);",
    replace: "  return true; // deliberate fault: accept every signature",
    testArgs: ["src/lib/licensing/__tests__/verify.test.ts"],
    expectedOutcome: "killed",
    failureEvidence: "rejects a tampered payload (byte drift breaks the signature)",
    invariant: "A tampered license payload never passes signature verification",
  },
  {
    id: "control-db-index-presence-only",
    surface: "survivor-control",
    file: "src/lib/db/bootstrap.ts",
    find: receiptUniqueFind,
    replace: receiptUniqueReplace,
    testArgs: [
      "src/lib/db/__tests__/bootstrap.test.ts",
      "-t",
      "bootstraps Operations Receipt storage and success-criteria columns idempotently",
    ],
    expectedOutcome: "survived",
    control: true,
    reviewDisposition:
      "Presence-only index assertions are insufficient. Retain the separate uniqueness regression; do not consolidate it into the presence test.",
    invariant:
      "The runner must report a known weak assertion boundary as a survivor",
  },
];
