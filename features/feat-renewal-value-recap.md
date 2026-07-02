---
title: Renewal value-recap loop (PLG-4a)
status: planned
priority: P1
milestone: post-mvp
source: _SPECS/plg-refine.md §5 PLG-4 + S7 operator gate (2026-07-02 — value-recap chosen; reverse trial KILLED per §4)
dependencies: [feat-pack-update-workflow, feat-license-lifecycle]
---

# Renewal value-recap loop

## Description

The renewal moment is currently argued generically. `license status` warns at
≤30 days with "renewing keeps new premium packs and updates flowing"
(`src/lib/licensing/cli.ts:146-157`) and the `pack update` 402 refusal is
renewal-voiced (`src/lib/packs/update.ts:158`) — but neither names what the
license year actually delivered. Since 0.21.0 the evidence exists: Agency Pro
v0.2.0 (the nonprofit deep chapter) is a real paid update, the install-state
sidecar records `packVersion` + `installedAt`, and `packUpdateAvailability()`
(`src/lib/packs/update.ts:78`) is the one comparison source all surfaces
already derive from (D7).

This feature makes the renewal case *specific and evidence-based*: a recap of
concrete value received and pending ("Your term delivered Agency Pro
v0.2.0 — the nonprofit deep chapter: grant pipeline from fit-scored go/no-go
through post-award compliance"), surfaced only at explicit, high-intent
moments — `license status`, the update-gate refusal, and the /packs update
affordance — plus a Website-side renewal email carrying the same voice. It is
the honest-persuasion counterpart to D4: we never threaten installed content
(it's theirs forever), so the only lever left is showing what renewal actually
buys. That lever needs data, and this feature wires it.

Operator context: this is the first PLG-4 loop, gated and chosen 2026-07-02.
The reverse-trial loop was killed the same day (re-lock = D4 violation,
recorded in `_SPECS/plg-refine.md` §4) — nothing here may drift toward it.

## User Story

As a licensed agency operator approaching renewal, I want Relay to show me
exactly what my license year delivered and what the next year is already
shipping, so that renewing is an evidence-based decision instead of a
subscription guilt-trip.

## Technical Approach

### 1. `changelog:` field in pack.yaml (schema + content)

No per-version "what's new" source exists today — `pack.yaml` has only the
sales `description`. Add an **optional** `changelog` map to the pack Zod
schema: version string → one customer-voice line.

```yaml
changelog:
  "0.1.0": "Six chapters of agency operating system — finance cockpit, intake pipelines, new-business machine, governance, CRE renewals."
  "0.2.0": "The nonprofit deep chapter — a grant pipeline from fit-scored go/no-go through LOI, full application, and post-award restricted-funds compliance."
```

- Optional field: existing packs without it must still validate (the registry
  skips schema-invalid files with only a console.warn → "Blueprint not found"
  class of failure; see HANDOFF caveat). The agency-pro test suite
  schema-validates all shipped content — extend it to require `changelog` for
  the Pro pack specifically (paid packs must carry recap material).
- Author entries for `relay-agency-pro` 0.1.0 and 0.2.0 (source copy: the
  pack description + issue #18 customer-voice CHANGELOG entry).

### 2. One canonical recap helper (D7 discipline)

`licenseValueRecap(opts)` — likely `src/lib/licensing/recap.ts`, dynamically
imported by its consumers (TDR-032: nothing new in the CLI's static startup
graph). For each valid stored license (`listLicenses`,
`src/lib/licensing/store.ts:200`), for each pack template whose `entitlement`
the license covers:

- `packUpdateAvailability(packId)` → installedVersion / availableVersion /
  updateAvailable (reuse; do NOT add a second comparison).
- Install-state sidecar → `installedAt` ("running vX since <date>").
- Template `changelog` → the lines for versions in `(installedVersion,
  availableVersion]` = **pending value**, and the line for `installedVersion`
  = **received value**.

Returns structured data `{ received: [...], pending: [...] }` per license;
rendering stays in each surface. **Fail-open everywhere** (memory
`cli-startup-robustness`): any read error → empty recap, never a crash, never
a blocked `license status`.

### 3. Surface: `license status` (the local reminder)

In `runStatus` (`src/lib/licensing/cli.ts:118`):

- Whenever an entitled pack has `updateAvailable`, print a recap block under
  that license — "Included in your term, waiting to install:" + per-version
  changelog lines + the one-command cure (`relay pack update <id>`). This
  shows regardless of the 30-day window: `license status` is an explicit
  invocation, so informational recap is not a nag.
- The existing ≤30-day warning keeps its D4 sentence but gains the specific
  evidence when recap data exists ("This year delivered: v0.2.0 — …").
- Expired-but-saved license: same recap in the renewal-voiced form the 402
  gate uses; always paired with the installed-packs-are-yours-forever
  statement.

### 4. Surface: the update-gate refusal (highest-intent moment)

The 402 renewal-voiced refusal (gate at `src/lib/packs/update.ts:158`, and
the `POST /api/packs/update` 402 body) names the withheld value: version +
its changelog line ("v0.2.0 — the nonprofit deep chapter …"), not just "a
license is required". Same helper, same copy source.

### 5. Surface: /packs update affordance (near-free, keeps surfaces uniform)

The /packs card already derives its Update button from
`packUpdateAvailability` via the API. Add the pending version's changelog
one-liner next to it. One line of copy; no new state.

### 6. Website email relay (their half of the loop)

Post a new `later-N` entry on `strategy/relay/_RELAY.md` (edit only — NEVER
commit/push that repo; memory `strategy-repo-readwrite-only`) asking Website
to add a renewal-reminder email (suggest T-30) built on:

- **What they know:** issuance data (issuedAt/expiresAt/entitlements) and the
  public release history. They can NOT see customer installs — no phone-home
  is the wedge — so the email recaps *what the term shipped* ("your license
  year included Agency Pro v0.2.0 — …"), never "you haven't installed X".
- **Canonical copy we provide:** recap lines from the pack changelog + the D4
  promise verbatim (`src/lib/licensing/cli.ts:32-34` — operator-approved
  wording, keep byte-identical) + the one-command cure. Renewal CTA links the
  existing purchase URL.
- Their send mechanics/timing are theirs; we owe copy and the changelog as
  the single recap source.

### Anti-pattern fences (§7 — verbatim constraints)

- **Startup banner untouched.** Identity only (D3). No recap, no renewal
  text, no upsell in default CLI output — the npm terminal-ads rule.
- **No every-launch nags.** Recap appears only on explicit `license status`,
  at the 402 refusal, and on the /packs card the user opened.
- **No online re-validation, no phone-home.** Recap is computed entirely from
  the local store + bundled templates.
- **D4 language discipline.** No recap sentence may imply installed content
  is at risk. Renewal buys the *next* year's flow; it never protects what's
  already installed.
- **No reverse-trial drift.** Killed 2026-07-02. No countdowns, no temporary
  unlocks.

## Acceptance Criteria

- [ ] `pack.yaml` schema accepts optional `changelog`; all existing bundled
      packs still validate (registry skips nothing new); agency-pro suite
      requires + validates the Pro pack's `changelog` for 0.1.0 and 0.2.0.
- [ ] With the pinned real prod license fixture
      (`src/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json`)
      added and agency-pro 0.1.0 installed against a 0.2.0 template:
      `relay license status` prints a recap naming v0.2.0 and the nonprofit
      chapter line, plus `relay pack update relay-agency-pro` as the cure.
- [ ] ≤30-day expiry case: warning keeps the D4 sentence and adds the
      specific evidence line. Expired case: renewal-voiced recap; installed
      packs statement present; nothing blocked.
- [ ] Unlicensed/expired `pack update` refusal (CLI and API 402 body) names
      the withheld version and its changelog line.
- [ ] /packs card shows the pending version's one-liner beside Update.
- [ ] Fail-open proven by test: corrupt sidecar, missing template, and
      changelog-less pack each yield a normal `license status` with no recap
      block and no error.
- [ ] Up-to-date install (installed == available): no pending block, no
      phantom nudge (shadow-path: recap of an empty diff must be silence).
- [ ] Unit tests for the recap helper (term/version-window math, entitlement
      filtering, null installedVersion pre-0.21 installs) + a real-launch
      smoke of `license status` and the 402 path on the built CLI
      (CLAUDE.md smoke budget — licensing/packs CLI precedent:
      `agency-pro-update.test.ts` + live dev-server smoke on 0.21.0).
- [ ] `strategy/relay/_RELAY.md` later-N posted with the email ask + canonical
      copy (file edited, never committed).
- [ ] CHANGELOG customer-voice entry; shipped/roadmap issue per
      `release-and-issue-conventions` memory.

## Scope Boundaries

**Included:**
- `changelog` schema field + agency-pro entries (0.1.0, 0.2.0)
- One recap helper; three local surfaces (`license status`, 402 refusal,
  /packs one-liner)
- Website relay entry with canonical email copy

**Excluded:**
- Any email sending from this repo (Website owns the mechanics)
- Startup banner changes of any kind
- Telemetry, install reporting, or any outbound call (no-phone-home wedge)
- Reverse trial, countdowns, temporary unlocks (KILLED — plg-refine §4)
- Seat enforcement; the remaining PLG-4 loops (free registration key tier,
  founding-supporter identity) — each still operator-gated separately
- A generalized in-app notification/inbox surface for renewal (revisit only
  if a customer asks)

## References

- Source: `_SPECS/plg-refine.md` §5 PLG-4 (loop definition), §4 D4/D5/D7 +
  the 2026-07-02 reverse-trial kill record, §7 anti-patterns
- Code anchors: `src/lib/licensing/cli.ts:118-167` (status verb, D4 warning,
  D4_PROMISE wording), `src/lib/packs/update.ts:78` (packUpdateAvailability),
  `src/lib/packs/install-state.ts` (sidecar: packVersion, installedAt),
  agency-pro `pack.yaml` (description = sales copy precedent)
- Related features: `feat-pack-update-workflow.md` (shipped 0.21.0 — the
  machinery this recaps), `feat-license-lifecycle.md` (store + status verb),
  `feat-agency-pro-pack.md` (the pack whose updates are the evidence)
- Memories: `strategy-repo-readwrite-only`, `cli-startup-robustness`,
  `release-and-issue-conventions`
