# fix: "Seed sample data" fails opaquely on customer builds AND ignores installed packs

**Status:** proposed · **Priority:** P2 (MED) · **Milestone:** 0.26.0
**Source:** staging Mode B run 2026-07-04, bundle `output/staging/2026-07-04-operator-walkthrough/` (findings BUG-5 + BUG-6, verified against HEAD `dd39bea7`)
**Dependencies:** BUG-6's runtime test depends on BUG-5's gate fix (seed must be reachable to exercise pack coverage). Not runtime-registry-adjacent.

## Description (verified mechanism, not the raw symptom)

Two defects in the same "Seed sample data" feature, both confirmed against HEAD.

### BUG-5 — a staging-gated 404 surfaces as a scary "Seed failed. Network error"

- `src/lib/data/staging-gate.ts:14-15` — `isDataOpsAllowed()` returns `true` for any non-production env, and requires `RELAY_STAGING === "true"` **only** in production. So on a customer prod build (npx), the gate closes.
- `src/app/api/data/seed/route.ts:6-8` — when `!isDataOpsAllowed()` the route returns a **bare** `NextResponse.json(null, { status: 404 })` — no explanatory body.
- `src/components/settings/data-management-section.tsx:117-128` — renders the "Seed Sample Data" button **unconditionally** (no gating import).
- **Error path (refined):** on the 404 the null body makes `await res.json()` resolve to `null` (`:47`); then `data.success` (`:48`) throws a `TypeError` (null deref) swallowed by a bare `catch {}` (`:56`) → `toast.error("Seed failed. Network error")` (`:57`). So the customer sees a network-error message for a feature that was deliberately disabled, driven by a swallowed TypeError.

Violates engineering principle #1 (opaque gate + swallowed error) and #2 (no named error type).

### BUG-6 — seed has no installed-pack coverage; the just-installed Pro ledger stays empty

- `src/lib/data/seed.ts:64` — `seedSampleData` seeds ~22 **generic-primitive** generators (projects, tasks, workflows, schedules, profiles, user-tables, documents, conversations, agent-memory, usage-ledger, notifications, logs, views, …) with an "Agency Owner" persona flavor.
- Grep of `src/lib/data/seed-data/*.ts` for `relay-agency` / `relay-agency-pro` / pack app-instances / ledger transactions → **zero production hits** (only a `test-pack` fixture in `__tests__/plugin-tables.test.ts` and the unrelated generic `usage-ledger.ts`).
- So the **Agency Pro LEDGER app** (finance cockpit showing "No data yet / No transactions") gets zero seeded transactions. Even after a successful seed, the pack app the customer just installed stays empty. Violates principle #3 (installed-pack surface is an uncovered shadow path of "seed sample data").

## Repro

1. `npx orionfold-relay@latest` in a non-git cwd (customer topology, prod build).
2. Settings → Data → "Seed Sample Data" → observe "Seed failed. Network error" (BUG-5). `POST /api/data/seed` → HTTP 404.
3. (After BUG-5 fix / on a staging build) install Agency Pro, seed, open `/apps/relay-agency-pro` → ledger still "No transactions" (BUG-6).

## Proposed fix

**BUG-5:** hide or disable the "Seed Sample Data" control when `!isDataOpsAllowed` (import the gate client-side or expose it via a small settings flag), OR have the route return a named, explanatory body ("Sample data seeding is a staging-only tool") that the UI surfaces verbatim instead of collapsing to "Network error". Stop the `catch {}` from disguising a 404 as a network failure — branch on `res.status`.

**BUG-6:** make seed **pack-aware** — detect installed packs and seed their app-instance data (ledger transactions for the Pro finance cockpit; rows for pack row-insert tables). Prefer "seed whatever packs are installed" over a hardcoded Agency-Pro path. Relates to BUG-2/BUG-3 (pack apps' empty/dead states).

## Verification

Unit test both gates; then a real staging launch (`RELAY_STAGING=true`) seeds with Agency Pro installed and asserts the ledger app shows non-zero KPIs. On a customer-parity build (no `RELAY_STAGING`), assert the seed control is absent/disabled rather than throwing a network error.

## Resolution (2026-07-04, S38)

**BUG-5 — DONE.** Three coordinated changes:
- `src/app/api/data/seed/route.ts` + `src/app/api/data/clear/route.ts`: the gate now returns an explanatory `{success:false,error}` body with **403** (not a bare `null` 404), so the reason is surfaceable.
- `src/components/settings/data-management-section.tsx`: `readResult()` reads the body defensively (no null-deref), and `failureMessage()` surfaces the route's `error` verbatim (falls back to `HTTP <status>`). A genuine `fetch` throw still shows "Network error" — the disguised-gate path no longer does. New `allowed` prop hides the controls entirely with an explanatory line when data ops are disallowed.
- `src/app/settings/page.tsx` (server component): calls `isDataOpsAllowed()` and passes `allowed`.
- Unit-covered: `src/components/settings/__tests__/data-management-section.test.tsx` (hidden-when-disallowed, gated-403-surfaces-reason, real-network-error-still-network-error).

**BUG-6 — DEFERRED to the app-shell cluster (not a clean source fix).** Making seed "pack-aware" needs the SAME primitive→pack source-of-truth that FEAT-7/8 flag as blocked (primitives carry no `packId` today, only the `relay-agency--` id-prefix). The spec itself says prefer "seed whatever packs are installed" over a hardcoded Agency-Pro path — that decision belongs with `fix-app-shell-activation-redesign.md`, and the fix is best written with the running Pro ledger in front of us to see exactly what rows its cockpit reads. Carrying BUG-6 into the app-shell live-repro session.
