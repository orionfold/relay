---
title: Top-Chrome Visual-System Redesign
date: 2026-07-04
status: IMPLEMENTED 2026-07-04 (L1 db637c13 · L2 1f3da83c · L3 eae30aac) — dev-smoke verified both themes
scope_mode: HOLD (max rigor on the 8 named FEAT items; Error & Rescue Registry required)
approach: C — rail re-typography (freeze lifted for typography only)
blast_radius: medium — ~9 files across shell components, one API route, globals.css, and an
  edit-only amendment to a strategy-repo freeze doc. No DB, no shared chart-data.ts, no new
  telemetry trend series, no new rail cells.
references:
  - _IDEAS/backlog.md (the FEAT-9/10/11/11b/12/14/15/16 initiative line)
  - _SPECS/feature-cut-freeze.md Target 4 (the rail FREEZE this design amends — edit-only)
  - src/components/shell/app-shell.tsx · app-bar.tsx · telemetry-rail.tsx · rail-cell.tsx
  - src/app/api/instance/config (the endpoint the identity read extends)
  - src/app/api/license/route.ts · src/lib/licensing/store.ts (getLicensedIdentity precedence)
  - next.config.mjs (compiler.defineServer __RELAY_CORE_VERSION__ gotcha)
  - src/app/globals.css (surface tokens, spacing/z conventions)
---

# Top-Chrome Visual-System Redesign

One design that decides tokens, z-layers, and offsets **once** for the top chrome, resolving the
eight deferred FEAT items (9/10/11/11b/12/14/15/16) as a coherent system rather than eight
piecemeal bolt-ons. No acute defect drove this — it is a polish-and-unify initiative — but the
work does incidentally **fix one latent sticky-offset bug** (the rail slides under the header on
scroll) because the re-typography forces us to touch the offset anyway.

## Goal & non-goals

**Goal.** The top chrome reads as a deliberate three-tier depth stack — navigation bar → sub-nav →
instrument rail — with a clean **rail-vs-bar semantic split**: the *bar* carries static instance
identity (version, license, connectivity), the *rail* carries live operations (the 10 telemetry
cells). A single consolidated instance-config read feeds the bar's new identity cluster. A subtle
blueprint-grid texture sits behind the content canvas only; the chrome stays opaque.

**Non-goals.** See the "NOT in scope" section — but headline: no new rail cells, no new telemetry
trend series, no translucent chrome, no attempt to out-build Arena's machine monitor. The rail
FREEZE's *anti-expansion intent* is preserved; only its *typography lock* is lifted.

---

## What already exists (reuse — do not rebuild)

| Thing | Location | Reuse for |
|-------|----------|-----------|
| App-shell composition (bar → rail → main) | `src/components/shell/app-shell.tsx` | Container; grid goes behind its `<main>` |
| Two-tier app bar + right utility cluster | `src/components/shell/app-bar.tsx:97-204` | Identity cluster lands in the right cluster (`:149-177`) |
| `RailCell` primitive + `formatMicros` | `src/components/shell/rail-cell.tsx` | Re-typography edits the render, keeps the API |
| Telemetry rail (10 cells + status foot) | `src/components/shell/telemetry-rail.tsx` | Model into RUNTIME cell; foot dot into shared legend |
| `TelemetrySnapshot` type | `src/components/shell/telemetry-types.ts` | **Unchanged** — model does NOT ride this |
| `/api/instance/config` endpoint | consumed at `src/components/instance/instance-section.tsx:58` | Extend with `{ version, activeModel, licenseTag }` |
| `relayCoreVersion()` / `__RELAY_CORE_VERSION__` | `src/lib/packs/install.ts` + `next.config.mjs:23-42` | Server-side version source (client-safe via the endpoint) |
| `getLicensedIdentity()` (org→name→email, fails open) | `src/lib/licensing/store.ts:297` | licenseTag precedence + community fallback |
| `/api/license` GET → `StoredLicenseInfo[]` | `src/app/api/license/route.ts` | (alt source; consolidated endpoint preferred) |
| `pickActiveRuntime()` / provider+sdk resolution | `src/app/api/telemetry/route.ts:104-116, 48-75` | activeModel + provider + sdk for the RUNTIME cell |
| `AuthStatusDot` (polls `/api/settings`, 30s) | `src/components/settings/auth-status-dot.tsx` | Gains a text label; joins the shared dot legend |
| Surface tokens `--surface-1/2/3` (opaque, oklch, theme-aware) | `globals.css:101-104, 206-209` | Descending-elevation depth assignment |
| Spacing (`--space-*`, 8pt) + radius scales | `globals.css:66-76, 165-175` | Rhythm for re-typography; no new scale needed |

---

## Architecture — three layers, built in dependency order

```
┌─ Layer 1: DATA CHANNEL (unblocks FEAT-10/11/11b) ─────────────┐
│  Extend /api/instance/config → { version, activeModel,        │
│  licenseTag }.  One client hook: useInstanceIdentity().       │
└───────────────────────────────────────────────────────────────┘
              │ feeds
              ▼
┌─ Layer 2: BAR IDENTITY CLUSTER (FEAT-11/11b/12) ──────────────┐
│  app-bar right cluster gains: version pill · license tag ·    │
│  LABELED auth status.  Rail RUNTIME cell gains active model.  │
└───────────────────────────────────────────────────────────────┘
┌─ Layer 3: VISUAL SYSTEM (FEAT-9/15/16 + dot legend) ──────────┐
│  • Surface depth: Tier1 s-1 / Tier2 s-2 / rail s-3            │
│  • Rail re-typography: all 10 cells, value→base, sub demoted  │
│  • Shared status-dot legend (auth vs live disambiguated)     │
│  • Subtle blueprint grid behind <main> (z-0), chrome opaque   │
└───────────────────────────────────────────────────────────────┘
```

Each layer is independently understandable and testable. Layer 1 is data-only (no UI). Layer 2
consumes Layer 1's hook and touches only the bar's identity region. Layer 3 changes *appearance*,
not *data*, and could ship without 1/2 if sequencing demanded it.

### FEAT-item → layer map

| FEAT | Item | Layer | Resolution |
|------|------|-------|-----------|
| 9 | Telemetry infographic + bigger type | 3 | All-10-cell re-typography: value `sm`→`base`, sub demoted/muted |
| 10 | Active model + version in the rail | 1+3 | `activeModel` via instance-config hook → RUNTIME cell value |
| 11 | App version in top menu | 1+2 | `version` via instance-config → bar version pill (null if `0.0.0`) |
| 11b | "Licensed to" / "Community Edition" tag | 1+2 | `licenseTag` union via instance-config → bar license tag |
| 12 | Caption AuthStatusDot distinct from live dot | 3 | Both dots labeled; shared color grammar; distinct meanings |
| 14 | Settings-at-a-glance panel | — | **DEFERRED** — see NOT-in-scope |
| 15 | Blueprint-grid background | 3 | `<main>::before` faint grid at `--z-canvas-grid:0`; chrome stays opaque |
| 16 | 4 sticky sub-sections, distinct surfaces | 3 | Descending elevation s-1/s-2/s-3 + `--chrome-header` offset fix + z-scale |

---

## Layer 1 — data flow & interface

```
package.json "version" ──build──▶ __RELAY_CORE_VERSION__   (compiler.defineServer,
   (0.28.0)                          RAW string, NOT JSON.stringify — double-quote
       │                             → fails semver.valid() → silent "0.0.0")
       │  server-only global (NOT in client bundle)
       ▼
 relayCoreVersion()  ─┐
 pickActiveRuntime()  ─┼─▶  GET /api/instance/config  ─json─▶  useInstanceIdentity()  ─▶  bar cluster
 getLicensedIdentity()─┘     { version, activeModel,           (client hook, 60s poll)     + rail RUNTIME
                             licenseTag }
```

**Hook contract (`src/components/shell/use-instance-identity.ts`, new):**

```ts
type InstanceIdentity = {
  version: string | null;        // "0.28.0"; null if the server global fell back to 0.0.0
  activeModel: string | null;    // "claude-opus-4-8"; null when no runtime configured
  licenseTag:
    | { kind: "licensed"; label: string }   // org → name → email precedence
    | { kind: "community" };                 // fails OPEN to community
  status: "loading" | "ready" | "error";
};
```

**Two contract-level shadow-path rules (Engineering Principle #3 — data flows have shadow paths):**

1. **`version` is `null`, never `"0.0.0"`.** The route detects the `defineServer` fallback and
   returns `null`; the bar renders *nothing* rather than a wrong version. Absent > wrong.
2. **`licenseTag` is a discriminated union, never a nullable string.** A missing name cannot render
   as `"Licensed to "`. `getLicensedIdentity()` already fails open to community; the union makes
   that explicit at the type level.

`activeModel` rides **this** endpoint (not the telemetry snapshot) so all three identity fields
share one poll and one loading state. Placing the model *in the rail* is a **render** choice; the
**fetch** is unified here. This is the move that keeps the frozen `TelemetrySnapshot` shape
untouched while still surfacing the model in the rail.

**Version-injection guardrail (the Next 16 gotcha).** `__RELAY_CORE_VERSION__` MUST be injected via
`compiler.defineServer` (server-only, out of client bundles) with the **RAW** version string — NOT
`JSON.stringify(...)`. Next's `compiler.define` quotes literals itself; double-quoting yields
`""0.28.0""`, fails `semver.valid()`, and silently falls back to `0.0.0`. A build-time test asserts
the resolved global is valid semver.

---

## Layer 2 — bar identity cluster

The app-bar right utility cluster (`app-bar.tsx:149-177`, currently: Settings gear · ⌘K · Theme ·
AuthStatusDot) gains three identity signals from `useInstanceIdentity()`, ordered static→live:

```
 … [⚙ Settings] [⌘K] [☀ Theme]  │  v0.28.0 · Acme Corp  ● Connected
                                   └── new identity group ──┘
    (version pill; hidden if null)  (license tag; "Community Edition" if community)
                                                            (labeled auth dot)
```

- **Version pill** — `v{version}`, muted, mono; **omitted entirely** when `version` is `null`.
- **License tag** — `{label}` when `licensed`, `Community Edition` when `community`. Never a
  dangling `"Licensed to "`.
- **Labeled auth dot** — the existing `AuthStatusDot` gains a text label ("Connected" /
  "Disconnected"). This is the FEAT-12 fix on the bar side.

---

## Layer 3a — rail re-typography (all 10 cells)

Freeze amendment permits **presentation-only** change: type scale + value/sub hierarchy may change;
**cell count (10), `RailCell` API surface, and `TelemetrySnapshot` shape stay locked.**

```
   CURRENT CELL                          PROPOSED CELL (Approach C)
 ┌────────────────────┐               ┌────────────────────────┐
 │ ⌘ HOST      0.58rem │  label        │ ⌘ HOST         0.6rem  │  label (idiom unchanged)
 │ relay-app    sm     │  value        │ relay-app    text-base │  VALUE: sm → base (bigger)
 │ cpu 4% · mem  0.65  │  sub          │ cpu 4% · mem  muted    │  sub demoted (muted+tracked)
 └────────────────────┘               └────────────────────────┘
```

- **Value** `text-sm` → `text-base` — the most-scanned figure now leads (FEAT-9 "bigger type").
- **Label** `0.58rem` → `0.6rem` — keeps the mono-uppercase micro-caption idiom.
- **Sub-line** gains `text-muted-foreground` + looser tracking so it clearly recedes.
- **Rail band** `78px` → **`88px`** to fit `text-base` values (the one measurable ripple → offset
  fix). If `88px` crowds at the smallest label size in QA, the implementer may adjust within
  `84–92px`, but must pick one concrete value and keep the `--chrome-header` offset math consistent.

**Model in the RUNTIME cell** (within the frozen 10-cell count):

```
 CURRENT RUNTIME cell          PROPOSED RUNTIME cell
 ┌──────────────────┐         ┌──────────────────────┐
 │ ⚙ RUNTIME        │         │ ⚙ RUNTIME            │
 │ anthropic-direct │ value   │ opus-4.8      ← model as value (text-base)
 │ sdk 0.60.0       │ sub     │ anthropic · sdk 0.60 │ ← provider + sdk fold into sub
 └──────────────────┘         └──────────────────────┘
```

Model reads from `useInstanceIdentity().activeModel`; falls back to `runtimeLabel` when `null`, so
a mis-configured runtime shows *something*, never blank.

## Layer 3b — surface depth, sticky geometry, z-scale

**The latent bug this fixes.** The rail's `top-16` (64px) doesn't match the header's real height
(`h-14` + `h-11` = 100px), so on scroll the rail tucks 36px *under* the header. The `78→88px` height
change forces a proper fix via a header-height token, not a magic number:

```
 CURRENT (broken)                          PROPOSED (fixed + depth)
 header sticky top-0  h-14+h-11 = 100px    header sticky top-0   z-40  (s-1 / s-2 tiers)
   tier-1  h-14 (56px)  --surface-1          tier-1  h-14   --surface-1  (frontmost)
   tier-2  h-11 (44px)  --surface-1          tier-2  h-11   --surface-2  (steps back)
 rail sticky top-16 (64px!) z-20  h-78       rail  sticky top:var(--chrome-header)  z-30  s-3
   ▲ 64px ≠ 100px → rail slides UNDER          ▲ offset tracks real header height
     the header by 36px on scroll                grid z-0 behind <main>; opaque chrome above
```

```css
:root {
  --chrome-tier1: 3.5rem;                 /* h-14 */
  --chrome-tier2: 2.75rem;                /* h-11 */
  --chrome-header: calc(var(--chrome-tier1) + var(--chrome-tier2));  /* 100px — rail top offset */
  /* named z-scale (none existed before — was scattered z-20/z-30/100/9999) */
  --z-canvas-grid: 0;  --z-rail: 30;  --z-header: 40;  --z-overlay: 100;  --z-toast: 9999;
}
```

Header (`--z-header:40`) always wins over rail (`--z-rail:30`) → the rail can never paint over the
bar. Grid (`--z-canvas-grid:0`) sits below all chrome.

**Surface depth (descending elevation, FEAT-16).** Tier-1 `--surface-1`, Tier-2 `--surface-2`, rail
`--surface-3`. Verified both themes:

```
 light:  s-1 oklch(1.0)  → s-2 oklch(0.975) → s-3 oklch(0.96)   (lightens-to-recede downward)
 dark:   s-1 oklch(0.18) → s-2 oklch(0.16)  → s-3 oklch(0.14)   (darkens-to-recede downward)
```

Both read as the chrome receding into an instrument panel as the eye moves down the stack.

**Blueprint grid (FEAT-15, contained).** A single `<main>::before` at `--z-canvas-grid:0`: a faint
`repeating-linear-gradient` grid at low opacity, theme-aware. Chrome surfaces stay **opaque**
`--surface-*` (honors the documented "opaque surfaces, border-centric elevation" principle), so the
grid never shows through the bar or rail — it is a canvas-only background texture, not a
see-through effect. Zero interaction with the sticky z-stack.

The "4 sticky sub-sections" of FEAT-16 = Tier-1 bar · Tier-2 bar · telemetry rail · rail status
foot. After this design they occupy `--surface-1 / --surface-2 / --surface-3 / (within rail)`
respectively — no longer a single flat `--surface-1` slab.

## Layer 3c — shared status-dot legend (FEAT-12)

Two dots keep distinct *meanings* but share one visual grammar so they read as a legend:

```
  BAR (identity):   ● Connected     green/red/grey = API-key connectivity (polls /api/settings)
  RAIL FOOT (data): ● live          cyan/red       = telemetry poll freshness (useTelemetry)
                    ▲ both labeled, distinct colors, label-adjacent → no accidental collision
```

Grammar: green = connected, cyan = live-data, red = fault. The auth dot gains its **"Connected"
text label** — the specific FEAT-12 fix (it is a bare unlabeled dot today).

---

## Error & Rescue Registry (HOLD mode — mandatory)

| Error | Trigger | Impact | Rescue |
|-------|---------|--------|--------|
| Version reads `0.0.0` | `defineServer` gets a `JSON.stringify`'d value → fails `semver.valid()` | Bar shows wrong version | Route detects `0.0.0` → returns `version:null` → **pill hidden**. Build-time test asserts the global is valid semver. |
| `/api/instance/config` fails | Server error / cold start | No identity in bar | Hook `status:"error"` → cluster renders **nothing** (no skeleton flash); auth dot falls back to its own `/api/settings` poll (independent). Dev-console warn fires — zero silent failure. |
| `activeModel` is `null` | No runtime configured | RUNTIME cell value blank | Falls back to `runtimeLabel` ("not configured"); never empty. |
| License name missing | `issuedTo` has email only / none | `"Licensed to "` orphan | Discriminated union + `getLicensedIdentity()` precedence org→name→email→**community**; UI cannot render a dangling label. |
| Rail slides under header | header height ≠ rail `top` offset | 36px overlap on scroll | `--chrome-header` calc token drives both; a layout test asserts `rail.top === header.height`. |
| Grid bleeds over chrome | z-index collision | Texture on the bar | Grid pinned `--z-canvas-grid:0` on `<main>::before`; chrome ≥ `--z-rail:30`. Opaque `--surface-*` backgrounds double-guard. |
| Dark-theme depth inverts | descending elevation misread in dark | Chrome looks flat/wrong | Token values verified both themes (0.18→0.14 dark, 1.0→0.96 light); visual smoke in both themes. |
| Re-typography breaks freeze | Change drifts into new cells / metrics | Violates operator ruling | Amendment scopes the lift to **presentation only**; cell count (10) + `TelemetrySnapshot` shape unchanged — asserted by existing `telemetry-rail.test.tsx` cell-count test. |

---

## NOT in scope (deferred, with rationale)

- **FEAT-14 — Settings-at-a-glance panel.** Deferred. It aggregates ~11-14 distinct
  `/api/settings/*` sources into a new panel — a data-aggregation + new-surface project of its own,
  orthogonal to the visual-system unification this spec delivers. Folding it in would double the
  blast radius and mix a *new feature* into a *polish* spec. Revisit as its own spec once the
  identity channel (Layer 1) exists — it can extend the same consolidated-read pattern.
- **Translucent chrome / see-through blueprint grid.** Rejected by design decision: honors the
  documented "opaque surfaces, border-centric elevation" principle and avoids dense-rail-type
  legibility loss over texture. Grid is canvas-background only.
- **New rail cells / new telemetry trend series.** Forbidden by the (still-standing) anti-expansion
  intent of the rail freeze. Only typography is unlocked.
- **Touching `src/lib/queries/chart-data.ts` or `src/components/monitoring/**`.** Regression-fenced
  shared modules (freeze doc "do-not-touch" list); this design reads none of them differently.
- **A full design-token overhaul.** The existing surface/spacing/radius scales suffice; we add only
  a `--chrome-header` offset token and a named `--z-*` scale (formalizing values that already exist
  as scattered magic numbers).

---

## Freeze-doc amendment (edit-only — strategy repo owner commits)

`_SPECS/feature-cut-freeze.md` is a symlink into the strategy repo (`../strategy/relay/_SPECS`) —
**edit-only** per project policy; the strategy-repo owner commits it, never this instance. Target 4
gains an amendment permitting a **presentation-only** rail type/hierarchy re-scale while preserving
the anti-expansion intent (no new cells, no new trend series, no new live-host metrics). The
amendment text is drafted alongside this spec; its commit is the strategy owner's action.

---

## Verification (end-to-end)

Because Layer 1 adds an API route + a client hook consumed by the app shell (a
runtime-registry-adjacent *shell* surface, not the runtime catalog itself), verification runs a
**real `npm run dev` smoke**, not only unit tests:

1. Boot `npm run dev`; load any route → app shell renders.
2. **Bar identity cluster:** version pill shows `v{package.json version}` (NOT `0.0.0`); license tag
   shows the licensed identity or "Community Edition"; auth dot shows a **labeled** state.
3. **Rail:** RUNTIME cell shows the **active model** as its value, provider+sdk in the sub; all 10
   cell values render at the bigger `text-base` size.
4. **Sticky geometry:** scroll the page → the rail does **not** slide under the header (offset fix).
5. **Depth:** the three chrome tiers show distinct surface elevation — verified in **both** light and
   dark themes.
6. **Grid:** the blueprint texture is visible behind `<main>` content but **not** through the bar or
   rail (opaque chrome).
7. **Shadow paths:** with no runtime configured → model falls back to `runtimeLabel`; with the config
   endpoint stubbed to 500 → identity cluster is absent, no crash, dev-warn logged.
8. `npm test` green (esp. `telemetry-rail.test.tsx` cell-count = 10 still passes).

---

## Resolution (implemented 2026-07-04)

Built in dependency order across three bisectable commits, TDD per layer:

- **L1 (`db637c13`)** — new `GET /api/instance/identity` + `useInstanceIdentity()` hook. Both
  shadow-path rules enforced and unit-tested (8 route tests): `version` maps the `0.0.0`/non-semver
  build-fallback to `null`; `licenseTag` is a discriminated union. `activeModel` resolves via
  `resolvePreferredModel(pickActiveRuntime(...).runtimeId)` — `pickActiveRuntime` extracted from the
  telemetry route into `runtime-setup.ts` as a shared helper (4 tests), so one definition of "which
  runtime is live" feeds both the rail and the identity endpoint. `TelemetrySnapshot` untouched.
- **L2 (`1f3da83c`)** — `BarIdentityCluster` in the app-bar right cluster (version pill · license tag ·
  labeled auth dot). `AuthStatusDot` gained an opt-in `showLabel` (default false, all other call
  sites unaffected). 5 shadow-path tests.
- **L3 (`eae30aac`)** — `--chrome-*` offset tokens + named `--z-*` scale in `globals.css`; descending
  surface elevation (s-1/s-2/s-3); `#main-content::before` blueprint grid (theme-aware, opaque chrome
  above); rail re-typography (value→`text-base`, band 78→88px); active model in the RUNTIME cell;
  cyan rail live-dot. 2 FEAT-10 tests added.

**Dev-smoke (all 8 steps passed, both themes).** One notable finding, in our favor: the operator's
Chrome renders at a **14px root font-size**, so `--chrome-header` (`calc(3.5rem + 2.75rem)`) resolved
to **87.5px**, not the 100px the spec assumed — and the rail's sticky `top` tracked it *exactly*,
sitting flush at the header's real bottom. Because the offset is expressed in the **same `rem` unit**
as the header's `h-14`/`h-11` Tailwind heights, the fix is robust across any root font-scale; a
hardcoded `100px` would have left a 12.5px gap here. The spec's literal 100px is correct at a 16px
root but the token is strictly more correct. No code change needed — the `rem`-based token already
does the right thing.

99 tests green across the touched scopes; the 8 suite-wide failures are the pre-existing set (handoff
`router.test.ts` ×6 + heatmap/settings validator ×2), none in the redesign's diff. `RailCell` prop
signature + `TelemetrySnapshot` shape verified unchanged (freeze amendment held). Freeze-doc amendment
already present in `_SPECS/feature-cut-freeze.md` Target 4 — strategy-repo owner commits it.
