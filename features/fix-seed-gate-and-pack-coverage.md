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

## Resolution (2026-07-04, S41) — BUG-6 DONE

Shipped on `main` (`9e6cab00`), unreleased. Two coordinated fixes, both reusing existing machinery (no new subsystems):

1. **Pack seed file.** `src/lib/packs/templates/relay-agency-pro/base/seed/tables/engagements.json` — 26 current-month signed rows (+billing / −cost) across the free-pack client names, landing **$13,950 billed / $7,120 costs / 49% margin** so the cockpit's MTD KPIs (`tableSumWindowed` on `engagements.amount`, `kpi-context.ts:86`) read believable non-zero the moment the pack installs. The install path already supported `seed/tables/<id>.json` (`install.ts:243`, `readTableSeed`); the file just didn't exist. **Only the ledger is seeded** — `intake`/`grants` carry row-insert triggers (`manifest.yaml`), and seeding them would dispatch their pipeline blueprints on install/seed (`tables.ts:405-410` always fires triggers for inserted rows). Documented in the manifest `tables:` comment so a future maintainer doesn't add them.

2. **Pack-aware global seed.** New `src/lib/data/seed-data/installed-packs.ts` → `reseedInstalledPacks()`, wired as `seed.ts` step 25 (after the generic generators). `clearAllData()` wipes ALL user tables including the pack's (`clear.ts:126` — defs + columns + rows, not just rows), so the button needs to rebuild them. It enumerates installed packs via `listApps()` and re-applies each via the **idempotent `installPack()`** path — the one function that rebuilds pack tables from the bundled manifest AND re-seeds them, so seed/install never drift. Best-effort per pack (one failing pack — e.g. an unlicensed premium pack — is reported in `packReseedErrors`, not swallowed; principle #1). Runtime-registry-adjacent → dynamically imported inside the function body (no static graph entry; smoke-verified).

**Design decision (all-installed-packs, not hardcoded Agency-Pro):** matches the spec's "seed whatever packs are installed" and doesn't rot when a second paid pack ships. The primitive→pack `packOf()` resolver (S40) turned out NOT to be needed — `installPack()` already keys tables by `projectId = pack.meta.id`, so re-install rematerializes them without any packId field.

**Pack bump 0.3.0 → 0.4.0** + customer-voice changelog line (`pack.yaml`); the npx prod smoke's installed-version literal + comment updated to match (memory `prod-smoke-encodes-contracts` — it runs only at release and would fail on the stale `v0.3.0`).

**Verify:** 542 pass / 1 skip across data + packs + apps + api suites. New `installed-packs.test.ts` covers repopulate-after-wipe, idempotency (no dup rows), and visible per-pack failure reporting. **Live smoke** (isolated data dir, `RELAY_STAGING=true`, real Next.js requests): install → `rowsSeeded:26`; `POST /api/data/seed` → `packsReseeded:1, packTablesSeeded:3, packRowsSeeded:26, packReseedErrors:[]` with no module-load cycle; `GET /apps/relay-agency-pro` (200) renders **`$13,950`** beside the "Billed" KPI. The "No transactions yet" empty state is cleared end-to-end.
