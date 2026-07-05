# Operator Requirements — Living Tracker

_Origin: **2026-07-04 operator harness session** (Mode B walkthrough, `npx orionfold-relay@0.25.1`).
Source of truth for the raw requirements: `output/staging/2026-07-04-operator-walkthrough/FINDINGS-live.md`
(logged live) + `EVALUATION.md` (verified + groomed dispositions). This tracker is the durable roll-up
of every requirement that session produced, tracked to operator satisfaction._

**Purpose.** One living surface for the ~24 findings/asks from the last operator-led walkthrough, kept
current until ALL are Delivered to operator satisfaction. Referenced from `HANDOFF.md`. Retire this file
(demote to git history) only when every row is **Delivered** and the operator has confirmed.

**Status vocabulary.** Operator policy (2026-07-05): **shipped = delivered = done for this dev cycle.**
Cutting a release (or the operator saying "ship it") IS signoff — no separate fresh-install confirm gate.
The operator reviews builds from time to time; a release is the acceptance event.
- **Delivered** — the fix/feature is in a **released** build (on npm), OR the operator said ship it. The
  end state. (No separate fresh-install-confirm gate — release = signoff.)
- **Done (unbuilt-release)** — code landed on `main` but NOT yet in a cut release. Becomes Delivered at
  the next release that includes it.
- **Pending** — not yet built; queued or backlog.
- **Deferred** — intentionally held (pending live re-verify, or gated behind another decision).
- **Dropped** — verify gate found no defect / not reproduced; no work to do.

**Update rule.** Edit a row's status IN PLACE as work lands. Never delete a row — move it to Delivered
when its fix ships in a release. Note the release version + commit/issue. Keep the roll-up counts current.
Verify status against issue state + git log, NOT spec self-claims (memory
`verify-walkthrough-findings-before-grooming`).

_Last updated: 2026-07-05 · applied "shipped = delivered" (0.25.0–0.29.0 work → Delivered), then fixed +
RELEASED the last open bug #31 in 0.29.1 (`cafc17b4`). **20 Delivered, 0 open bugs.** Only 3 backlog
features (FEAT-6/7/13) + 3 Deferred re-verifies remain._

---

## 1. Bugs (filed as GitHub issues #31–#37)

| ID | Requirement | Status | Evidence / Next |
|----|-------------|--------|-----------------|
| BUG-6 (#35) | Seed sample data must cover installed packs (Pro ledger stays empty) | **Delivered** | #35 CLOSED `shipped`; S41 `reseedInstalledPacks` (memory `seed-clears-pack-tables-and-addrows-fires-triggers`). |
| BUG-3 (#31) | Blueprint cards render DEAD on `/apps/relay-agency` (no working action) | **Delivered** | RELEASED 0.29.1 (`cafc17b4`): cache half already shipped (`install.ts` revalidateTag) + silent-husk half closed (`BlueprintCard.resolved` + honest "couldn't load" card, no fake Run). #31 closed `shipped`. Dev-smoke-verified. |
| BUG-4 (#32) | "Run now" drafts but doesn't execute; toast lies "Run started" | **Delivered** | RELEASED 0.27.0 (relabel path: toast now "Draft created" + deep-link). #32 closed `shipped`. |
| BUG-2 (#33) | Header "Running" chip is a hardcoded literal; pulses on idle app | **Delivered** | RELEASED 0.27.0 (data-driven status; "Ready" when idle). #33 closed `shipped`. |
| BUG-5 (#34) | Seed 404 surfaces as scary "network error"; button shown on customer build | **Delivered** | RELEASED 0.27.0 (explanatory message + controls hidden when disallowed). #34 closed `shipped`. |
| BUG-1 (#36) | `fatal: not a git repository` leaks on first-run console | **Delivered** | RELEASED 0.27.0 (two more leak spots silenced). #36 closed `shipped`. |
| FEAT-4 (#37) | App-detail header toolbar wraps + "Delete app" buried in `⋯` | **Delivered** | RELEASED 0.25.0 (direct Delete) + 0.27.0 (single-row toolbar). #37 closed `shipped`. |

## 2. Top-chrome cluster (FEAT-9/10/11/11b/12 → S47 · FEAT-14/15/16 → S48 spec)

| ID | Requirement | Status | Evidence / Next |
|----|-------------|--------|-----------------|
| FEAT-9 | Telemetry rail infographic redesign (bigger type/icons) | **Delivered** | RELEASED 0.29.0 (S47 rail re-type `eae30aac`, bundled into the ship). |
| FEAT-10 | Show active model + version next to Runtime | **Delivered** | RELEASED 0.29.0 (S47 RUNTIME cell, model leads). |
| FEAT-11 | Show Relay version in top menu | **Delivered** | RELEASED 0.29.0 (S47 bar cluster + `useInstanceIdentity()`). |
| FEAT-11b | "Licensed to \<name\>" / "Community Edition" tag | **Delivered** | RELEASED 0.29.0 (S47 license tag in bar). |
| FEAT-12 | Caption the top-bar green dot (≠ telemetry "live" dot) | **Delivered** | RELEASED 0.29.0 (S47 labeled auth dot). |
| FEAT-15 | Subtle blueprint-grid background shown through translucent containers | **Delivered** | RELEASED 0.29.0 (S48): full-bleed two-tier teal grid on the work area, tuned quiet both themes. |
| FEAT-16 | Sticky top = 4 sub-sections with distinct background colors | **Delivered** | RELEASED 0.29.0 (S48): instrument-palette surface split + settings-glance as the 4th sticky sub-section. |
| FEAT-14 | Expand/collapse settings-state panel below telemetry (5 zones) | **Delivered** | RELEASED 0.29.0 (S48): `GET /api/settings/glance` + `useSettingsGlance()` + `GlanceRail` (collapse→cell summary, expand→grouped zones). |

**Delivered by:** the APPROVED spec `docs/superpowers/specs/2026-07-05-chrome-instrument-palette.md`
(WS1 rollback · WS2 translucent rail · WS3 instrument palette · WS4 FEAT-14) shipped in **0.29.0**
(`v0.29.0`→`9b9ea0f2`), delivering FEAT-14/15/16 plus the operator's 5 S48 directives. Release = signoff.

## 3. App-shell activation cluster (backlog spec `features/fix-app-shell-activation-redesign.md`)

| ID | Requirement | Status | Evidence / Next |
|----|-------------|--------|-----------------|
| FEAT-5 | Blueprints → top-level Compose submenu | **Delivered** | 0.28.0 (S43) shipped `/blueprints` top-level. |
| CF-FEAT-5/6/7/8 | App-shell activation copy (explainers, 1-2-3 steps, verb clarity, signposting) | **Delivered** | RELEASED 0.29.0 (S44 activation-copy pass `b4616d2c`, bundled into the ship). |
| FEAT-8 | Pack-provenance pill on every primitive card | **Delivered** | RELEASED 0.27.0 (S40 `PackPill` on all 4 primitive views `f29f0098`); operator's "distinct color per view" refinement → backlog. |
| FEAT-6 | Card shows TWO buttons: Run + Create Workflow | **Pending** | Depends on one-click-run (BUG-4). Backlog. |
| FEAT-7 | "Filter by installed pack" on all 4 primitive views | **Pending** | Blueprints-only filter shipped (S40 #27); all-views version needs ONE primitive→pack source-of-truth. Backlog. |

## 4. Other operator asks

| ID | Requirement | Status | Evidence / Next |
|----|-------------|--------|-----------------|
| TASK-1 | Brainstorm Profiles → "Agents" rename | **Delivered** | S43/S45 executed the rename (`profile.yaml`→`agent.yaml`, routes, copy). |
| FEAT-13 | Profile Templates → Compose submenu | **Pending** | Caveat: no Profile Templates surface exists yet (Tables has one, Profiles doesn't); likely needs creating first. Scope UNCONFIRMED with operator. |
| CF-BUG-3 | Workflow HITL (agents ask user mid-workflow) | **Deferred** | Pending live re-verify; handoff claims shipped `4c0bae6c`. Fold into app-shell acceptance criteria. |
| CF-FEAT-2 | Free "Agency" vs paid "Agency Pro" relationship on Packs | **Deferred** | Pending live re-verify; not re-checked this run. |
| CF-FEAT-8 | Post-Execute signpost to Monitor/Inbox | **Deferred** | Pending live re-verify; `computeSignpost` claimed shipped. |
| CF-FEAT-1 | License date renders 1 day early | **Dropped** | Verify gate overturned: real license `01:10:21Z` renders correctly. Re-verify live only if operator sees it. |
| Manifest chevron (CF-FEAT-4) | Chevron direction vs slide-sheet | **Dropped** | `ChevronRight` matches right sheet; consistent affordance. |

---

## Roll-up (keep current on every update)

| Status | Count | Items |
|--------|:---:|-------|
| **Delivered** | 20 | BUG-6 (#35), FEAT-5, TASK-1, FEAT-9/10/11/11b/12, FEAT-14/15/16, CF-FEAT-5/6/7/8, FEAT-8, BUG-1/2/3/4/5 (#36/33/31/32/34), FEAT-4 (#37) |
| **Pending** | 3 | FEAT-6, FEAT-7, FEAT-13 |
| **Deferred** | 3 | CF-BUG-3, CF-FEAT-2, CF-FEAT-8 |
| **Dropped** | 2 | CF-FEAT-1, Manifest chevron |

**Path to full delivery (operator satisfaction):**
1. ✅ **Released** — S44 activation copy, S45 Profile→Agent, S47 top-chrome, S48 chrome spec all shipped
   in 0.27.0/0.28.0/0.29.0. Under the operator policy "shipped = delivered", all 16 are now **Delivered**.
2. ✅ **S48 chrome spec implemented + released 0.29.0** → FEAT-14/15/16 Delivered.
3. ✅ **#31 RELEASED in 0.29.1** (`cafc17b4`) — honest "couldn't load" card replaces the silent husk.
   **All operator-filed bugs are now Delivered; zero open bugs remain.**
4. **Groom the remaining feature backlog** (FEAT-6/7/13) + confirm the 3 Deferred via a live re-verify run.
5. **Operator confirms** each cluster on a fresh `npx` walkthrough → mark Delivered.
