---
name: staging-operator-run
description: >
  Operator drives a real customer first-run (npx orionfold-relay → license →
  pack → run a workflow) in their own terminal + browser while Codex
  WATCHES and LOGS proactively — guiding the operator on the exact commands
  (npx, license activation, pack install) and capturing every bug/UX finding
  to a session findings file as they surface. Use when the operator says they
  want to "self-run the first user experience", "walk through as a customer",
  "I'll drive, you watch", "help me activate the license", "guide me through
  npx", "operator runs and provides feedback", "tear down the staging
  folder/server", or any session where the HUMAN interacts with a live instance
  and CC's job is to narrate + log (and drive the cleanup at wrap), not to
  drive the clicks. This is the operator-driven complement to the CC-driven
  staging skills. Opens with a MODE CHOICE (Step 0.5, multi-select): Mode A =
  local staging mirror on :3199 (your working tree, frozen build), Mode B = the
  literal npx published package on :3200 (the recommended default, what customers
  download), Mode C = `npm run dev` on :3000 (live hot-reload, NOT
  customer-faithful). The operator can run one, some, or all three at once —
  distinct ports/data dirs never collide. Do NOT use when CC should record the run itself
  (staging-cli-run = GIF) or drive the browser walkthrough
  (staging-browser-smoke = Mode B) or groom a captured bundle
  (staging-evaluate = Mode D). It RIDES on the relay-staging substrate concepts
  but launches the REAL published npx package, not the local file:// mirror.
---

# Staging Operator Run — operator drives, Codex watches & logs

The operator experiences the product as a real customer would — running the
actual `npx orionfold-relay` in their own terminal, activating a license,
installing a pack, running a workflow — **in their own hands.** Codex's
job is NOT to click; it is to **guide the exact next command, watch the CLI log
+ browser + console + network, and proactively log every bug and UX finding**
to a session findings file the moment it surfaces.

This is the fourth staging mode:

| Mode | Who drives | CC's role |
|------|-----------|-----------|
| `staging-cli-run` | CC | records a GIF of the CLI/fulfilment |
| `staging-browser-smoke` | CC | drives the browser J-journeys, captures PNGs |
| `staging-evaluate` | CC | grooms a captured bundle → backlog |
| **`staging-operator-run` (this)** | **the operator** | **guides + watches + logs proactively** |

## The operating contract (learned 2026-07-03)

0. **LOG-ONLY MODE — this is the whole job (memory `operator-run-log-only-mode`).**
   CC's role is to **log findings truthfully**, nothing more. During the run CC does
   NOT: write specs / `features/*.md`, propose or apply fixes, turn a finding into a
   feature, or run planning ceremony (brainstorming / writing-plans / ExitPlanMode /
   design `AskUserQuestion`s). All of that DISTRACTS the operator from their drive +
   feedback flow and belongs to a SEPARATE later pass (`staging-evaluate` / Mode D).
   **Investigation is "light" — only enough to make the report TRUE** (kill a wrong
   root-cause guess, confirm the repro via `file:line` / API / a second surface), then
   STOP. No deep root-cause rabbit holes. A one-line fix-direction hint in the finding
   is fine; a spec or a fix is not. If the operator EXPLICITLY says "turn this into a
   feature" / "fix this now," that overrides log-only FOR THAT ITEM only; otherwise the
   default is always log-only. When tempted to design or fix: log it and keep watching.
1. **Operator drives every mutating click.** CC never clicks Send/Submit/Delete
   or activates anything. CC's browser tab is a MIRROR for watching, not a
   second driver. When the operator says **"watch"**, CC screenshots the tab,
   reads what's on screen, and checks console/network if anything looks off.
2. **Guide the EXACT next command, not a menu of options.** Give the operator
   the literal command to paste (npx, license, pack), then get out of the way.
   Recommend one path; note alternatives in one line.
3. **Log proactively, every finding, as it surfaces** — don't batch to the end.
   Each finding gets a stable ID (BUG-N / FEAT-N), a severity, and a
   verify-status. VERIFY AT `file:line` before calling anything a bug (memory
   `verify-walkthrough-findings-before-grooming`): 3-of-10 field findings were
   wrong/stale in a prior pass. A code-checked finding is groomable; an
   unverified one is a lead.
4. **Separate "bug" from "correct behavior".** When the app refuses to do
   something, check WHY before logging — an agent refusing to fabricate is
   correct; log a POSITIVE note so nobody "fixes" a guardrail.
5. **Cluster related findings.** Cross-link findings that share a root cause so
   grooming treats them as one piece of work, not N patches.
6. **Never fix on the captured/installed artifact.** Findings are logged, not
   fixed mid-session. Fixes land on `main` later (relay-staging decision tree).
7. **Drive-split for processes vs. artifacts.** CC drives file/dir cleanup and
   all watching, but the OPERATOR stops any server they launched (Ctrl-C / their
   own `kill`) — CC killing a foreground process it didn't create trips the
   "interfere with workloads" gate. See Step 4 (Teardown).

## Step 0 — Set up the findings file

Create a session-scoped file (NOT inside an existing bundle dir):

```
output/staging/<YYYY-MM-DD>-operator-walkthrough/FINDINGS-live.md
```

Header it with: session type, the run mode(s) chosen (Step 0.5), the real
environment (version, data dir, license source), and the status legend
(`UNVERIFIED` / `VERIFIED@file:line`). Append to it live — this is the
`FINDINGS-live.md` house convention (memory `staging-autonomous-run-playbook`).

## Step 0.5 — Choose the run mode(s) — ALWAYS ask first

Before guiding any launch, present the operator the **three run modes** via
`AskUserQuestion` (`multiSelect: true` — they can run one, two, or all three at
once). They differ on **provenance × freshness**, and each has a DISTINCT port +
data dir so any combination coexists without collision:

| Mode | Command | Port | Data dir | Reflects | Hot reload? | Answers the question |
|------|---------|------|----------|----------|-------------|----------------------|
| **A · Staging mirror** | `node scripts/staging.mjs launch` | 3199 | `~/.relay-staging` | YOUR working tree at `setup` time (incl. uncommitted edits) | ❌ frozen build | "Does my current working tree behave like a customer install?" |
| **B · npx published** | `npx orionfold-relay@latest --port 3200 --data-dir ~/.relay-npx-test` | 3200 | `~/.relay-npx-test` | npm `latest` (committed + published only) | ❌ frozen build | "Is what customers LITERALLY download from npm broken?" |
| **C · Dev live** | `npm run dev` (port 3000) | 3000 | `~/.relay` (dev-gated) | live source, on save | ✅ **yes, Turbopack** | "Let me edit and watch changes instantly (NOT customer-faithful)." |

**Key facts to state when asking (correct the common misconception):**
- **A and B are BOTH frozen production builds — neither hot-reloads.** Only **C**
  (`npm run dev`) hot-reloads. A source edit does NOT appear on A until you
  rebuild: `npm run build && node scripts/build-prebuilt-artifact.mjs &&
  node scripts/staging.mjs setup && … launch` (memory
  `staging-artifact-rebuild-before-verify`).
- **A vs. B is provenance, not "live vs. published" in the reload sense.** A is a
  snapshot of your *local tree*; B is the *published npm tarball*. A can include
  uncommitted work; B cannot.
- **C is NOT customer-faithful** — it runs with the dev-mode gates on
  (`RELAY_DEV_MODE`/`.git/relay-dev-mode`), the real `~/.relay`, and a git repo
  present, so `no_git` fresh-customer behavior does NOT apply. Offer it only when
  the operator wants a live-editing loop, and label findings from it as
  dev-context, not customer-context.
- **Simultaneous is fine.** The ports (3199/3200/3000) and data dirs never
  collide, so the operator can eyeball A and B side by side, or keep C open for
  edits while A/B validate the frozen build. **Exclusive is also fine** — most
  operator runs pick exactly one (B, the literal customer path, is the default
  recommendation).

Phrase the question so **B is the recommended single default**, A is "test my
uncommitted tree," C is "live-edit loop (not customer-faithful)". Record the
chosen mode(s) in the findings-file header, then run the matching launch
prep below for EACH selected mode.

### Prep per mode (only for the modes the operator selected)

- **Mode A (staging mirror):** requires the `relay-staging` substrate. If the
  `dist-artifacts/relay-next-build-<version>.tgz` mirror is missing or stale,
  rebuild first (`npm run build && node scripts/build-prebuilt-artifact.mjs`),
  then `node scripts/staging.mjs setup` and `… launch`. Reaches `:3199`.
- **Mode B (npx):** no local build needed — jump to Step 1.
- **Mode C (dev live):** `npm run dev` in the repo (operator runs it in their own
  terminal so THEY own the process — Step 4 drive-split). Reaches `:3000` with
  hot reload. Skip the licensing/pack steps unless the edit under test needs them.

## Step 1 — The real customer command (Mode B — guide the operator)

The most faithful run is the LITERAL published npx package (not the local
staging mirror). First confirm published == local so the operator sees the
current build:

```bash
npm view orionfold-relay version   # should match package.json
```

Then give the operator this exact command to paste (isolated dir + port so it
never touches their real ~/.relay). **Port 3200** so Mode B coexists with a
Mode A staging mirror on `:3199` if the operator selected both:

```bash
mkdir -p ~/relay-npx-test && cd ~/relay-npx-test
npx orionfold-relay@latest --data-dir ~/.relay-npx-test --port 3200
```

Watch for in the boot log (ask the operator to paste it, or tail it):
- `Downloading production build … from https://github.com/orionfold/relay/releases/…`
  ← the REAL GitHub Release fetch (distinguishes npx from the file:// staging run).
- `Mode: production`, `bootstrap skipped: no_git`, Community Edition banner
  ← fresh-customer fidelity.
- **Known real finding to expect:** a trailing `fatal: not a git repository` line
  (BUG-1, `workspace-context.ts:37` — a caught-but-leaked git stderr). Cosmetic,
  but log it; it repros on the published tarball.

The browser auto-opens (no `--no-open`). Then open a Codex-in-Chrome MCP tab and
navigate it to `http://127.0.0.1:3200/` (Mode B port) to mirror what the operator sees:
```
ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,...navigate,...computer,...read_page,...read_console_messages,...read_network_requests,...get_page_text"
```

## Step 2 — Licensing (guide + mint if needed)

The operator will hit the model-picker onboarding, then Settings → License (or
the CLI `relay license add`). To let them activate a paid pack, MINT a dev-key
license — it's valid, offline, zero-cost:

- Signer: `src/lib/licensing/__tests__/sign-helper.ts` → `signEnvelope(payload)`,
  key `of-license-dev-2026-06` (trusted in prod `verify.ts`).
- Payload shape: copy `makePayload()` from `store.test.ts`; the entitlement that
  unlocks `relay-agency-pro` is **`product:orionfold-relay`**.
- Mint via a THROWAWAY `*.test.ts` under `__tests__/` that writes the JSON to
  `~/relay-npx-test-license.json`, run with `node_modules/.bin/vitest run <file>`,
  then DELETE the throwaway (it writes to home on every run — never commit it).
  NB: the vitest include glob is `*.test.ts`, not `*.spec.ts`.
- Give the operator both paths: **Upload file** (pick the .json) OR paste the JSON
  into Settings → License → Activate. Watch for "You're licensed. Thank you, <name>."

The 3-step verify gate: signature → term → entitlement. If activation fails, the
error names WHICH gate — report that, don't guess.

## Step 3 — Install the pack, then run a workflow

- Packs page → install **Relay Agency Pro** (entitlement gate passes now).
- **Guide the operator to the REWARDING first workflow, not the default one.**
  The app-home "Run now" is bound to the schedule-driven `month-end-close`, which
  runs to nothing on an empty ledger (BUG-2 dead-end). Instead:
  `Compose → Workflows → Blueprints → New-Business Machine` — it has a REQUIRED
  `prospect` input, so it shows a real form.
- **Warn about the verb chain (FEAT-7):** Blueprint → fill form → **Create Workflow**
  (instantiates to status `draft`, does NOT run) → **Execute** (the actual run).
  Tell the operator Execute is the run step; nothing in the UI says so.
- **Warn Execute costs real tokens** (the runtime is whatever model they picked in
  onboarding). Not a dry run.
- **Where to watch:** the workflow page (step circles) + Monitor (live log) +
  **Inbox** (checkpoint approvals — HITL steps pause here). Tasks page DELIBERATELY
  hides workflow step tasks, so it's the wrong place to look.

## Known findings map (from the 2026-07-03 founding run — expect these)

The activation journey has a hole at every joint. If the operator re-runs, these
should reproduce; use them to pre-empt confusion, and re-verify (don't assume a
prior finding still stands):

- **BUG-1** (low) · `fatal: not a git repository` leaks on first run · `workspace-context.ts:37`.
- **BUG-2** (med) · app-home empty state says "click Run now to ingest a CSV" but Run now never
  ingests a CSV · `ledger-hero-panel.tsx:18` + `run-now-button.tsx`.
- **BUG-3** (HIGH) · agents needing INPUT mid-workflow can't ask the user — no `input_required`
  ask-user channel; `checkpoint` gates approve/deny on prior output with a 5-min AUTO-CONTINUE, so
  a HITL run silently cascades into refusals and reports "completed" with no output ·
  `workflows/engine.ts:356,1110`. (Agents refusing to fabricate is CORRECT — log a POSITIVE, don't
  "fix" the guardrail.)
- **FEAT-5/6/7/8** (med, one cluster) · post-purchase activation has no connective tissue: blank
  slate has no guided flow (5) · app's own blueprints aren't surfaced on the app shell, forcing a
  navigate-away (6) · four different verbs for "make this go" — Run now / Create Workflow / Execute /
  empty Workflows list (7) · after Execute, no signposting to Monitor/Inbox for progress+approvals (8).
- **FEAT-1..4** (low) · license date renders 1 day early (UTC→local) · free vs Pro pack relationship
  ambiguous · manifest chevron points down but sheet slides from right · header toolbar wraps.

## Wrap

Leave the findings file in place for a later `staging-evaluate` pass (Mode D)
to verify-and-groom into `features/fix-*.md` + filed issues. Do NOT groom or
file during the operator run — capture only.

## Step 4 — Teardown (CC drives the cleanup, operator stops their own server)

At wrap, tear down cleanly. **The drive-split matters:** CC can delete the data
dirs/files, but the operator must stop the process THEY launched — killing a
foreground server CC didn't create trips the "interfere with workloads"
classifier (and rightly so). So:

1. **Capture the R4 baseline FIRST, before anything stops** — hash the real
   default DB so you can PROVE the whole run never wrote to it (memory
   `staging-isolation-check-content-not-mtime` — hash CONTENT, not mtime):
   ```bash
   shasum -a 256 ~/.relay/relay.db
   ```
2. **Stop each running mode — per the drive-split.** Confirm the port(s) for the
   mode(s) that ran are free:
   - **Mode A (staging mirror, :3199):** CC drives it — `node scripts/staging.mjs
     teardown` stops the held-open server, wipes `~/.relay-staging`, and asserts
     R4 itself. (The harness owns this process, so CC may stop it.)
   - **Mode B (npx, :3200) and Mode C (dev, :3000):** the OPERATOR launched these
     in their own terminal, so the operator stops them (`Ctrl-C`, or `! kill
     <pid>` themselves). CC does NOT kill a foreground process it didn't create.
   ```bash
   for p in 3199 3200 3000; do lsof -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1 && echo "$p STILL LISTENING" || echo "$p (free)"; done
   ```
3. **Confirm scope with the operator** before wiping (AskUserQuestion): full
   clean vs. keep-the-license (skips a re-mint next run) vs. data-dirs-only. Then
   **CC drives the deletes for the mode(s) that ran.** Targets:
   ```bash
   # Mode B (npx) — safe rm targets:
   rm -rf ~/.relay-npx-test             # npx data dir (--data-dir)
   rm -rf ~/relay-npx-test              # npx cwd
   rm -f  ~/relay-npx-test-license.json # minted dev-key license
   # Mode A (staging mirror) — the harness teardown already wiped ~/.relay-staging
   # + the scratch install; no manual rm needed. Only if setup ran but the harness
   # teardown was skipped:  rm -rf ~/relay-staging
   # Mode C (dev) — NOTHING to wipe. It used the real ~/.relay; NEVER rm that.
   ```
   **KEEP** (they live in the repo, not the wiped dirs): the findings file under
   `output/staging/.../FINDINGS-live.md` and this skill. **Mode C caveat:** its
   findings are dev-context, and it wrote to the real `~/.relay` — that dir is
   NEVER a teardown target.
4. **R4 verification — re-hash and assert unchanged (Modes A/B only).** This is
   the payoff of step 1; a matching hash proves the isolated modes never wrote to
   the default dir:
   ```bash
   shasum -a 256 ~/.relay/relay.db   # MUST equal the step-1 baseline — IF only A/B ran
   ```
   If it differs: investigate before trusting the run (a concurrent operator dev
   server or the CLI's boot-time legacy migration can innocently touch mtime but
   NOT content — a content change means an isolated mode wrote into the default
   dir, which is a real breach). Report the before/after hashes either way.
   **If Mode C ran, the hash WILL differ by design** — dev uses `~/.relay`
   directly, so skip the R4 assertion for C and note it wrote there intentionally.

**Never** run destructive flows against `~/.relay` itself — every teardown target
is an isolated `*-npx-test` / `*-staging` path, never the operator's real data
dir. (Mode C uses `~/.relay` live but is never wiped.)
