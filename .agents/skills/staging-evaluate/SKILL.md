---
name: staging-evaluate
description: >
  Turn a captured staging bundle (output/staging/<date>/) into a verified,
  ranked dogfooding backlog: features/fix-*.md specs + _IDEAS/backlog.md
  entries + FILED GitHub issues. Use when the user mentions evaluating a
  staging bundle, grooming staging findings, Mode D, verify-before-groom,
  turning a walkthrough/CLI-run capture into fix specs, replicating a customer
  report, or filing issues from a captured run. Also triggers on
  "staging-evaluate", "evaluate the bundle", "groom the findings", "Mode D", or
  any request to convert a captured staging run into reviewable work. This
  CONSUMES bundles produced by staging-cli-run (Mode A+C) and
  staging-browser-smoke (Mode B) — run one of those (and the relay-staging
  substrate) first. Do NOT use to capture a run (use staging-cli-run /
  staging-browser-smoke) or to stand up the instance (use relay-staging).
---

# Relay Staging — Evaluate (Mode D: findings → dogfooding backlog)

Convert a captured `output/staging/<date>/` bundle into **verified** work. A
captured run is a pile of **field observations**, not defects. This skill's one
job is the discipline that separates the two: **code-verify every finding
against the current tree before it becomes a spec or an issue.**

This is the repeatable version of what the `output/staging/2026-07-02/` bundle
did by hand — `FINDINGS-live.md` (raw) → `EVALUATION.md` (verified + ranked) →
`gh-issue-drafts.md` (record) → filed via `gh issue create`. S4 mechanizes the *procedure*, the
same way S2 mechanized the license ceremony. Unlike S2/S3 it is **not a
deterministic script** — it is judgment (read code, decide what is real), so it
lives as this skill, not a `scripts/staging.mjs` verb.

## Why verify-before-groom is the whole point

Observed-symptom ≠ root-cause, and `file:line` citations drift. In the two prior
grooming passes, code-verification **changed the diagnosis of 3-of-10 and then
1-of-2 findings** — including a finding the author had written an hour earlier
(memory `verify-walkthrough-findings-before-grooming`). A groomer who acts on the
raw finding writes the WRONG fix. So: no finding becomes a `fix-*.md` or a
drafted issue until its cited mechanism is confirmed against HEAD.

Corollary: some findings verify as **already fixed** or **not a bug**. Those are
logged as "not reproduced," never groomed. Catching a stale finding is a success,
not a miss.

## The one input

The **latest** `output/staging/<date>/` bundle (or one the operator names). A
bundle carries some of:

| File | From | What it gives the evaluation |
|------|------|------------------------------|
| `cli-first-run.log` / `mode-c-fulfilment.log` | S2 | CLI transcript — first-impression noise, fulfilment ceremony |
| `D4-proof-summary.txt` | S2 | the 6 D4 checks (should be all OK) |
| screens + `console` + `network` + `README.md` | S3 | UI walkthrough surfaces (J0-J6) |
| operator annotations (inline notes, a `NOTES.md`) | operator | steer / prioritize |

Read whatever is present. Absent files just mean fewer finding sources.

## Procedure

### 1. Read the bundle
Locate the latest `output/staging/<date>/` (or the operator-named one). Read
every capture file + any operator annotations. Note the build/version stamped in
the logs — findings are pinned to that build.

### 2. Extract raw findings → `FINDINGS-live.md`
Write candidate findings (bugs, UX gaps, missing states, feature ideas) into
`<bundle>/FINDINGS-live.md` as **UNVERIFIED field observations**. For each: a
one-line symptom, a severity guess, and the **cited mechanism to verify**
(`file:line` or subsystem). Mark the header: "Status: UNVERIFIED — code-verify
each before grooming." Also log a short "Working as designed (positive signal)"
list — the run confirms things work too, and that context prevents over-grooming.

### 3. Code-verify each finding (delegate reads)
For every finding with a code-rooted claim, **confirm the cited mechanism against
the current tree**. Delegate the code reads to parallel **read-only Explore
agents** (operator policy: delegate reads/research, author in-session; memory
`verify-walkthrough-findings-before-grooming`). Each verifier returns: mechanism
CONFIRMED / CORRECTED (with the real `file:line` + cause) / NOT-REPRODUCED
(already fixed or never a bug).

Fold corrections **in place** in `FINDINGS-live.md`, annotate `[verified <date>]`.
Then write the ranked, verified set into `<bundle>/EVALUATION.md`:
- A one-line **Verdict** (pyramid: conclusion first).
- The D4 acceptance line (from `D4-proof-summary.txt`).
- Findings ranked by value, each with: verified `file:line` + real cause,
  severity, the principle it violates (AGENTS.md 1-7), and a one-line ACTION.
- Non-survivors under "Not reproduced" with why.

### 4. Groom survivors → `features/fix-*.md` + `_IDEAS/backlog.md`
For each **verified** finding worth building, use `product-manager` conventions:
- `features/fix-<slug>.md` with frontmatter: `title`, `status: proposed`,
  `priority`, `milestone`, **`source:` pointer** (`staging <mode> run <date>,
  bundle output/staging/<date>/`), `dependencies`. Body = Description (verified
  mechanism, not the raw symptom) + repro + proposed fix.
- Append a one-line entry to `_IDEAS/backlog.md` in its documented format
  (`- [severity · type] Screen/route — observation. → fix.`).

Do NOT groom a finding whose mechanism did not survive step 3.

### 5. Mode D — replicate + FILE issues (auto-file)
For customer-report-shaped findings, reconstruct the reporter's state via
`relay-staging` scenario fixtures and replay in the **reported topology** (Alpine
VM → `--hostname 0.0.0.0` → LAN per memory `customer-triage-field-reports-2026-07`
— ask for run topology if a real report; localhost may not reproduce a
cross-origin bug). Then write `<bundle>/gh-issue-drafts.md` as the durable record
(one titled entry per issue with `Labels:` + `Body:`), **and file each one directly
with `gh issue create`** (issue + label writes are allowlisted; see memory
`autonomous-session-permission-gates`). Follow the customer-facing issue contract
in memory `release-and-issue-conventions` — customer-voice title/body, correct
`bug`/`enhancement`/`feature` label. Record each filed issue's URL back into
`gh-issue-drafts.md` next to its entry so the bundle stays the audit trail. A
finding only becomes an issue once its mechanism survived step 3 — filing does not
relax the verify gate.

## Guardrails (fenced)

- **Findings are not defects until code-verified.** Step 3 is not optional. A
  finding that skips it does not get a spec or a draft.
- **Issues are auto-filed after verify.** Step 3 is still the gate: only a
  code-verified finding gets an issue. `gh-issue-drafts.md` in the bundle is the
  durable record + audit trail (title/labels/body + the filed issue URL); the
  skill runs `gh issue create` itself. Never file a finding that skipped step 3.
- **R4 isolation.** Evaluation is read-mostly, but if any step launches the
  instance (Mode D replay), re-assert `~/.relay` content-fingerprint unchanged
  (content, not mtime — memory `staging-isolation-check-content-not-mtime`).
- **Harness-side only.** No product telemetry, no phone-home (plg-refine §7).
- **This SKILL.md stays local.** `.Codex/skills/` is gitignored (memory
  `skills-are-gitignored-secret-sauce`). Only the `features/fix-*.md`,
  `_IDEAS/backlog.md` edits, and the in-bundle drafts are the shippable output;
  the bundle itself is under `output/` (not committed).

## Definition of done (per spec §4.6 / §10.4)

One full loop on a bundle produces:
1. A verified `EVALUATION.md` where **at least one finding was corrected or
   marked not-reproduced** (proof the verify gate ran, not rubber-stamped).
2. At least one new `features/fix-*.md` with a `source:` pointer + a
   `_IDEAS/backlog.md` line.
3. At least one issue **filed** via `gh issue create`, with its entry + URL
   recorded in `<bundle>/gh-issue-drafts.md`.
