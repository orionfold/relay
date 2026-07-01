# Relay — HANDOFF

_Last updated: 2026-07-01 (pt: real prod license VERIFIED — licensing workstream CLOSED)_

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
- **Deprecate legacy `ainative-business`** (do NOT unpublish). `ainative-business@0.14.3`
  still live, points at old repo + `ainative.business`. Plan: `npm deprecate ainative-business
  "<msg → orionfold-relay>"` (optional final `0.14.4` migration-notice). The pointer now
  lands somewhere real (orionfold-relay is published). NOTE: needs its own npm auth — the
  publish token was scoped to `orionfold-relay` only + revoked; a deprecate on a different
  package needs fresh auth (see anchor).
- **`/relay/` free-vs-paid boundary is not yet in the README** — README predates licensing.
  Stated to Website in `later 10`; README should eventually gain the section so page+package agree.

## Anchors
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit its
  files, NEVER commit/push/merge. Owning box does git + push. Relay-channel edits are UNCOMMITTED.
- **Licensing code is MERGED to `main` + pushed** (`main` @ `6d7cb351`, `origin/main` in sync).
  `feat/licensing-verifier` == `main` now; safe to delete the branch when convenient.
- **npm publish auth is painful** (passkey/`auth-and-writes` 2FA; CLI token can't satisfy it).
  This session used a throwaway granular bypass-2FA token (revoked after). Durable fix worth
  doing: GitHub Actions Trusted Publishing (OIDC) — no token, no prompt. See memory `npm-publish-2fa-friction`.
- Pack plumbing + relay-agency pack + customer ledger DONE (`538121f4` + `3375f325`) — the
  thing the license gates.

## Recently shipped (durable record in git + memory)
- Licensing verifier (`src/lib/licensing/`: canonicalize/verify/gate/load) + entitlement
  field + `--license-url` gate at `pack add` — 62/62 tests, branch `feat/licensing-verifier`.
- `orionfold-relay@0.15.0` PUBLISHED to npm (0.0.1 stub → 0.15.0). Tarball trimmed (tests
  excluded via files[] negation), install-from-tarball smoke verified the gate enforces.
- ainative→relay rename + customer dimension + pack format — DONE (memory `relay-folder-and-remote-renamed`).
