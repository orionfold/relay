---
name: staging-browser-smoke
description: >
  Walk a running Relay staging instance through the ICP journeys (J0–J7
  agency-owner + JS1–JS6 solo-founder + JB1–JB3 app-builder) in a live browser
  the operator watches, capturing per-screen PNGs + console + network logs + a
  house-format README into a dated output/staging/<date>/ bundle (Mode B).
  Journeys partition into six session-sized runs (R1–R6) — default to ONE run
  per invocation. Use when the user mentions the browser walkthrough, the ICP
  journeys, a Mode B capture, walking the app as an agency owner / solo founder /
  app builder, screenshotting the first-use flow, capturing the web
  license-activation ceremony, or producing a reviewable UI bundle. Also
  triggers on "staging-browser-smoke", "browser smoke", "walk the journeys",
  "J0-J7", "run R1"–"run R6", "Mode B", or any request to drive the running
  staging instance through the app and capture what a customer sees. This RIDES
  on the `relay-staging` substrate — invoke that skill's `setup` + `launch`
  first (the instance must be up on :3199). Do NOT use for the CLI GIF (use
  staging-cli-run) or for evaluating a captured bundle (use staging-evaluate).
---

# Relay Staging — Browser Smoke (Mode B: J / JS / JB journeys)

Drive a **running** staging instance through a customer's whole first *use* of
the web app — the J0–J7 agency-owner journeys, the JS1–JS6 solo-founder
journeys, and the JB1–JB3 app-builder journeys (`_IDEAS/staging-journeys.md`) —
in a live browser the operator can watch, and capture what a customer sees into
a dated bundle a skill or operator reviews **without re-running**. The bundle it
emits is the exact Mode B input `staging-evaluate` consumes.

Unlike `staging-cli-run` (a deterministic VHS `.tape`) this is **not a scripted
verb** — it is judgment: navigate, observe, decide what is worth a screen, log
findings autonomously. So it lives as this skill, not a `scripts/staging.mjs`
verb (same shape as `staging-evaluate`). The driver's only job here is to have
an instance **up**; the walkthrough is all MCP browser work.

This is the repeatable version of the 2026-07-01/2026-07-02 hand walkthroughs
that enriched `_IDEAS/staging-journeys.md` and `_IDEAS/backlog.md`: a
standing journey script, a fixed capture layout, and the house-format README —
so any run produces the same bundle shape.

## Prerequisites (all inherited from the substrate)

- **A running `relay-staging` instance on `:3199`.** This skill rides on it — it
  does **not** stand one up. First, via the `relay-staging` skill:
  ```bash
  node scripts/staging.mjs setup     # if not already installed
  node scripts/staging.mjs launch    # start on :3199, hold open
  node scripts/staging.mjs status    # confirm it's up before driving
  ```
  Reach it at **http://127.0.0.1:3199/**. If `status` says nothing is up, launch
  first — never point the browser at the operator's dev server (`:3000`), which
  is the wrong data dir and a fidelity breach.
- **Rebuild-before-verify.** If product `src/` changed since the last `setup`,
  the served artifact is stale (memory `staging-artifact-rebuild-before-verify`).
  Rebuild + re-setup before trusting a capture:
  ```bash
  npm run build && node scripts/build-prebuilt-artifact.mjs
  node scripts/staging.mjs teardown && node scripts/staging.mjs setup && node scripts/staging.mjs launch
  ```
- **A browser MCP.** Codex-in-Chrome primary (operator watches live), Playwright
  MCP headless fallback (D6) — see "Browser driver" below.
- **A license for the paid-journey legs (J7, JS2).** The offline dev-key signer
  mints one with zero external deps — `staging-cli-run`'s
  `scripts/staging/sign-staging-license.mts` writes `naya-license.json` into the
  bundle; reuse that file, or paste the real prod fixture
  (`src/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json`)
  for a prod-trust-anchor run.

## Browser driver (D6 — Codex-in-Chrome primary, Playwright fallback)

Mirror `quality-manager`'s proven strategy. Load the MCP tools once (single
`ToolSearch` call, comma-separated select), then:

1. `mcp__claude-in-chrome__tabs_context_mcp` — check current browser state
   FIRST (never reuse a tab id from another session).
2. `mcp__claude-in-chrome__tabs_create_mcp` — a **new** tab for the walkthrough;
   `mcp__claude-in-chrome__navigate` to `http://127.0.0.1:3199/`.
3. `mcp__claude-in-chrome__read_page` — confirm the app loaded before driving.
4. If the extension is unavailable or keeps disconnecting, retry once, then fall
   back to Playwright MCP (`mcp__plugin_playwright_playwright__browser_navigate`
   + `mcp__plugin_playwright_playwright__browser_snapshot`) for equivalent
   accessibility-tree snapshots. Note the fallback in the README.

Per-screen tool loop: `read_page` (state) → `find` (locate an element) →
`computer` / `form_input` (interact) → `read_console_messages` +
`read_network_requests` (capture) → screenshot. Use
`mcp__claude-in-chrome__gif_creator` for **one** key multi-step screencast (the
web license-activation ceremony is the canonical choice) so the operator has a
motion artifact, not just stills.

### Driver mix for an efficient autonomous run (proven 2026-07-03, 6-run sweep)

A full R1–R6 sweep is too slow if every finding is pixel-clicked. The mix that
converged fast (memory `staging-autonomous-run-playbook`) — all three surfaces
read ONE shared `~/.relay-staging` SQLite store:

- **`get_page_text`** for copy / badge / label / legacy-string findings — one cheap
  call beats zoom-reading a screenshot (found stale-pricing, copy-standard
  compliance, `blur-heavy` jargon this way).
- **Direct API + `sqlite3 ~/.relay-staging/relay.db`** for data-layer findings
  (ledger attribution, materialization, trigger-fired, pack install result). When a
  POST 400s, **grep the route's Zod schema** (`z.object` in `src/app/api/.../route.ts`)
  for the real param shape rather than guessing — several params surprise you (`id`
  not `packId`; `channelType` not `type`; `{envelope}` license wrapper;
  `{rows:[{data:{…}}]}` table rows; Ollama settings POST not PATCH).
- **Screenshots** only for visual/layout findings (the runtime-chip label collision
  needed the image). Use a Playwright helper (one browser, many routes, dismiss the
  modal once) for the PNG bundle.
- **Live Codex-in-Chrome** for operator-watchable moments (compose runs) and
  UI-only surfaces (the Workflow Learning approval toast showed ONLY in the live
  browser, never the API).

**Launch the capture browser HEADED** (`chromium.launch({ headless: false })`), even
autonomous — operator directive (memory `staging-headed-browser-preference`) so
progress is glanceable. Foreground `sleep` is blocked in this harness; use
`node -e "setTimeout(...)"` for backoff or background the capture.

## Autonomous-logging cadence

Per memory `walkthrough-autonomous-logging`: during the walkthrough, **log
findings on best judgment and keep going** — no per-screen confirmation. Do not
stop for the operator between screens unless interrupted or genuinely blocked
(a hard error, a destructive-looking dialog, a missing license). The 2026-07-01
pass's per-journey STOP cadence was an operator-locked *manual* run; the skill
default is autonomous so an unattended run completes the bundle.

**Findings are field observations, not defects.** Log them raw into the bundle;
do NOT diagnose root cause or edit product code mid-walkthrough. Verification
against `file:line` is `staging-evaluate`'s job (Mode D, D8) — this skill only
*captures*. If you hit a real product defect, note it and keep going; the
decision tree lives in `relay-staging` ("bug found while staging").

## The journeys (from `_IDEAS/staging-journeys.md`)

Walk in the ICP's operating order (client-book → services → compose → run →
govern → pack payoff), not nav order. The journey file is the standing script —
read it fresh each run; it is enriched to shipped state and marks `⚠` steps that
re-verify a prior-pass residual before writing a finding.

### One session = one RUN, not the whole suite (revised 2026-07-03)

**The 2026-07-02 full-suite pass proved 14-journeys-in-one-session degrades the
tail** — JS3/JS4/JS5/JS6 came out surface-only because the depth budget was spent.
The journey file now partitions the journeys into **six session-sized runs** (its
"Session-run plan" table). A browser session holds ~12–18 deep steps or one
heavyweight journey; each run fits that. **Default to walking ONE run per
invocation**, declare which in the README, and finish that run's README section
before the session fills. A full sweep is several invocations across sessions
sharing one dated bundle — not one marathon.

(Naming note: these session **runs** are R1–R6. They are unrelated to the
isolation **invariants** R1/R4/R5 further down — those are the substrate's
`~/.relay-staging`-only / content-unchanged / cost-containment rules. Same
letters, different axes.)

| Run | Journeys | Persona | Capture priority |
|-----|----------|---------|------------------|
| **R1** Foundation | J0 J1 J2 J3 | agency owner | ⭐ honest budget/spend labels; project↔customer link; copy-standard spot-check |
| **R2** Live spine | J4 J5 J6 | agency owner | ⭐ compose headline; honest metering; trust+margin loop; ⚠ [X-2] cwd default |
| **R3** Pack payoff | J7 | agency owner | ⭐ **UI install path** (both pass-2 blockers now fixed) + license ceremony + 6 chapters run through data |
| **R4** Solo value | JS1 JS2 JS3 | solo founder | ⭐ multi-vendor $0 Ollama; privacy guarantee; chat depth **driven not skimmed** |
| **R5** Builder ladder | JB1 JB2 JB3 | app builder | ⭐ compose→inspect manifest; iterate + kit-fit; author + `pack add` + D4 |
| **R6** Ops & census (LAST) | JS4 JS5 JS6 | solo founder | channels; **snapshot→clear→restore**; route census on S13 IA |

Sequencing: R1→R2→R3 in order (each builds on the last); R4/R5 any time after R1;
**R6 always last** (JS5's Clear-All-Data destroys prior state). If a run needs
state a prior run built but it was torn down, bootstrap it minimally and say so.

**Web fulfilment surfaces (D7) are mandatory captures** in R3, not optional: `/packs`
graduation gallery (free installs / Pro locked with price), the **402 soft-gate**
on unlicensed Pro install, and the **Settings → License** paste/activate ceremony.
The CLI side of fulfilment is `staging-cli-run`'s GIF; the *web* side is captured
here so both surfaces a customer uses are in a bundle.

**Scope to the ask.** One RUN (R1–R6 above) is the default unit — session-sized,
declared in the README. A full J0–JB3 sweep is all six runs across sessions
sharing one dated bundle (matches the journey file's Done criteria). For a
targeted capture (one graduation surface, one reported flow) walk only the
relevant journeys and say so — a partial bundle is fine as long as it declares
what it covered. **Any step you cut, log as NOT-DRIVEN in the README** — a
declared gap beats a shallow pass (the 2026-07-02 JS-tail lesson).

## The bundle (Mode B house format)

Everything lands in a dated **`output/staging/<date>/`** (reuse the day's dir if
`staging-cli-run` already created one — the bundle is shared across modes so
`staging-evaluate` reads one folder). Layout:

| File | What |
|------|------|
| `NN-<slug>.png` | one PNG per captured screen, zero-padded + slugged (`01-dashboard-fresh.png`, `12-packs-community.png`, …) |
| `<flow>-screencast.gif` | the one `gif_creator` motion artifact (e.g. `license-activation-screencast.gif`) |
| `console-messages.log` | `read_console_messages` across the walkthrough — note any client exceptions vs expected errors (a 402 at the soft-gate is expected) |
| `network-requests.log` | `read_network_requests` — the API calls each surface fires (`POST /api/packs/install` 402→200, `POST /api/license` 200, …) |
| `README.md` | the house-format writeup (below) |

### README house format (from `output/staging/2026-07-01/README.md`)

Three fixed sections so every bundle reads the same:

1. **Header** — one line: what mode, which build/version (read it from the running
   instance, not memory), the isolated data dir, and the license source used.
2. **Screens** — a `| # | File | What it proves |` table, one row per PNG, each
   "proves" line written from the ICP's viewpoint (what the customer learns), not
   a UI description.
3. **Logs** — bullets naming `console-messages.log` + `network-requests.log` and
   calling out expected-vs-unexpected entries (so a reviewer knows a logged 402 is
   the soft-gate, not a bug).
4. **Cross-surface verification** — the same-session, same-store checks that tie
   the web capture to the CLI (`relay pack list` / `relay license status` reflect
   the UI-driven state; post-remove the pack survives — D4/D7). This is the seam
   `staging-evaluate` trusts when it correlates findings across modes.

Write the "proves" lines and the log call-outs as you go, not at the end —
autonomous-logging means the README grows during the walk.

## Isolation invariants (inherited from the substrate)

- **R1 · `:3199` / `~/.relay-staging` only.** Only ever drive the staging URL.
  Never navigate to `:3000` (the operator's dev server, wrong data dir) or run a
  destructive flow against `~/.relay`.
- **R4 · `~/.relay` content unchanged.** The walkthrough is read-heavy on the
  browser but *writes data* into `~/.relay-staging` via the app (creating
  customers, running tasks). That is expected and isolated. When done, let
  `relay-staging teardown` assert the `~/.relay/relay.db` content fingerprint is
  unchanged (content, not mtime — memory
  `staging-isolation-check-content-not-mtime`). A breach means the app wrote into
  the default dir — investigate before trusting the bundle.
- **R5 · Cost containment.** J4/J5/J7, JS1–JS2, and JB1–JB3 run **live agents
  that spend real tokens**. Prefer local Ollama ($0) for low-stakes runs; gate
  paid providers behind an explicit operator OK so an unattended run doesn't spend
  by default. Pick the cheapest tier that still exercises the surface honestly.
  (This "R5" is the cost invariant — not the R5 Builder-ladder session run above.)

## Instrumentation is harness-side ONLY

All capture stays in local `output/staging/`. **Nothing phones home; nothing
ships in the product** (the plg-refine §7 no-telemetry fence). The browser MCP
reads the running instance's own console/network; no capture leaves the machine.

## Definition of done (per spec §4.5 / §10.2)

A dated `output/staging/<date>/` bundle an operator + CC can review **without
re-running**. **Per RUN** (not per suite — one session = one run):
1. Per-screen PNGs for the run's journeys walked to depth (for R3, ⭐ the four
   graduation/fulfilment surfaces at minimum: `/packs`, the 402 soft-gate, the
   license ceremony, the licensed state).
2. `console-messages.log` + `network-requests.log` covering the walk, with
   expected-vs-unexpected entries called out.
3. One `gif_creator` screencast of a key multi-step flow in the run.
4. A house-format `README.md` section that **names the run (R1–R6)** and its
   header/screens/logs/cross-surface parts; any cut step logged NOT-DRIVEN.
5. R4 (isolation invariant) holds at teardown (`~/.relay` content unchanged).

The **suite** is done when all six runs' sections exist in the shared bundle. Each
run's section is ready for `staging-evaluate` (Mode D) to verify-and-groom as soon
as it lands — no need to wait for the full sweep.

## This SKILL.md stays local

`.Codex/skills/` is gitignored (public npm package — memory
`skills-are-gitignored-secret-sauce`). This file is never committed. The
shippable outputs are only what lands under `output/` (not committed either) and
whatever `staging-evaluate` later grooms into `features/fix-*.md` + backlog.
Commit only scripts a skill invokes — this skill invokes none of its own (it
rides the substrate's `scripts/staging.mjs`), so there is nothing to commit.
