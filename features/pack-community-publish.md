---
title: Community publish flow — github-repo PublisherAdapter + consent ceremony (R7, the only SEND)
status: completed
priority: P1
milestone: 0.37.0
source: _IDEAS/packs-publish.md §7 (Pillar D) / §10 R7
dependencies: [pack-app-exporter]
---

# Community publish flow — the user-owned SEND (R7)

## Shipped implementation — 2026-07-11 (#45)

Issue #45 supplied the real demand signal and unparked R6/R7 together. Relay
now supports the user-owned loop: chat composes an app from profiles,
blueprints, tables, schedules, and a typed view; the user can download the
portable pack; the Pack repository panel previews the exact file tree, sizes,
sample-row count, and artifact hash; and an explicit confirmation publishes
those bytes to a configured public or private GitHub repository.

`github-repo` is a shipped `PublisherAdapter` sibling to `github-pages`. It
creates one atomic Git tree/commit/ref update, preserves unrelated repository
files, and removes only stale paths recorded by Relay's prior pack-publish
marker. A single explicit GitHub connection in Settings is reused by Pack and
Pages publishers. Users may select an existing GitHub CLI session without
copying its token into Relay, or save an encrypted fine-grained token; new
`publishTargets` hold repository coordinates only.
Attempts and named failures reuse durable `deployments`. Chat discovers target
ids but never accepts a GitHub token. Publish refuses when the app changed
after preview.

Relay deliberately does not write an Orionfold-owned index. The repository is
immediately installable by Git URL and honestly classified
`community · unverified`; a maintainer may later add its `repo:` pointer and a
trusted signature to `orionfold.packs/v1`. The index links, never hosts.

As corrected on 2026-07-14, the Pack repository panel is an authoring surface,
not installed-Pack chrome. It renders only for user-created app shells.
Installed official, partner, community, free, and licensed Packs expose no
repository, sample-data, export, publish, or Community-submission controls.
Exporter, publish-job, and Community-submission services enforce the same
origin boundary before reading a repository target or making a GitHub request.

Public and private are equal first-class creator-owned destinations. GitHub
owns the visibility setting; Relay displays it but does not create or change
it. After an exact successful public publish, **Submit to Relay Community**
prepares a structured review request. Maintainers may then validate and add the
creator repository's pointer/signature to the canonical index. Relay never
writes Pack files into an Orionfold-owned community repository.
Community submission additionally requires `pack.yaml` at repository root on
the default branch, matching the current shallow-clone Git installer contract.

## Pre-build source trace (superseded 2026-07-11)

> Note added after a live user asked "when I create a custom pack in chat, where is it
> saved, and can I hook up a private git repo as the destination?" Traced from source to
> record the exact shipped-vs-planned boundary so this spec's builder does not re-trace it.
> A feature request from that user is expected as a GitHub issue; **pull it when it arrives**
> and address it against this spec.

**What ships today:**
- **No in-chat "author a new pack" flow.** Chat only *installs* curated bundled packs (by id,
  via `/api/packs/install`) and *edits* an already-installed app's `manifest.yaml` in place
  (`app-view-tools.ts` → `writeAppManifest`). The composition tools (`create_table`,
  `create_schedule`, `create_profile`, `set_app_view`) mutate live primitives, not a portable
  `pack.yaml`.
- **Where a composed app / installed pack lives:** on-disk **files + DB rows** under the data
  dir (`getAinativeDataDir()`, `~/.relay` by default): manifest at
  `<dataDir>/apps/<id>/manifest.yaml`, profiles at `<dataDir>/profiles/`, blueprints at
  `<dataDir>/blueprints/`, plus DB rows (project, user tables + seeded rows, customers,
  schedules). Standalone chat-authored profiles go to `~/.claude/skills/<id>/`.
- **Git repo as pack SOURCE (install) is shipped** — `relay pack add <git-url>` shallow-clones
  a repo to install a pack (`install.ts` `acquirePack`). CLI only; the API/chat install path
  takes bundled ids, not URLs.
- **The only shipped PublisherAdapter is `github-pages`**, and it publishes a *generated
  Web-Designer site* (a `view.generate` artifact) to the customer's own gh-pages repo — **not a
  pack**. The `publish_targets.target_type` DB enum, the `publish-targets` API
  (`z.literal("github-pages")`), and the adapter registry are all locked to `github-pages`.
- The `orionfold.packs/v1` **index schema + reader are shipped** (`index-schema.ts`), and they
  already model a community pack that lives in the customer's own `repo` (index *links*, never
  hosts) — but that is a **read** path (resolve/fetch), not a publish path.

**What is missing (this spec + [[pack-app-exporter]]):** the `github-repo` PublisherAdapter that
would push a pack tree (`pack.yaml` + `base/` + `pack.sig`) to the customer's own repo. There is
**zero `github-repo` target-type code in `src/` today** — it is planned, not built. So
"publish/store my pack in my own (private) git repo" is designed here but not shipped; only the
reverse (installing a pack *from* a git URL) works. The App→pack exporter (turn a running app
into a `pack.yaml` + `base/`) is likewise `status: planned` and is this spec's `dependencies`.

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
- **Shared credential boundary** — the customer selects one GitHub connection
  method in Settings. A fine-grained token lives once, encrypted; an explicitly
  selected GitHub CLI token remains owned by `gh` and is resolved server-side
  per operation without Relay persistence. Both publishers share the provider.
  New `publishTargets` store owner/repo/branch/directory only. Legacy rows with
  embedded tokens remain masked and readable as a compatibility fallback only
  until the operator explicitly adopts or disconnects shared setup.
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

- [x] A `github-repo` `PublisherAdapter` exists (sibling to `github-pages`), pushing a pack tree
      (`pack.yaml` + `base/`) to the **customer's own** repo in one atomic Git commit.
- [x] The adapter consumes the common `Artifact` contract, so app-exported and hand-authored
      artifact producers share one transport.
- [x] GitHub is connected once in Settings. A saved token is encrypted; an
      explicitly selected GitHub CLI credential is never persisted by Relay.
      APIs return only safe provider/login/hint metadata. New targets contain no
      credential, while legacy target secrets remain masked.
- [x] The publish payload contains **only** the pack tree + Relay-owned path marker — tests assert
      scoped writes/deletes and no instance id, license id, or install-count telemetry.
- [x] The consent ceremony previews **exactly** what leaves the machine (file tree + target repo)
      before any push; the publish is explicit + user-initiated (never background).
- [x] `deployments` shows a durable success + repo URL, or a named error on failure (Principle #1).
- [x] `docs/trust/data-flow.md` gains the user-owned-SEND egress row; it is code-true.
- [x] **Live publish smoke** passes against disposable public and private repositories under a
      real dev server: empty-repo bootstrap, exact-hash publish + republish, unrelated-file
      preservation, root/default-branch install, public-review preparation, private-review
      refusal, shared Pages credential reuse, and disconnect cutoff.
- [x] Targeted exporter/install/chat/publisher tests and TypeScript verification are green.
- [x] Public and private repositories appear in one neutral selector and share
      the same target/test/preview/publish flow.
- [x] Community submission requires a successful exact-hash public publish and
      prepares a review request that links to the creator repository.
- [x] The Pack repository panel and all server-side publish/submission entry
      points are available only to user-created app shells; installed Packs are
      hidden and refused regardless of license tier.

## Scope Boundaries

**Included:**
- The `github-repo` PublisherAdapter (reuse TDR-039 transport + masking + `deployments`).
- The in-product consent ceremony + the leave-the-machine preview.
- The `data-flow.md` user-owned-SEND egress row.
- Preparing the public-repository review request used to link the Pack into the
  community index (`repo:` pointer); maintainer review/signing remains explicit.
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
