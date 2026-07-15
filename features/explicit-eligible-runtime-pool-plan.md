# G-077 implementation plan — explicit eligible runtime pool

Status: complete — all vertical slices and verification gates passed 2026-07-15
Date: 2026-07-15
Specification: `features/explicit-eligible-runtime-pool.md`
Architecture: `features/explicit-eligible-runtime-pool-architect-report.md`, TDR-043
Scope mode: PROCEED, approved by operator 2026-07-15

## Outcome and non-goals

Deliver one versioned task-routing policy, one truthful Settings editor and
preview, one execution-time resolver contract, and one durable selection
receipt. Keep provider configuration, Chat model routing, benchmarking,
per-profile pools, and provider administration out of scope.

## Affected surfaces

- `src/lib/constants/settings.ts`
- `src/lib/settings/routing.ts` and new pure routing-policy helpers
- `src/app/api/settings/routing/route.ts`
- `src/app/api/settings/providers/route.ts`
- `src/lib/agents/router.ts`
- `src/lib/agents/runtime/execution-target.ts`
- `src/lib/agents/task-dispatch.ts`
- `src/lib/tasks/run-history.ts`
- `src/components/tasks/task-run-history.tsx`
- `src/components/settings/providers-runtimes-section.tsx` and an extracted
  routing-policy editor
- focused tests for each boundary, runtime graph smoke, browser evidence, and
  durable docs/TDR/backlog/changelog records

## Vertical slices

### Slice 1 — versioned policy and atomic API

1. Add `routing.policy` and pure v1 parse/normalize/default functions.
2. Replace preference-only reads/writes with a combined normalized snapshot.
3. Validate the Settings route with Zod and atomically persist preference plus
   policy through `applySettingsPatch()`.
4. Add absent/corrupt/future-version/duplicates/removed-id and real-SQLite API
   regressions before touching execution.

Executable check:

```bash
npx vitest run src/lib/settings/__tests__/routing.test.ts src/app/api/settings/routing/__tests__/route.test.ts
```

### Slice 2 — evidence-aware ranker and execution boundary

1. Replace provider-identity score tables with a typed candidate/evidence
   input, affinity signals, known comparable cost, and saved-order tie breaks.
2. Intersect automatic candidates with the saved pool before profile,
   capability, health, and launch exclusions.
3. Make Manual use the strict saved default; keep explicit targets strict.
4. Return considered order and skipped reasons with the resolved target so
   preview and dispatch consume one decision.
5. Cover all seven adapters, exclusions, configuration drift, profile/model
   pins, hard capabilities, unhealthy/empty pools, and fallback boundaries.

Executable check:

```bash
npx vitest run src/lib/agents/__tests__/router.test.ts src/lib/agents/runtime/__tests__/execution-target.test.ts
```

### Slice 3 — durable receipt

1. Emit a bounded `runtime_selected` log before every launch attempt.
2. Preserve separate launch-failure and fallback events; include considered and
   skipped candidates in selection/fallback detail.
3. Add the readable event label and verify run-history grouping/bounding.

Executable check:

```bash
npx vitest run src/lib/agents/__tests__/task-dispatch.test.ts src/app/api/tasks/\[id\]/history/__tests__/route.test.ts src/components/tasks/__tests__/task-run-history.test.tsx
```

### Slice 4 — Settings health and policy editor

1. Build a bounded TTL-cached all-runtime status snapshot with all-settled
   failures and safe model/capability summaries.
2. Return the routing snapshot and runtime rows from the providers endpoint.
3. Extract a focused routing editor that displays all seven ids, selected and
   current status, strict Manual default, automatic fallback, order/reasons,
   save/loading/error states, keyboard/focus behavior, and responsive wrapping.
4. Delete forward and reverse provider cascades and their recommendation helper;
   replace cascade assertions with policy-persistence/no-provider-write tests.

Executable check:

```bash
npx vitest run src/app/api/settings/providers/__tests__/route.test.ts src/components/settings/__tests__/runtime-routing-control.test.tsx src/components/settings/__tests__/providers-runtimes-section.test.tsx
```

### Slice 5 — integration, runtime, and visual proof

1. Run the complete impacted test matrix, TypeScript, token/parity/critical-API
   guards, diff check, full suite, and production build.
2. Run `npm run test:runtime-graph` and a real task under `npm run dev` to cross
   the runtime registry/module graph.
3. Exercise configured Ollama, LiteLLM, and LM Studio as selected or visibly
   skipped. No unavailable customer/provider environment is represented as a
   successful real-provider execution.
4. Use the in-app Browser at desktop and 390px, light and dark, to verify
   editing, keyboard/focus, empty/degraded states, preview/receipt parity,
   wrapping, and system cursor behavior. Store artifacts under
   `output/g077-runtime-routing/`.
5. Run a fresh security-focused code review and repair merge-blocking findings.

## Regression-test budget

- Pure settings policy: approximately 12 cases.
- Ranker/resolver: approximately 25 table rows covering seven adapters and
  precedence/failure states.
- Routing/providers APIs: approximately 12 real-SQLite or bounded-mock cases.
- Dispatch/history: approximately 8 cases.
- Settings component: approximately 12 interaction/accessibility cases.
- Existing impacted matrix plus full suite remain mandatory; prune obsolete
  cascade tests rather than retaining assertions for removed behavior.

## Verification ladder

1. Nearest deterministic test after each slice.
2. Combined impacted runtime/settings/task-history test matrix.
3. `npm run typecheck`, design-token/system-cursor guard, agent parity, critical
   API inventory, and `git diff --check`.
4. `npm test` and `npm run build`.
5. Real runtime graph/task smoke.
6. In-app Browser evidence at 1440 and 390px in light/dark.
7. Fresh code review against specification and TDR-043.

## Operator gates

The product-policy gate was approved on 2026-07-15. No further gate is expected
for local implementation, tests, docs, or the final goal-owned local commit.
Credentials, provider registration, external writes, push, publish, release,
or destructive cleanup remain separately gated and are not part of G-077.

## Stop, rescue, and rollback

- Stop after two materially different fixes fail on the same blocker and return
  an evidence packet rather than weakening the contract.
- If all-runtime probes block Settings, split cached state from refresh behind a
  bounded endpoint; do not restore provider-specific health exceptions.
- If price/model joining is ambiguous, preserve unknown cost and saved order.
- If Settings complexity grows conditionals across provider forms, keep the
  routing editor extracted and independently tested.
- If a runtime module cycle appears, use function-local dynamic imports at the
  settings/adapter boundary and rerun the real task smoke.
- Rollback can ignore the inert policy row and remove the editor while retaining
  compatible preference and semantic logs.
