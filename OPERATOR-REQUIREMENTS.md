# Operator Requirements — Living Tracker

_Origin: **2026-07-04 operator harness session** (Mode B walkthrough, `npx orionfold-relay@0.25.1`).
Source of truth for the raw requirements: `output/staging/2026-07-04-operator-walkthrough/FINDINGS-live.md`
(logged live) + `EVALUATION.md` (verified + groomed dispositions). This tracker is the durable roll-up
of every requirement that session produced, tracked to operator satisfaction._

**Purpose.** One living surface for the ~24 findings/asks from the last operator-led walkthrough, kept
current until ALL are Delivered to operator satisfaction. Referenced from `HANDOFF.md`. Retire this file
(demote to git history) only when every row is **Delivered** and the operator has confirmed.

**Status vocabulary.**
- **Delivered** — shipped AND confirmed satisfactory by the operator (or objectively closed, e.g. issue
  closed `shipped`). The end state.
- **Done (unconfirmed)** — code landed on `main` but UNRELEASED and/or not yet operator-confirmed on a
  fresh install. Needs operator sign-off before it becomes Delivered.
- **Pending** — not yet built; queued or backlog.
- **Deferred** — intentionally held (pending live re-verify, or gated behind another decision).
- **Dropped** — verify gate found no defect / not reproduced; no work to do.

**Update rule.** Edit a row's status IN PLACE as work lands. Never delete a row — move it to Delivered.
When a row flips to Delivered, note the commit/issue + the confirmation. Keep the roll-up counts current.
Verify status against issue state + git log, NOT spec self-claims (memory
`verify-walkthrough-findings-before-grooming`).

_Last updated: 2026-07-04 · verified against HEAD `dc60c154` + GitHub issues #31–#37._

---

## 1. Bugs (filed as GitHub issues #31–#37)

| ID | Requirement | Status | Evidence / Next |
|----|-------------|--------|-----------------|
| BUG-6 (#35) | Seed sample data must cover installed packs (Pro ledger stays empty) | **Delivered** | #35 CLOSED `shipped`; S41 `reseedInstalledPacks` (memory `seed-clears-pack-tables-and-addrows-fires-triggers`). |
| BUG-3 (#31) | Blueprint cards render DEAD on `/apps/relay-agency` (no working action) | **Pending** | #31 OPEN. Root cause = `unstable_cache` snapshot not invalidated on pack install (`data.ts:882`); runtime-registry-adjacent → smoke budget. |
| BUG-4 (#32) | "Run now" drafts but doesn't execute; toast lies "Run started" | **Pending** | #32 OPEN. Relabel OR wire instantiate→dispatch. |
| BUG-2 (#33) | Header "Running" chip is a hardcoded literal; pulses on idle app | **Pending** | #33 OPEN (bug,polish). All 7 kit builders hardcode `status:"running"`; make data-driven. |
| BUG-5 (#34) | Seed 404 surfaces as scary "network error"; button shown on customer build | **Pending** | #34 OPEN. Hide/disable seed when `!isDataOpsAllowed`; stop `catch{}`-collapsing 404. |
| BUG-1 (#36) | `fatal: not a git repository` leaks on first-run console | **Pending** | #36 OPEN (bug,polish). Likely stale `.next` artifact; + defense-in-depth harden `git-manager.ts:18`/`search.ts:36`. |
| FEAT-4 (#37) | App-detail header toolbar wraps + "Delete app" buried in `⋯` | **Pending** | #37 OPEN (polish). = reopened CF-FEAT-3; browser retest per candidate. |

## 2. Top-chrome cluster (FEAT-9/10/11/11b/12 → S47 · FEAT-14/15/16 → S48 spec)

| ID | Requirement | Status | Evidence / Next |
|----|-------------|--------|-----------------|
| FEAT-9 | Telemetry rail infographic redesign (bigger type/icons) | **Done (unconfirmed)** | S47 rail re-type (`eae30aac`); UNRELEASED on main; needs operator fresh-install confirm. |
| FEAT-10 | Show active model + version next to Runtime | **Done (unconfirmed)** | S47 RUNTIME cell (model leads); UNRELEASED. |
| FEAT-11 | Show Relay version in top menu | **Done (unconfirmed)** | S47 bar cluster + `useInstanceIdentity()`; UNRELEASED. |
| FEAT-11b | "Licensed to \<name\>" / "Community Edition" tag | **Done (unconfirmed)** | S47 license tag in bar; UNRELEASED. |
| FEAT-12 | Caption the top-bar green dot (≠ telemetry "live" dot) | **Done (unconfirmed)** | S47 labeled auth dot; UNRELEASED. |
| FEAT-15 | Subtle blueprint-grid background shown through translucent containers | **Pending** | S47 shipped grid behind OPAQUE chrome; translucent-through = S48 spec WS2/WS3, unimplemented. |
| FEAT-16 | Sticky top = 4 sub-sections with distinct background colors | **Pending** | S47 did 3-tier surface split; 4th (settings) + multi-shade palette = S48 WS3/WS4. |
| FEAT-14 | Expand/collapse settings-state panel below telemetry (5 zones) | **Pending** | Deferred at S47; = S48 spec WS4. No `/api/settings/glance` route/hook yet. |

**Queued work:** the APPROVED spec `docs/superpowers/specs/2026-07-05-chrome-instrument-palette.md`
(WS1 rollback · WS2 translucent rail · WS3 instrument palette · WS4 FEAT-14) delivers FEAT-14/15/16 plus
the operator's 5 S48 directives in one pass. Implementing it flips FEAT-14/15/16 toward Delivered.

## 3. App-shell activation cluster (backlog spec `features/fix-app-shell-activation-redesign.md`)

| ID | Requirement | Status | Evidence / Next |
|----|-------------|--------|-----------------|
| FEAT-5 | Blueprints → top-level Compose submenu | **Delivered** | 0.28.0 (S43) shipped `/blueprints` top-level. |
| CF-FEAT-5/6/7/8 | App-shell activation copy (explainers, 1-2-3 steps, verb clarity, signposting) | **Done (unconfirmed)** | S44 activation-copy pass (`b4616d2c`); UNRELEASED; needs fresh-install confirm. |
| FEAT-8 | Pack-provenance pill on every primitive card | **Done (unconfirmed)** | S40 `PackPill` on all 4 primitive views (`f29f0098`); operator's "distinct color per view" refinement → backlog. |
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
| **Delivered** | 3 | BUG-6 (#35), FEAT-5, TASK-1 |
| **Done (unconfirmed)** | 8 | FEAT-9/10/11/11b/12, CF-FEAT-5/6/7/8, FEAT-8 |
| **Pending** | 10 | BUG-1/2/3/4/5 (#36/33/31/32/34), FEAT-4 (#37), FEAT-6/7, FEAT-13, FEAT-14/15/16 |
| **Deferred** | 3 | CF-BUG-3, CF-FEAT-2, CF-FEAT-8 |
| **Dropped** | 2 | CF-FEAT-1, Manifest chevron |

**Path to full delivery (operator satisfaction):**
1. **Release the 3 unreleased passes** (S44 activation copy, S47 top-chrome, S45 Profile→Agent) → flips
   the 8 "Done (unconfirmed)" toward Delivered once the operator confirms on a fresh install. Release is
   currently DEFERRED behind the S48 chrome redesign settling (HANDOFF).
2. **Implement the S48 chrome spec** → FEAT-14/15/16 Pending → Done.
3. **Fix the open bugs** #31/#32/#33/#34/#36/#37 (2 HIGH: #31/#32) → app-shell activation redesign.
4. **Groom the remaining feature backlog** (FEAT-6/7/13) + confirm the 3 Deferred via a live re-verify run.
5. **Operator confirms** each cluster on a fresh `npx` walkthrough → mark Delivered.
