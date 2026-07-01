# Relay — HANDOFF

_Last updated: 2026-07-01 (pt: 0.15.1 shipped via OIDC + ainative-business deprecated — licensing/launch plumbing all closed)_

## ✅ CLOSED: Licensing/fulfilment — prod path PROVEN end-to-end

The real website-signed license (`OF-RELAY-VERIFY-20260701`) landed on the **`strategy/relay/_RELAY.md`**
channel (NOT the website channel — the artifact came in on `relay`) and **verified green under the
shipped `orionfold-relay@0.15.0` verifier**: signature under embedded `of-license-prod-2026` +
full 3-step gate + `assertEntitled` chokepoint + tamper-negative. **36/36 tests** (5 new). Pinned
as a tracked fixture (`src/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json`
+ `real-license.test.ts`) — the OF-RELAY analog of Proof's `OF-PROOF-2026-0001`. Relayed the
verified-close back to Website+Proof (`strategy/relay/_RELAY.md`, `2026-07-01 (verified)`); both
threads can now close. Full crypto detail: memory `licensing-fulfilment-workstream`.

**MERGED + PUSHED (2026-07-01, operator-directed):** `feat/licensing-verifier` fast-forwarded to
`main` and pushed (`144211db..6d7cb351`). Main now carries the full licensing verifier + real-license
fixture/test + the dark-theme screengrabs. The 25-commit unpushed lead on `main` (rename/brand work)
shipped in the same push. Only the relay-channel close entries stay uncommitted (strategy repo is
read/write-only — never commit there per the anchor).

## ✅ SHIPPED this session: dark-theme Relay-branded screengrabs + README author-bio drop
Regenerated the 8 `/relay/`-facing screenshots (home-list, tasks-list, apps-starter-to-chat,
costs-list, customers-list, customers-detail, workflows-blueprints, inbox-list) on the current
Relay UI in **dark theme**, replacing the stale May-5 light-theme "ainative business" shots — in
`public/readme/` + `screengrabs/` (commit `72d09016`). Fixed the `customers-detail` honesty gap
(seeded demo env + linked projects + shifted usage-ledger into the 30d window → real `$0.05 · 6
runs` attribution, not $0.00). Removed the `## About the author` section (bio + stale AWS-employer
disclaimer) per operator + Website `later 15` (operator left AWS). All 8 README raw URLs now return
HTTP 200 on `origin/main` (customers-* were 404ing before the push). Answered Website `later 14 + 15`
on `orionfold-website/_RELAY.md` → `later 16`.

## Not-started backlog
- **⚠️ `ainative-business` deprecation message is GENERIC, not a redirect.** DONE-ish:
  `ainative-business@0.14.3` is now deprecated on npm (2026-07-01), but the live message is
  npm's default *"Package no longer supported. Contact Support…"* — it does NOT point users to
  `orionfold-relay`. Re-run to fix: `npm deprecate ainative-business "Renamed → install
  orionfold-relay instead (npx orionfold-relay)"` while logged in as **`manavsehgal`** (the
  personal account that owns it — NOT `orionfoldllc`, which owns `orionfold-relay`). Idempotent,
  re-runnable, non-destructive. (Package was NOT unpublished — correct; existing installs still work.)
- **`/relay/` free-vs-paid boundary is not yet in the README** — README predates licensing.
  Stated to Website in `later 10`; README should eventually gain the section so page+package agree.

## Anchors
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit its
  files, NEVER commit/push/merge. Owning box does git + push. Relay-channel edits are UNCOMMITTED.
- **Licensing code is MERGED to `main` + pushed**; `feat/licensing-verifier` branch DELETED
  (was `6d7cb351`, fully merged). Work directly on `main` here — no worktrees/branches unless
  the operator explicitly asks (memory `work-on-main-no-worktrees`).
- **npm publishing is SOLVED for `orionfold-relay`** via OIDC Trusted Publishing:
  `.github/workflows/publish.yml` publishes on a `vX.Y.Z` tag push, zero tokens/OTP, provenance
  auto-generated (`0.15.1` shipped this way 2026-07-01). Release = `npm version patch && git push
  --follow-tags`. Runbook `docs/RELEASING.md`. NOTE: this OIDC only covers `orionfold-relay`
  (under `orionfoldllc`); `ainative-business` is a separate `manavsehgal`-owned package.
  The old passkey-2FA/bypass-token friction is fallback-only now. See `npm-publish-2fa-friction`.
- Pack plumbing + relay-agency pack + customer ledger DONE (`538121f4` + `3375f325`) — the
  thing the license gates.

## Recently shipped (durable record in git + memory)
- Licensing verifier (`src/lib/licensing/`: canonicalize/verify/gate/load) + entitlement
  field + `--license-url` gate at `pack add` — 62/62 tests, branch `feat/licensing-verifier`.
- `orionfold-relay@0.15.0` PUBLISHED to npm (0.0.1 stub → 0.15.0). Tarball trimmed (tests
  excluded via files[] negation), install-from-tarball smoke verified the gate enforces.
- ainative→relay rename + customer dimension + pack format — DONE (memory `relay-folder-and-remote-renamed`).
