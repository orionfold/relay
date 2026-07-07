---
title: Community publish flow — github-repo PublisherAdapter + consent ceremony (R7, the only SEND)
status: planned
priority: P3
milestone: post-mvp
source: _IDEAS/packs-publish.md §7 (Pillar D) / §10 R7
dependencies: [pack-app-exporter]
---

# Community publish flow — the user-owned SEND (R7)

## Description

This is the **payoff of the whole standard** and the **only SEND in `packs-publish.md`**: a
customer publishes a pack — whether Relay-exported (R6, Path 2) or hand-authored (Path 1) — to
**their own GitHub repo**, from which the community index links it. It turns the catalog from an
Orionfold-authored library into a network, and it is the no-marketplace fence's own **named
revisit trigger** (the cut said "revisit only if a real third-party-author demand signal appears";
this manufactures that signal). It is **rightly last** in the sequence: it depends on the index (a
community pack must land somewhere Relay can then resolve — R1), on provenance (community is a
tier — R3), on the exporter (Path 2 — R6), and on the TDR-039 publisher substrate.

The publish half is **not new infrastructure** — it is the TDR-039 `PublisherAdapter` applied to a
new target type (`github-repo`, distinct from the shipped `github-pages`). The Web Publisher
already establishes every mechanic: the user-owned GitHub target via the Contents API, credential
masking (`maskPublishTarget()`), and the `deployments` durable-status surface. R7 adds the target
type + the in-product consent ceremony + the `data-flow.md` egress row.

The promise fence is held **verbatim** (the doc's §2b rule + TDR-039's row-#11 reasoning): the
push is to the **customer's own** repo (their target, their credential, their button-press —
never orionfold.com, never an Orionfold-owned repo write); the index **links, never hosts**; **no
install-state telemetry, ever**; consent is explicit + in-product with a preview of exactly what
leaves the machine. Blast radius is **L** (a new SEND path, a new target type). The consent UX +
the publish transport are recoverable from the completed `marketplace-app-publishing.md` — mine it
and re-target from the dropped app-marketplace onto the customer-owned-GitHub SEND.

## User Story

As a Relay customer with a pack (exported or hand-authored), I want a one-action "Publish as a
community pack" that pushes it to *my own* GitHub repo with a clear preview of exactly what leaves
my machine and a durable success/URL/error status — and that never tells Orionfold who installed
what — so that the community can install my pack while my data and my install-state stay mine.

## Technical Approach

### Entry criteria (must be true before building)

1. **TDR-039 `PublisherAdapter` substrate shipped** — the `github-pages` adapter, the
   `publishTargets` config storage (with `maskPublishTarget()`), and the `deployments` status rows
   all exist (Web Designer substrate Phase 1).
2. **R6 exporter shipped** (Path 2) — R7 publishes *both* an R6-exported pack and a hand-authored
   one; Path 2 is the primary demo but Path 1 must also flow through the same rail.
3. **R1 index + R3 provenance shipped** — the published pack is linked into the community index
   (R1) and carries a community-tier self-signature (R3).

### The new PublisherAdapter target type — `github-repo`

A sibling to the shipped `github-pages` adapter, reusing every mechanic:

- **User-owned GitHub target, user credential, user-initiated push** via the **GitHub Contents
  API** (`architect-report.md:76` — "prefer the Contents API over shelling git"; also avoids the
  heavier `child_process` capability). A community-pack push is the same Contents-API call with a
  pack tree (`pack.yaml` + `base/` + `pack.sig`) instead of a website file set.
- **Credential masking** — the customer's GitHub token lives in a `publishTargets` config row,
  masked at every boundary (`maskPublishTarget()`); "a GitHub token fits the existing pattern — no
  new secrets vault." **Never returned unmasked** (the drift-check discipline, HANDOFF / TDR-039).
- **`deployments` status surface** — fire-and-forget-with-a-durable-status-row (TDR-003): the
  customer sees success + the repo URL, or a named error (Principle #1 — a failed publish is
  visible).

### The consent ceremony (the promise fence, held exactly)

The SEND obeys `packs-publish.md §2b` verbatim — build a deliberate, in-product ceremony:

1. **User-owned target** — the push goes to the *customer's* GitHub repo (their target, their
   credential, their action). Never orionfold.com; never an Orionfold-owned repo write.
2. **Index links, never hosts** — the community index entry carries a `repo:` pointer to the
   customer's repo (R1's `repo` location field), not a mirrored copy. Orionfold curates the link,
   not the content — which is *why* community is "unverified" until signed (R3).
3. **No install-state telemetry, ever** — publishing sends the *pack*, never *who installed what*
   (`_RELAY.md` later-12: "install-state visibility would require a send, which stays forbidden").
   A test asserts the publish payload contains only the pack tree — no instance id, no license id,
   no install counts.
4. **Explicit + previewed consent** — a "Publish as a community pack" action with a **preview of
   exactly what leaves the machine** (the file tree + the target repo), never a background sync,
   never a phone-home.

### The egress row (release-gating)

Adds **one new `docs/trust/data-flow.md` egress row** of the **user-owned-SEND shape** (the
TDR-039 row-#11 shape): "Community pack publish · You click Publish as a community pack · *your*
GitHub repo · the pack tree you're publishing (no install-state) · Don't publish." Trust-doc
claims must stay code-true (HANDOFF caveat); this is the release-gating mechanism (an egress row
change is reviewed at release).

### Prior art to mine (don't rebuild the UX)

`marketplace-app-publishing.md` (status **completed**, superseded by the packs framing) is direct
prior art for an in-product publish flow + consent surface. Mine it for the UX + the consent
ceremony; re-target it from the dropped app-marketplace onto the customer-owned-GitHub SEND. The
exporter (R6) is the genuinely new build; the publish transport + consent ceremony are recoverable.

### Verification (highest-risk path — real smoke, not just units)

Runtime-registry-adjacent + a real SEND → a **live publish smoke** (the TDR-039 substrate smoke
budget: publisher is runtime-registry-adjacent → real dev-server publish, not just unit tests).
Publish a fixture pack to a test GitHub repo; confirm the tree lands, the `deployments` row shows
success + URL, the token is masked at every surface, and the payload carries no install-state.

## Acceptance Criteria

- [ ] A `github-repo` `PublisherAdapter` exists (sibling to `github-pages`), pushing a pack tree
      (`pack.yaml` + `base/` + `pack.sig`) to the **customer's own** repo via the GitHub Contents
      API.
- [ ] Both an **R6-exported** pack and a **hand-authored** pack publish through the same rail (Path
      1 + Path 2, one transport).
- [ ] The GitHub token is stored in a `publishTargets` row and **masked at every boundary** — a
      test asserts it is never returned unmasked (drift check).
- [ ] The publish payload contains **only** the pack tree — a test asserts no instance id, license
      id, or install-count leaves the machine (no install-state telemetry).
- [ ] The consent ceremony previews **exactly** what leaves the machine (file tree + target repo)
      before any push; the publish is explicit + user-initiated (never background).
- [ ] `deployments` shows a durable success + repo URL, or a named error on failure (Principle #1).
- [ ] `docs/trust/data-flow.md` gains the user-owned-SEND egress row; it is code-true.
- [ ] **Live publish smoke** to a test repo passes (real dev-server SEND, not just unit tests).
- [ ] `npm test` green (0 new regressions).

## Scope Boundaries

**Included:**
- The `github-repo` PublisherAdapter (reuse TDR-039 transport + masking + `deployments`).
- The in-product consent ceremony + the leave-the-machine preview.
- The `data-flow.md` user-owned-SEND egress row.
- Linking the published pack into the community index (`repo:` pointer).
- The live publish smoke.

**Excluded (separate requirements / gated / fenced):**
- **The TDR-039 substrate** (adapter registry, `publishTargets`, `deployments`, masking) — a
  *dependency* (Web Designer Phase 1), not built here.
- **The exporter** (app→pack) → `pack-app-exporter.md` (R6). R7 publishes the artifact R6
  produces.
- **Writing into an Orionfold-owned repo on the customer's behalf** — explicitly FORBIDDEN (the
  index links; a maintainer merges the customer's PR).
- **Install-state telemetry / any SEND of user data to Orionfold** — explicitly FORBIDDEN (the
  promise; §11 anti-patterns).
- **A review pipeline / creator portal / ratings** — the cut sub-product; stays cut (§11).

## References

- Source: `_IDEAS/packs-publish.md` §7 (Pillar D — the publish rail, the promise fence held
  exactly, the four consent rules) + §2b (the READ/SEND reconciliation) + §10 R7 + §11
  (anti-patterns — what stays cut).
- Substrate dependency: `features/architect-report.md` (TDR-039 `PublisherAdapter`, Contents-API
  preference `:76`, `maskPublishTarget()`, `deployments` TDR-003 status, the row-#11
  promise-compliance reasoning this SEND obeys verbatim).
- Consent-UX prior art: `marketplace-app-publishing.md` (status completed — mine the in-product
  publish flow, re-target onto the customer-owned-GitHub SEND).
- Depends on: `pack-app-exporter.md` (R6 — the artifact), `pack-provenance-tiers.md` (R3 —
  community tier), `pack-canonical-index.md` (R1 — the `repo:` link), the TDR-039 substrate.
- Promise anchors: `docs/trust/data-flow.md` (the egress inventory + "What never happens"),
  `README.md:107` (canonical promise copy), `_RELAY.md` later-12 (install-state stays forbidden).
- Memory: `phone-home-definition` (SEND of user data forbidden; user-owned push OK),
  `generator-publisher-substrate-tdr039`, `packs-publish-authored` (the reconciliation pattern),
  `strategy-repo-readwrite-only`, `check-git-history-for-prior-art`.
