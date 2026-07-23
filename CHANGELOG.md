# Changelog

## Package lineage

Relay's npm package has used the historical names `stagent` and `ainative`.
Those names remain only where migration compatibility or release history needs
them; the current package and repository identity is Orionfold Relay.

## [Unreleased]

## [0.46.1] — 2026-07-23

### Added

- **Community onboarding now follows the customer’s actual entitlement and
  first-value journey.** Home and Settings explain what Community, premium
  Packs, and managed Host access enable; Relay Agency offers clearly labeled
  synthetic exploration data that can be removed without touching edited or
  customer-created records.
- **One Relay license now unlocks one selectable premium Pack catalog.** Packs
  use compact decision cards, preserve a customer’s selection through the
  license handoff, normalize overlapping bundles, and report partial install
  failures with a failed-only retry path instead of implying a separate
  purchase for every Pack.
- **Provider readiness and task routing now share one verified source of
  truth.** Settings puts compact provider setup before routing, the shell shows
  the number of actually ready runtimes, authenticated Claude Code is selected
  automatically, and an existing Codex login can be explicitly adopted into
  Relay’s isolated credential store.
- **Workflow first value is recoverable.** Blueprint starts preflight verified
  capabilities before creating a run, duplicate submissions converge on one
  workflow, and transient later-step runtime failures can recheck and resume
  the exact blocked suffix without replaying completed work.

### Changed

- **The supported Node.js floor is now Node 22.** Fresh-clone checks cover the
  current Node 22 and Node 24 lines on macOS and Windows with npm 11 and npm 12,
  matching the native SQLite binaries and package-manager recovery paths Relay
  actually ships.

### Fixed

- **The release image passes the current high-severity vulnerability gate.**
  Relay now uses Next.js 16.2.11 and Sharp 0.35.3, and constrains the affected
  PostCSS and Fast URI transitive paths to fixed compatible releases.
- **Fresh provider setup and Agency sample removal now tell the truth
  immediately.** Relay uses Claude's documented CLI status instead of assuming
  macOS Keychain state from a credential file, skips broken Codex PATH shims in
  favor of a healthy official binary, and distinguishes a detected global
  Codex login from Relay's isolated connected session. API-key mode cannot fall
  through to cached OAuth; an importable Codex file can be explicitly copied
  into Relay's isolated owner-only store without mutating the source, while a
  keyring-only login is never exported. Leaving Agency sample data now expires
  the cached app model before refresh, so billed, cost, margin, and client KPIs
  clear immediately.
- **Filesystem skill discovery is quiet and fault-tolerant.** Dangling,
  unreadable, or malformed entries no longer flood the CLI or hide valid
  profiles; one path-free summary points to bounded diagnostics, while a total
  root-scan failure remains a named error.
- **Blueprint Start run is atomic and opens the exact workflow.** Readiness is
  backed by verified provider evidence, failed preflight creates no hidden
  draft, duplicate submissions converge on one run, and toast actions use real
  App Router links instead of inert history mutation.
- **Transient runtime loss pauses a workflow without replaying completed
  work.** Sequence runs distinguish recoverable timeouts, rate limits and
  unreachable runtimes from terminal failures; a bounded **Recheck and resume**
  action preflights and atomically resumes the exact blocked step while
  preserving completed outputs and receipts.
- **Clean npm installs no longer inherit ExcelJS's six stale dependency
  warnings.** Relay's basic XLSX import/export path now uses maintained
  Node 20-compatible reader/writer packages, Recharts' runtime peer is explicit,
  and an exact guard limits the packed install to the one native SQLite warning
  that requires a separately reviewed Node 22 migration to remove.

## [0.45.2] — 2026-07-21

### Added

- **Relay Host now ships a provider-neutral portable Linux VM playbook.** The
  npm package includes `relay-host-playbook`, a strict release manifest,
  secret-free cloud-init template, checksum-pinned bootstrap, and customer
  guide for a compatible Ubuntu 24.04 x86_64 VM. Preflight checks machine and
  network prerequisites, while named mode-0600 receipts distinguish failure,
  dry-run preparation, and successful setup without retaining cloud-provider
  credentials.
- **The matching Relay Cell runtime is public for amd64 and arm64.** Relay Host
  pins the signed `0.45.2` multi-platform image index by immutable digest;
  tags remain discovery aids rather than deployment authority.

### Fixed

- **Release validation now follows the canonical accepted Cell manifest.** The
  Host deployment API regression no longer duplicates an older release string,
  preventing a stale test fixture from rejecting an otherwise valid bound
  release after Cell publication.
- **Release packaging keeps the intended runtime guide and current Workshop
  compatibility window.** The npm boundary rejects directory-level docs
  leakage while allowing the explicitly shipped Host VM guide, and the
  built-in Workshop accepts the complete `0.45.x` line.

## [0.44.9] — 2026-07-20

### Added

- **Relay Host now has a guided DigitalOcean beta path.** Settings separates
  the validated customer-owned Droplet topology from the planning-only cloud
  simulation, and the versioned guide covers account guardrails, authenticated
  HTTPS, first-admin setup, licensing, managed Cells, private runtimes,
  recovery, rollback, updates, troubleshooting, and exact teardown.

### Fixed

- **Remote Host installation and cleanup now pass the customer-owned provider
  contract.** Anonymous public provenance verification, mode-0700 managed-Cell
  ownership normalization, and non-root purge behavior fail visibly and retain
  digest authority.
- **The Orionfold mark is bundled into production output.** Remote login and
  authenticated shell branding no longer depend on the process working
  directory exposing checkout-local public paths.
- **Clean release checkouts understand imported static assets.** The tracked
  Next image type declaration prevents a release-only TypeScript failure while
  preserving the generated `next-env.d.ts` boundary.

## [0.44.5] — 2026-07-19

### Fixed

- **Host and Cell releases now follow an explicit two-stage publication
  sequence.** The OCI candidate can run release quality checks before its new
  digest exists, while npm publication fails closed unless the package version
  is bound to the matching signed Cell tag and immutable digest.
- **The npm release smoke retries its secure-LAN cross-origin probe until the
  production listener answers.** This carries forward the unpublished
  corrective `0.44.4` fix without moving either immutable failed release tag.

## [0.44.4] — 2026-07-19

### Fixed

- **The npm release smoke now retries its secure-LAN cross-origin probe until
  the production listener answers.** Relay prints its production banner before
  spawning `next start`; the prior one-shot fetch could therefore race server
  startup on a slower runner and abort an otherwise healthy release before npm
  publication. A real HTTP response is still asserted immediately, preserving
  the configured origin-security check.

## [0.44.3] — 2026-07-18

### Added

- **Relay now includes an entitlement-gated local Host supervisor.** The npm
  package exposes `relay host` and `relay-host` for content-free Host registry,
  licensed managed-Cell admission, digest-verified OCI acquisition, hardened
  local Docker isolation, idempotent lifecycle, recovery-gated release, and
  explicit crash reconciliation. Direct unmanaged single-Cell use remains
  free and separate from Host capacity.
- **Relay Cell releases have a protected multi-architecture GHCR path.** Exact
  release tags drive native amd64 and arm64 artifact audits, private staging,
  immutable production digests, GitHub OIDC signing, SBOM and provenance
  attestations, a two-platform index, and separately protected stable promotion
  or rollback. Tags aid discovery; Host manifests retain digest authority.

- **Relay Cells now have customer-owned encrypted disaster recovery.** A
  versioned AES-256-GCM bundle carries live-safe SQLite and access backups,
  files, settings/license state, and the Cell secret root under a separate
  customer-held key. Settings and authenticated maintenance APIs create,
  verify, and drill content-free receipts; the CLI adds key creation, explicit
  retention, and guarded offline empty-root restore. A repeatable smoke destroys
  an isolated source Cell and proves database, file, access, and secret recovery.

- **Relay Host fulfillment now has one executable offline contract.** The
  accepted `product:relay-host` grant signs Host and managed-Cell limits,
  licensee, update eligibility, and customer-protective lifecycle rights inside
  the existing Ed25519 envelope. A strict parser, capacity/lapse policy,
  machine-readable schema, exact issuer fixtures, and parity guard keep future
  Website issuance and Host-supervisor enforcement aligned while Relay Core,
  direct single-Cell use, public OCI bytes, and Pack rights remain separate.

### Validated

- **The secure and recoverable Host alpha passed its packaged destruction
  gate.** A fresh npm-installed Relay completed first-admin, session revocation,
  recovery-code rotation, private and remote ingress negatives, responsive
  recovery Settings, encrypted create/verify/drill, source-Cell destruction,
  empty-root restore, and restarted sign-in/work. The rerun proved database,
  files, encrypted settings, license, access state, and Cell identity survived;
  no public artifact, release, or durability claim was made.
- **The Local Host alpha passed its rebuilt-artifact release gate.** A clean,
  optimized linux/arm64 Relay Cell image passed the signed artifact policy and
  complete lifecycle suite, then a fresh-volume customer-identical J0–J3 run
  proved canonical Cell identity and preserved customer, project, document,
  and workflow context through reload. This local acceptance did not publish a
  registry image or cut a public release.

### Fixed

- **Encrypted Cell recovery now carries filesystem-backed licenses.** The
  snapshot and extraction allowlists include the Cell `licenses/` directory,
  with a destruction-and-restore regression protecting paid-state continuity.
- **Foundation workflows preserve customer, project, and document context.**
  Workflow project edits now set, change, or explicitly clear validated links;
  project details identify their customer; project-aware uploads enter the
  expected document pool; and workflow document replacement, readiness, and
  failures remain visible without reporting partial saves as success.
- **Managed OCI Cells now expose one canonical identity.** A validated
  `RELAY_CELL_ID` consistently powers readiness, Instance Settings, and
  task/workflow execution-target context in no-git Cells. Invalid identities
  fail closed with a named error, while direct npx, development, and git-backed
  instance behavior remains compatible when the managed identity is absent.

## [0.43.0] — 2026-07-16

### Added

- **Home uses a denser operational masonry.** Measured responsive grid packing,
  compact activity and progress visualizations, and non-duplicative module
  defaults put more actionable information above the fold without repeating
  menu navigation or telemetry-rail summaries. Attention, activity and outputs
  form a balanced equal-height top row, card actions name their destination,
  and autonomous activity presents safe operator-readable event summaries
  instead of raw provider JSON. A Recently launched card links directly to
  newly shipped product capabilities.
- **Relay can run the first autonomous Operator Workshop locally.** A
  content-addressed, account-free edition now provides deterministic preflight,
  an idempotent Marketing Line starter, five observable checkpoints, named
  rescue, an explicit no-provider rehearsal, Operations Receipt validation,
  and a redacted deterministic capstone archive with the learner-owned app
  Pack and selected outputs.
- **Home is now a configurable adaptive command center.** Typed local modules
  cover operator attention, activity, installed Packs/apps, projects,
  documents, cost, runtime health, quick actions, onboarding, and active
  workshop progress; Dashboard Settings controls visibility, deterministic
  smart ordering, and reset.
- **Tables now offer semantic Render and dense Row modes.** Additive column
  display roles produce titles, abstracts, safe thumbnails, category pills,
  numeric intensity, links, dates, booleans, and metadata while preserving Row
  as the table-detail editing default and using Render in generic app heroes.
- **Workshop production has a versioned cross-project handoff.** The local JSON
  contract carries Relay source identity, a Website offer/access fixture with
  no unauthorized price or SKU, a Motion v1 draft-job seed, a no-founder-touch
  ledger, and explicit launch/revise/stop criteria.

### Fixed

- **Reused demo reset is foreign-key safe.** The seed reset deletes dependent
  workshop and receipt state in the correct order and is regression-tested
  across two reset-and-reseed cycles on the same database.
- **The global error fallback follows Relay's system-cursor policy.** The last
  inline hand-cursor override was removed and the source guard now detects
  quoted React style declarations.

## [0.42.2] — 2026-07-15

### Fixed

- **npm 12 first runs recover from blocked SQLite install scripts.** The packed
  CLI now probes its native binding before importing Relay's database graph,
  visibly performs one package-scoped repair, verifies the result, and otherwise
  stops with a named error plus one exact approved reinstall command. Releases
  are gated by an isolated npm 12 blocked-binding fixture while retaining the
  npm 11 customer production smoke.

## [0.42.1] — 2026-07-15

### Added

- **Task routing now uses an explicit eligible-runtime pool.** Operators can
  keep Latency, Cost, Quality, or strict Manual policy while independently
  choosing and ordering eligible runtimes, previewing current health and
  evidence, controlling automatic fallback, and reviewing a durable runtime
  selection receipt after each attempt. Routing no longer rewrites provider
  credentials, provider models, or the Chat default.
- **Ollama, LiteLLM, and LM Studio now share one truthful setup workflow.**
  Settings consistently validates and saves before testing, redacts optional
  credentials, discovers provider-reported model details, and presents Ollama
  Pull, LM Studio Download, or LiteLLM gateway guidance according to the
  provider's actual capabilities.
- **Every Relay package now carries release-matched product knowledge.** A
  deterministic, incremental bundle compiles verified operator guides and API
  reference into versioned local entries and an index for bounded future Chat
  retrieval. Dirty source state, changed route inventories, tampering, unsafe
  paths, private residue, and package-version drift fail before pack or publish.
- **Grounded Relay help now links evidence and relevant product surfaces.** Chat
  responses can cite release-matched guides and API references with external
  source links, then present clearly separated buttons that navigate to the
  corresponding Relay interface.

## [0.41.0] — 2026-07-14

### Added

- **LiteLLM and LM Studio are first-class self-hosted runtimes.** Each has
  independent Settings, model discovery, truthful requested/effective target
  receipts, and supported Chat, task, workflow, and schedule execution through
  the shared OpenAI-compatible transport.
- **Apps and schedules can enforce explicit operating budgets.** Operators can
  configure per-run, daily, and monthly ceilings with visible notify or pause
  behavior, and portable Packs preserve schedule-scoped policies.
- **Workflow recovery now has an executable state-transition contract.** The
  bounded matrix protects sequence, parallel, loop, delay, human-input, stop,
  and step-retry recovery with real SQLite state and deterministic concurrency
  barriers.
- **Tasks and workflows preview their exact execution target before launch.**
  Run-capable detail views show the resolved profile, runtime, model, and
  selection reason for each executable step; unresolved targets name the
  problem and keep Run or Re-run disabled until the operator edits the target.

### Changed

- **Release qualification now uses one risk-tiered quality contract.** Local,
  merge, and tag workflows share coverage ratchets, mutation checks, runtime
  graph smoke, harness safety, public-boundary checks, and packaged CLI guards.
- **Manual and explicit runtime choices now have distinct, truthful behavior.**
  Manual routing uses Relay's default runtime with auto-routing disabled, while
  a compatible explicit runtime/model is honored exactly. Automatic routing
  may select another healthy compatible runtime and records why.

### Fixed

- **Release qualification is deterministic on clean checkouts.** The shared
  quality contract now builds the bundled CLI before integration tests execute
  it, and isolated runtime/mutation harnesses no longer copy an ignored,
  Next-generated type file.
- **Interrupted workflows now settle truthfully and resume exactly once.**
  Failed parallel branches and loop iterations cannot produce a completed
  parent or receipt; delayed and human-input recovery use durable atomic claims;
  cancellation refusal and duplicate retries return named conflicts.
- **Execution preflight no longer mutates work before target validation.** Tasks
  remain queued and workflows remain unclaimed when a profile, capability,
  runtime, or model cannot resolve; workflow preview, child-task persistence,
  dispatch, receipts, and provider summaries now share the same target truth.
- **Empty Ollama model settings stay empty.** Relay resolves an actually pulled
  model at execution time instead of displaying a synthesized `llama3` default.

## [0.40.0] — 2026-07-14

### Added

- **Installed apps now explain which view kit Relay resolved.** App headers show
  the active kit and whether it was selected explicitly or inferred. An
  optional diagnostics view records the deterministic evidence behind that
  decision and can copy a round-trippable explicit view declaration.

### Changed

- **Pack KPI trends now describe what the measurements actually establish.**
  Comparisons distinguish the first observed value from recent momentum,
  respect whether higher or lower values are favorable, expose accessible
  summaries, and avoid claiming a trend when history is too sparse.
- **List-item hover treatment is consistent across Relay.** Tables, chat
  history, settings rails, Needs attention, and other list surfaces use the
  same semantic fill treatment without adding a second outline or replacing
  the system cursor.
- **The plugin API compatibility window advances to `0.40`.** Relay continues
  accepting `0.39` plugins for the standard one-minor compatibility window.

### Fixed

- **Installed Packs no longer expose repository-authoring controls.** The Pack
  repository section and its server response are limited to custom,
  user-created app shells; installed free, licensed, official, and community
  Packs keep their distribution provenance without presenting creator tools.

## [0.39.0] — 2026-07-14

### Added

- **Schedules and workflows now produce durable Operations Receipts.** Operators
  can declare a deterministic success bar and inspect a per-run `Passed`, `At
  risk`, or `Failed` verdict with criterion evidence, the next action, and links
  back to the source task or Monitor diagnostics.

### Changed

- **Interactive surfaces now use a consistent system-cursor policy.** Relay no
  longer assigns hand cursors; enabled controls, links, rows, and cards instead
  communicate affordance with smoothly eased semantic fill, structural edge,
  active, and focus-visible states across light and dark themes.
- **Fresh-clone contributor setup is explicit and portable.** The documented
  macOS/Linux and PowerShell paths activate development mode and isolated data
  before first boot, tracked Codex hooks use Relay's required Node runtime, and
  bootstrap regressions guard against customer-instance side effects.

### Fixed

- **Inbox task notifications and task-summary panels now match their visual
  affordances.** A task-linked Inbox card opens from its full primary area by
  pointer or keyboard while preserving nested actions, document links, and text
  selection. Task side panels identify themselves as `Task summary` and expose
  distinct, responsive Open details and Close controls.
- **Permission and learning approvals now resolve exactly once across every
  surface.** Allow, deny, question replies, and context decisions commit their
  durable side effects atomically, disappear from the ambient card, detail
  dialog, and Inbox only after acknowledgement, and cannot return from stale
  stream or polling snapshots. Failed actions remain available with a specific
  explanation, and timed-out runtime requests now close durably instead of
  leaving approvals that can no longer unblock work.

### Security

- **Public source and release artifacts now enforce a fail-closed privacy
  boundary.** Internal continuity records remain available locally but are not
  tracked or archived, while the tracked tree, Git archive, documentation
  links, and npm tarball are checked for private machine paths, peer-project
  provenance, retired identities, and other operational residue before publish.

## [0.38.0] — 2026-07-12

### Added

- **Inspect a task's execution history without leaving task detail.** Full task
  pages and task-summary panels now share a bounded, refreshable run timeline
  with attempts, runtime/model details, semantic events, permission decisions,
  visible truncation states, and a direct handoff to filtered Monitor logs.
- **See complete delegated usage receipts when runtimes provide them.** Claude
  Code terminal receipts now include parent and subagent usage and reported
  cost. Task detail, run history, budgets, and Cost & Usage distinguish complete,
  partial, and unavailable accounting instead of presenting partial totals as
  authoritative.
- **Read and navigate generated task output more easily.** Task detail, Inbox,
  workflow results, and rendered documents share safe Markdown hierarchy and
  Insight callouts. Long results expand into a larger reading area, while output
  rows provide explicit View and Download actions and navigate to the rendered
  document without interfering with selection, deletion, or nested actions.

### Fixed

- **Pack KPI trends retain distinct persisted days.** SQLite date bucketing now
  uses the stored epoch-second value directly, restoring multi-day trend series
  and sparklines. Promoted charts also receive a stable initial measurement so
  server rendering and hydration no longer emit invalid-size warnings.

## [0.37.0] — 2026-07-11

### Added

- **Build reusable Relay Packs from a working app.** Chat can compose an app
  from Relay-native profiles, workflows, tables, schedules, and views; the Pack
  panel then previews the exact portable files, sample-data policy, and artifact
  hash before exporting them as a download or publishing them to GitHub.
- **Connect GitHub once and reuse it across Relay publishing.** A single
  verified GitHub connection in Settings now powers both Pack and GitHub Pages
  publishing. Reuse an existing GitHub CLI session without Relay storing its
  token, or save an encrypted fine-grained token. Public and private writable
  repositories appear in the same neutral picker and use the same preview,
  test, and publish journey. Relay pins the CLI username selected during setup,
  so switching the active `gh` account later cannot silently change publishing identity.
- **Submit creator-owned Packs for Relay Community review.** After an exact
  successful publish to a public repository's default branch and root, Relay
  prepares a structured review request for the community index. The index links
  to the creator's repository; Relay does not copy or centrally host the Pack.

### Security

- GitHub tokens remain server-side, are never accepted by chat tools, and are
  omitted from new publish targets. Disconnecting the shared connection also
  disables legacy per-target credential fallback so publishing cannot continue
  silently with an older stored token. Relay never silently adopts a GitHub CLI
  account or contacts GitHub merely because Settings was opened.

### Fixed

- **GitHub CLI works when Relay is launched as a macOS app.** Relay now checks
  standard Homebrew, MacPorts, and Linuxbrew locations when the app process does
  not inherit the terminal's `PATH`.
- **The first Pack publish can initialize an empty GitHub repository.** Relay
  uses the commit returned by GitHub's initialization request, avoiding a brief
  GitHub consistency window that previously left only a temporary init file.
  Retrying also removes any Relay-owned init marker while preserving unrelated files.

## [0.36.5] — 2026-07-10

### Fixed

- **A blank machine can no longer appear authenticated to Claude Code.** Relay
  now distinguishes selecting Claude Max/Pro from completing a real login. Old
  persisted OAuth labels, empty or malformed credential files, SDK startup,
  failed login checks, and connection-test timeouts all remain disconnected.
  A successful SDK result records a separate verification marker, including
  for Claude credentials stored in the macOS keychain.
- **Opening an internal page no longer performs a full document reload.** Chat's
  Settings command, workflow-run toast actions, license links, and workflow log
  links now stay inside Next.js client navigation, preserving the current app
  shell and avoiding disruptive flashes.
- **The repository's Codex hook works from any clone path.** Its secret guard no
  longer points at one developer's absolute filesystem path. The legacy
  waitlist function also uses current Orionfold Relay origins and branding and
  reads its confirmation endpoint from configuration instead of a retired
  hardcoded project URL.

## [0.36.4] — 2026-07-10

### Fixed

- **The Customer dropdown now shows your customers when you create a project.**
  Opening the Customer dropdown in the Create Project panel looked blank even
  when customers existed. The list was actually opening, but it was drawn
  underneath the panel, so you could not see it. The same problem hid other
  menus, dropdowns, and confirmation dialogs opened from inside any side panel,
  such as the delete confirmation when editing a project. All of these now
  appear on top of the panel and work as expected.

## [0.36.3] — 2026-07-10

### Fixed

- **Creating a workflow no longer crashes when you run Relay on a remote
  machine.** Opening the New Workflow screen over a plain `http://` address (for
  example a VM reached by its IP) failed with a `crypto.randomUUID is not a
  function` error. Relay now generates ids in a way that works outside secure
  (HTTPS or localhost) contexts, so workflow creation works on remote hosts.
- **Chat now works with Ollama.** The chat model picker only listed cloud models,
  so even with Ollama connected and tested, chat had no local model to use and
  produced no response. Relay now lists the models you have pulled into your
  Ollama server, so you can pick one and chat with it. Newly pulled models can
  take a few minutes to appear.
- **Failed tasks can be deleted again.** Deleting a task that had already run was
  rejected because its run logs and usage records still pointed at it, so failed
  tasks could not be removed from the card or the detail panel. Deleting a task
  now clears its run history in one safe step. Documents you attached to the task
  are kept and simply unlinked.
- **Settings no longer shows Anthropic as connected on a blank install.** A fresh
  install with no credentials reported the Anthropic API as connected. It now
  reads Disconnected until a real credential is present.

## [0.36.2] — 2026-07-08

### Changed

- **Default card toolbars now match the Projects reference in dark mode.**
  Ready/default cards across Blueprints, Agents, Presets, and other shared card
  surfaces now use the same subtle status-toolbar wash as Projects cards, so the
  bottom status/action row no longer shifts between muted gray and cyan-tinted
  treatments from page to page.
- **Web Publisher taxonomy is back in sync with its manifest.** The release gate
  now recognizes the `web_pages` table and the `pageSlug` column on
  `web_sections`, so the pack-taxonomy smoke check can validate the shipped
  Web Publisher pack again.

## [0.35.2] — 2026-07-07

### Fixed

- **Replaced real Marketing pack examples with synthetic sample data.** Relay CRM
  and Relay Social now ship only fictional seed rows and placeholders. This
  removes internal Orionfold marketing/prospecting examples from the public npm
  package and adds a regression test over the Marketing template surface so
  private campaign, channel, prospect, and provenance markers cannot slip back in.

## [0.35.1] — 2026-07-06

### Fixed

- **Hardened link safety in generated sites.** The new site generator already blocked unsafe link types like `javascript:`. This release closes an edge case where the same unsafe links could sneak past by hiding invisible characters inside them. Any link that is not a plain web, email, or same-site link is now dropped safely. No site could have been affected yet, since the generator is not wired to any button or page in this release, but the fix lands before it is.

## [0.35.0] — 2026-07-06

### Added

- **Packs can now build a website from your data and publish it.** A pack can declare a site to generate from one of its tables and a place to publish it. The first generator turns rows into a single landing page, one row per section (a headline, a feature block, a call to action, or plain text), in the order you set. Only rows you mark published go live, so a draft can never leak. The first publish target is your own GitHub Pages, so the site lives in a repo you own. This release lays the plumbing; the point-and-click Web Designer app that uses it comes next.

## [0.34.0] — 2026-07-06

### Added

- **See your whole funnel as one flow.** Marketing apps now show a live Attract, Capture, Nurture, Convert band across the top of the view. Attract is your reach across active channels, Capture is the leads you touched lately, Nurture is who is in play, and Convert is who you won, each with the mix behind it and the pass-through rate between stages. In the Marketing bundle the same flow spans both your channels and your lead book, so reach and results read against each other. Where two stages count different things, the rate reads as a plain gap instead of a made-up number, so what you see is always honest.

## [0.33.1] — 2026-07-06

### Fixed

- **Automations that fire on a new row now run.** Some packs have workflows that kick off automatically when a new row lands — a new lead enriches itself, a new content asset gets repurposed, a new lease gets abstracted. A few of those were quietly failing right after they fired because they were waiting on a value only a person could type. They now read that value straight from the new row, so they run on their own as intended. Packs that could never auto-run this way are now caught at install time with a clear message instead of failing silently later.

## [0.33.0] — 2026-07-06

### Added

- **A whole marketing function you can install: the Relay Marketing line.** Three new packs cover your marketing work end to end. **Relay CRM** is your lead book — capture leads from your campaigns, auto-enrich and screen each one against a consent guardrail, and move it from first touch to champion, with a four-times-a-day pass that keeps stale leads honest. **Relay Social** is your demand engine — keep an inventory of source content, repurpose it into channel-native creatives the moment it lands, run campaigns from plan to published to measured, track your channels, and gate the paid side on CAC and ROAS. Install either on its own, or buy them together.
- **Buy the whole marketing function as one app: the Relay Marketing bundle.** One install composes Relay CRM and Relay Social into a single app, so campaign performance reads against your real lead book and a new lead can fire a welcome creative automatically. Prefer to wire it up yourself? Install the two packs separately for the same result. One license unlocks every paid Relay pack, and everything installs offline — Relay never sends your data to Orionfold.

## [0.32.1] — 2026-07-05

### Changed

- **A new look for the Relay star.** The brand mark is now a crafted 3D origami star, refreshed across the app, the browser tab, and your home-screen and PWA icons. Same star you know, with real depth and paper texture. Nothing about how Relay works changes.

## [0.32.0] — 2026-07-05

### Added

- **The Agency pack now works for any agency, and your industry gets its own pack.** The free Relay Agency pack is now vertical-neutral: it runs your whole client book, with per-client margin, a new-business pipeline from lead to signed engagement, an intake router, and an on-demand month-end close. Whatever work you deliver, it fits. Two new industry packs carry the vertical delivery work: **Relay CRE** (lease abstraction, listings, and the renewal engine) and **Relay Nonprofit** (grant and donor research, grant cycles, and impact reporting with a deep grant pipeline that fires on its own).
- **Buy your whole setup in one bundle.** Two new bundle packs, **Relay Agency for CRE** and **Relay Agency for Nonprofit**, install the free Agency pack and the matching industry pack together as one app. Install once and get the client book, per-client margin, intake, new-business pipeline, and month-end close, with your industry's delivery work composed right in. Prefer to build it yourself? Install the free Agency pack and add the industry pack on top for the same result.

### Changed

- **Agency Pro is now the automation layer for any agency.** It makes your client book run itself with a scheduled month-end close, auto-routing intake, a new-business machine, and client-safe governance. The commercial real estate and nonprofit chapters moved into the new Relay CRE and Relay Nonprofit packs, so you install exactly the delivery work you sell. Your existing Agency Pro workflows keep running.
- **One license unlocks every paid Relay pack.** The free Relay Agency pack is the only free pack. Agency Pro, Relay CRE, Relay Nonprofit, and the two Agency bundles are all covered by a single license, so you buy once and add whichever paid packs you need.

## [0.31.0] — 2026-07-05

### Changed

- **Every card in the app got a visual lift.** Cards across the app now carry a soft type-colored tint and a large faint background glyph that tells you at a glance what kind of thing each card is: a workflow, an agent, an app, a schedule, a data table, a pack. Featured cards (like the "Start here" workflow on an app's home) stand out with an accent surface and badge. It is the same polished look as the cards on the Orionfold website, applied everywhere.
- **The workflow cards on an app's home page now pack together neatly.** They used to stretch to match the tallest card in each row, leaving empty gaps under the shorter ones. Now each card is only as tall as its own content, so the grid reads cleanly with no dead space.
- **Preset agents and metric tiles are richer.** The built-in agent presets, which used to be plain name-and-description tiles, now show a colored type glyph and a Work/Personal tag. The at-a-glance number tiles on an app's home (billed, costs, margin, and so on) now use a cleaner label-over-number layout.
- **"Schemas" moved from Compose to Data, next to Tables.** Reusable table structures now sit beside the tables they shape, under the Data menu. Nothing about how schemas work changed, only where the menu item lives.

## [0.30.0] — 2026-07-05

### Added

- **Run a blueprint in one click, right from the gallery.** Every card on the Blueprints page now has two buttons. "Run" builds the workflow and starts it straight away (it asks for any inputs first if the blueprint needs them). "Create workflow" builds a draft you can review and run later from the Workflows page. Before, the gallery cards only opened the blueprint; you had to go into the detail page to do anything.
- **Presets now have their own place in the menu.** The built-in agent starting points are now a "Presets" tab next to Agents, so you can browse them directly. You can still reach them from the Agents page with "Start from a preset" exactly as before. Pick one to start a new agent pre-filled from it.
- **Packs page now explains how the free and paid Agency packs relate.** Each card says plainly that Agency Pro installs alongside the free Agency pack and adds deeper workflows, and that nothing you already have is replaced.
- **Filter agents, schedules, and tables by the pack they came from.** The "filter by installed pack" control, already on Blueprints, is now on these views too, so you can narrow a long list to just one pack's items.

### Fixed

- **The free Agency pack no longer shows a phantom "Update" prompt.** Installs from an older version stopped incorrectly offering an update to a version you already had.

## [0.29.1] — 2026-07-05

### Fixed

- **A workflow card that can't load now says so, instead of looking broken.** On your app's home, if one of a pack's workflows couldn't be found (for example after a half-finished install), its card used to show a raw code name and a Run button that did nothing when clicked. That card now says plainly that the workflow couldn't load and to reinstall the pack to restore it, with no dead button to click. Every workflow that is working shows its real name and Run button exactly as before.

## [0.29.0] — 2026-07-05

### Added

- **A settings summary now sits right under the top status bar.** You can see your key settings at a glance without leaving the page: the active model, runtime, routing, license, budget, permissions, web search, and channels. Click "Settings" to expand it into grouped detail, or "Open" to jump to the full settings page. It stays pinned as you scroll.

### Changed

- **The top status bar and app chrome got a cleaner, calmer look.** The status bar reads as one solid band with clear dividers between each reading, so the live figures are easy to scan. The app now shows a faint blueprint-grid texture on the work area behind your content, tuned to stay quiet in both light and dark themes. Everything stays consistent whether you use light or dark mode.

## [0.28.0] — 2026-07-04

### Changed

- **"Profiles" are now called "Agents."** The building block that gives a workflow its instructions and personality is now named an Agent everywhere you see it, which matches how people already talk about it. Your existing profiles carry over automatically on first start; nothing to redo. The page moved from "Profiles" to "Agents," and starting a new one now reads "Start from a preset."
- **Blueprints and Schemas now have their own spots in the top menu.** Workflow blueprints and table schemas used to be tucked away under other pages. Each now has its own top-level place, so you can jump straight to the workflows a pack gave you or the table shapes you can build from, without hunting. The word "template" is gone, which removes the old confusion between the two.

### Added

- **Runnable workflow cards now give you two clear buttons: Run and Create workflow.** On your app's home, a workflow card used to have one button that did something ambiguous. It now offers "Run" to start it right away and "Create workflow" to set one up first. Run does what it says: it builds the run and starts it in one click, so you land on a workflow that is actually going instead of an empty draft.

## [0.27.0] — 2026-07-04

### Added

- **Every profile, workflow, table, and schedule now shows which pack it came from.** When a pack like Relay Agency Pro sets up your app, it drops in a set of profiles, workflows, tables, and schedules. Those lists now tag each one with a small pack label, so you can tell at a glance what a pack gave you versus what you built yourself. On the Blueprints page you can also filter to just one pack's workflows.

### Fixed

- **Your finance app opens with real numbers on the very first run.** Relay Agency Pro's finance page used to open completely empty until you ran a workflow, so a fresh install looked broken. It now comes seeded with a month of sample billing, so you see a working ledger the moment you open it. Clicking "Seed sample data" refills that ledger instead of wiping it clean.

### Fixed

- **"Run now" now tells you the truth about what happened.** Clicking Run on a workflow card used to flash "Run started" even when it only created a draft with no steps to run. The button now says "Draft created" and links you straight to the workflow to finish and start it, so the message matches what really happened.
- **Your app's header shows its real status instead of a fake "Running" pulse.** The header used to show a pulsing "Running" chip on every app, even ones that were idle. It now reads "Ready" when nothing is running, and only shows a live count when work is actually in progress.
- **The app header stays on one clean line.** On wider screens the status chip, Delete button, and manifest link used to break into two ragged rows. They now sit on a single row, and drop together as one group when the screen is too narrow, instead of splitting apart.
- **A failed data seed or clear now explains itself instead of faking a network error.** If seeding or clearing sample data was blocked, you got a misleading "Network error." You now get a clear message about why it was blocked, and the controls are hidden entirely when the action isn't allowed for your setup.
- **First run in a plain folder no longer prints scary git errors.** Two more spots that could leak a raw `git` error line on a first run in a non-code folder are now silenced. Nothing was ever wrong; the noise is gone.

## [0.25.1] — 2026-07-04

### Fixed

- **Automations now work when you run Relay on any port, not just the default one.** If you started Relay on a custom port, behind a proxy, or reachable from other machines, a table automation ("when a high-risk lead is added, create a follow-up task") would quietly do nothing — the trigger showed as active and fired, but the follow-up never appeared, with no error anywhere you could see. The automation now reaches the app at its real address, so the task or workflow it promises actually runs. Fixing that also surfaced a second quiet failure on the same path: a triggered task with no project attached was being rejected and silently dropped; it now gets created.
- **The "Best privacy (local only)" chat model now works on a fresh install.** If you picked the free, local Ollama option at first run, chat and compose did nothing — the box you typed in just cleared, with no message and no error. Local chat now starts correctly and streams a reply from your own machine. And if starting a chat ever does fail for another reason, you now get a clear message instead of a silent dead end.

## [0.25.0] — 2026-07-04

### Added

- **Your app's home now shows every workflow it can run, as a card you can start with one click.** Relay Agency Pro used to open on a single finance screen that hid five of its six workflows — the only way to find them was a buried menu. The home page now lays out all six as cards, each with a plain-language line about what it does, its last run, and a Run button. The best one to try first is flagged "Start here," and workflows that run on their own when you add a row say so instead of showing a button that would fight them. A short line up top explains the difference between a workflow (the template) and a run (one time it goes).
- **Workflows can now pause to ask you a question, then keep going.** A workflow step can stop mid-run to ask for something it needs from you — an approval, a missing detail — and wait for your answer in your Inbox instead of guessing or failing. It holds for as long as it takes, with no silent timeout, and once running or waiting, the workflow header points you to exactly where to go next: watch the steps below, or answer in your Inbox.

### Fixed

- **The date on your license now reads correctly everywhere.** The renewal date could show a day early depending on your time zone. It now reads the same true date for everyone.
- **A first run in a folder that isn't a code project no longer prints a scary error.** Starting Relay somewhere without a git repo printed a raw `fatal:` line that looked like a crash. That noise is gone; nothing was ever actually wrong.
- **The empty app screen no longer promises something it can't do.** An empty-state hint suggested importing a CSV in a spot where that never actually ran. The copy now matches what the app really does.
- **The app-detail page is cleaner and easier to act on.** The toolbar collapsed to a single row, a direct Delete button replaced a hidden menu step, and the manifest section's arrow now points the right way when collapsed.

### Fixed

- **Restoring a snapshot no longer hangs the app.** Rolling back to an earlier snapshot could freeze — the restore waited on a lock it was itself holding, so it never finished and the request just spun. Restore now completes, and if a snapshot is genuinely busy you get a clear "snapshot is in use, try again" message instead of a silent hang.
- **Local Ollama chat no longer fails on a model you never installed.** Picking Ollama could try to run a default model that was not actually pulled on your machine, so the chat errored out with a confusing model-not-found. Relay now runs the model you asked for, or falls back to your default or the first model you have actually pulled, and if you truly have none it says so plainly instead of failing on a phantom name.
- **Profile cards now name every runtime a profile covers.** On the Profiles page, the runtime row on each card read "Claude Codex Claude Claude Claude" — four different runtimes all mislabeled "Claude", including local Ollama. Each chip now shows its real runtime: Claude, Codex, Anthropic, OpenAI, and Ollama (Local), so you can see at a glance that a profile runs free and local too.

## [0.24.0] — 2026-07-03

### Changed

- **The price shown in the app can no longer disagree with the website.** Every release now checks the premium pack's listed price against the canonical price published on orionfold.com before it ships, so the founding and list prices you see on the packs gallery always match the store. If the check cannot reach the website, the release goes out anyway, so a network blip never blocks a good build.
- **The words in the app read cleaner.** A pass over every on-screen message, empty state, and button hint replaced the long dashes that made copy feel machine-written with plain, short sentences, and it fixed a few spots where an old product name still slipped through in the assistant's own voice and settings labels. Nothing moved or changed what it does; it just reads the way a person would say it.
- **Webhook notifications now identify themselves as "relay".** Messages sent to a webhook you configure carry a `source` field so your receiver can tell where they came from. That field now reads `"relay"` to match the product name; it used to carry the old name. If you built a rule or filter on the old value, point it at `"relay"`.

### Fixed

- **Your dark or light theme now survives an upgrade.** The app stored your theme choice under an old product name. After updating, the very first page could briefly flash the wrong theme, or forget your choice entirely, until you set it again. The app now reads your saved choice under both the new and the old name, so your theme carries over with no flash and nothing to reset.
- **Installing a pack from the Packs gallery now works.** Clicking "Install" on any pack — free or premium — used to fail with a confusing version error ("requires relay-core, but this install is 0.0.0"), so the only way to add a pack was the command line. The gallery button now installs correctly, and premium packs take you straight to the license step instead of dying on the version check.
- **A pack you install from the command line shows up right away.** After adding a pack with `relay pack add` while the app was running, its workflows stayed invisible until you restarted the server. The running app now notices new packs on its own and picks them up without a restart.
- **Your first-launch model choice can no longer be lost to a fast click.** Picking a model in the "Pick your default chat model" dialog and immediately navigating to another page could silently drop your preference — the save was cancelled mid-flight and the dialog re-appeared later as if you'd never answered. The save now survives navigation, and if it genuinely fails the dialog says so and lets you retry instead of closing as if it had worked.
- **A fresh install no longer greets you with red errors.** First boot on an empty data dir printed several `ALTER TABLE failed: no such table` errors before "Database ready." — harmless setup ordering, but it read as a broken install. The first thing a new install prints is now simply "Database ready."
- **`--data-dir` now works when you install packs and licenses too.** Running `relay pack add …`, `relay license add …`, or `relay plugin …` with `--data-dir <path>` used to ignore the flag and write to your default data directory instead — so a pack could land where the app you meant to run never looks for it. All three commands now honor `--data-dir`, an explicit flag wins over an auto-created `.env.local`, and pointing a one-off install at a custom directory no longer leaves a stray `.env.local` behind.

## [0.23.0] — 2026-07-02

### Added

- **The Packs page now makes the case before asking for the card.** The premium pack's full pitch — all six chapters of what Agency Pro actually does — is readable right on the page instead of truncated to two lines, laid out as a proper feature panel with the offer beside it. Each pack gets its own icon, and Free/Premium filter chips keep the gallery browsable as the catalog grows.
- **The price you see in-app is the price you pay.** Packs can now carry a founding/introductory price alongside the list price, so Agency Pro shows the real offer — **$349/year founding, $499/year after** — exactly matching [orionfold.com/relay](https://orionfold.com/relay/). Previously the app showed a flat $499 and the checkout page said $349; that contradiction is gone. Still computed entirely from files on your disk — no price fetch; Relay never sends your data to Orionfold.

## [0.22.1] — 2026-07-02

### Fixed

- **The first number you see is now your real spend.** On a fresh install, the dashboard's cost tiles read "COST TO DATE $20.00" before you had spent a cent — that was your Claude subscription's monthly price wearing a cost label. The tiles are now **SPEND TODAY / SPEND TO DATE** and show only metered usage summed from your local ledger ($0.00 until you actually run something). Your plan price and budget cap still appear, labeled as what they are: "+ plan $20.00/mo" or "of $20.00 budget".
- **Your model choice now applies everywhere, not just chat.** If you picked "Balanced" at onboarding, workflow and task runs were still silently executing on the premium Opus tier — billing quality-tier prices for work you asked to run on Sonnet. Task, workflow, and AI-assist execution now honor your preference on every runtime (Claude Code, Anthropic Direct, OpenAI Direct); an explicit per-profile or per-runtime model pin still wins, and the model each run actually used is visible on the task card and monitor feed.
- **$0 local runs now count.** Chat turns on a local Ollama model were never recorded in the usage ledger, so Cost & Usage couldn't show the savings your local runs earn. Every Ollama chat turn now lands in the ledger with its real token counts at $0.00 ("local-free") — the blended paid-vs-free picture on /costs finally proves what running local saves you.

## [0.22.0] — 2026-07-02

### Added

- **Renewal, argued with evidence.** When your license approaches renewal, Relay now shows you exactly what the year delivered instead of a generic reminder:
  - **`relay license status` recaps your term.** If an update you already paid for is sitting uninstalled, status names it — "Included in your term, waiting to install: Relay Agency Pro v0.2.0 — the Nonprofit deep chapter…" — with the one command that installs it. Inside 30 days of expiry, the renewal warning cites the year's specific deliveries alongside the standing promise that your installed packs are yours forever. An expired license gets the same honest voice: nothing is locked, and here — by name — is what renewing unlocks.
  - **The update refusal names what it's withholding.** If your license has lapsed and you run `relay pack update`, the refusal now states not just that a license is needed but what the update contains, pulled from the pack's own changelog. Same message in the CLI and the Packs page API.
  - **The Packs page says what an update is.** The "Update to vX.Y.Z" button now carries the version's one-line description, so you know what you're getting before you click.
  - **Packs carry their own history.** Pack authors can add a `changelog:` map to `pack.yaml` (version → one line, in the customer's language). Agency Pro ships with entries for 0.1.0 and 0.2.0, and every future paid pack update will add its line. This one map is the single source for every recap surface above — and for the renewal reminder email.
  - What this feature deliberately is NOT: no startup-banner upsell (that space stays yours), no launch nags, no data sent to Orionfold — the recap is computed entirely from files on your disk. And per [orionfold.com/promise](https://orionfold.com/promise/), nothing here can ever touch content you already installed.

## [0.21.0] — 2026-07-02

### Added

- **`relay pack update` is real — and Agency Pro v0.2.0 is the first paid update it delivers.** When we sold Agency Pro we made a promise on the locked card: "Nonprofit deep chapter arrives in v0.2.0 as your first included update." Both halves of that sentence now exist:
  - **The update workflow (free, for every pack).** `relay pack update <id>` brings an installed pack to the newer bundled version — or from a folder/git source with `relay pack update <id> <source>`. `relay pack list` now shows each pack's installed version and flags `[update available → vX.Y.Z]`, and the Packs page grows an "Update to vX.Y.Z" button that does the same in one click. Updates are additive by design: your tables are reused (never re-seeded), your schedule state (pause, run counts) survives, and nothing you have is ever deleted.
  - **Your edits are backed up, never lost.** If you've customized a file a pack installed (a profile's SKILL.md, a blueprint), the update copies your version to `apps/<pack>/backup/<old-version>/` before laying down the new content, and tells you exactly what it backed up. Installs made before 0.21.0 have no edit-tracking record, so updating one backs up everything first — cautious by default.
  - **Agency Pro v0.2.0: the nonprofit deep chapter.** A grants pipeline that runs the full lifecycle: drop a grant opportunity into the new `grants` table and the deep blueprint fires by itself — absolute-dated deadline chain, a weighted go/no-go fit score with the pursuit-plus-compliance economics stated, an LOI/application draft where every claim is cited or flagged for client data, and a post-award restricted-funds compliance calendar so awarded money never becomes unmanaged risk. If you bought Agency Pro on 0.1.0: `relay pack update relay-agency-pro` and the chapter lands.
- **The never-re-lock promise, now enforced at the update gate.** Updating a premium pack re-checks your license the same way installing does — offline, against the license file on your disk, never a server. If the license is missing or expired, the update refuses with the honest message: your installed pack keeps working, nothing is locked, renewing gets you the new version. No online re-validation, no data sent to Orionfold, and expiry never touches what you already installed — same terms as [docs/trust/license-terms.md](docs/trust/license-terms.md) and [orionfold.com/promise](https://orionfold.com/promise/).

## [0.20.0] — 2026-07-01

### Added

- **The enterprise trust pack** — every question a security evaluator asks now has a written, linkable, code-linked answer in [`docs/trust/`](docs/trust/):
  - **[Data flow](docs/trust/data-flow.md)** — the complete inventory of every outbound network call the product can make, verified against the code with file references. The headline, now provable rather than asserted: for a plain `npx orionfold-relay` install, the only always-on call is a checksum-verified download of the server build from GitHub Releases. No telemetry, no analytics, no update checks, no license server, no calls to orionfold.com — and the calls that do exist (your model providers, channels you configure, tools you enable) each list their trigger, destination, what's sent, and the off switch.
  - **[Security packet](docs/trust/security-packet.md)** — a two-page overview you can hand to a security review as-is: architecture, the "we host no customer data" argument and its basis, the subprocessor picture (none, in the SaaS sense — the parties in the path are chosen by and contracted to you), application posture, and disclosure process.
  - **[Supply-chain verification](docs/trust/supply-chain.md)** — how to verify the package you install is what CI built, before you run it: npm provenance attestations (`npm audit signatures`), the sha256-verified build artifact, and version pinning that means something because nothing self-updates.
  - **[License terms in plain language](docs/trust/license-terms.md)** — what a seat is (defined by trust, audited by you with `relay license status`), how transfer works, and exactly what expiry does and doesn't do, each claim linked to the enforcing code.
  - **[Continuity](docs/trust/continuity.md)** — what happens to your deployment if Orionfold disappears: Apache-2.0 engine + local SQLite + offline licenses means you keep everything you have, and the honest edge cases are written down too.
- **CycloneDX SBOM with every release** — from this release onward, a software bill of materials of the production dependency tree is attached to every GitHub Release (`orionfold-relay-<version>.sbom.cdx.json`), generated in the same gated publish workflow that builds the package. Feed it to Dependency-Track, Grype, or your scanner of choice.
- **`SECURITY.md`** — private vulnerability reporting via GitHub security advisories, with a 72-hour acknowledgment commitment.

## [0.19.0] — 2026-07-01

### Added

- **Relay Agency Pro — the first premium pack.** The free Relay Agency pack runs a workflow; Agency Pro runs your agency. Five chapters, installable with `relay pack add relay-agency-pro` (or one click from Compose → Packs) once your license is redeemed:
  - **Finance cockpit** — an engagements ledger with a margin dashboard (billed, costs, and margin month-to-date) and a month-end close that runs itself: a scheduled agent rolls up every client's month, drafts the invoice lines, and flags margin drops before you've had coffee on the 1st.
  - **Intake pipelines** — drop a row into the intake table and the right client workflow fires by itself: lease abstraction, grant intake, bookkeeping entry, or new business, each routed under the right client with the queue status kept honest.
  - **New-business machine** — prospect research with citations, a capability pitch, a scoped proposal with visible assumptions, a draft engagement letter, and a staged kickoff so a won deal becomes an operating client without a dropped handoff.
  - **Client-safe governance** — every Pro agent ships hardened (explicit tool allowlist, shell denied, bounded turns), plus a per-client audit export: runs, spend, and approval trail, client-ready, failures included. A local-only analyst profile (Ollama) handles donor-PII and confidential material that must never leave the machine.
  - **CRE renewal engine** — deep lease abstraction (critical dates, escalations, CAM economics, option mechanics), renewal-decision analysis with the do-nothing cost, normalized comps, a draft LOI, and a portfolio rent roll sorted so nothing expires unnoticed. The nonprofit deep chapter arrives in v0.2.0 as the first included update.
- **Packs can now schedule work and react to your tables — free for everyone.** Two engine gaps found while building Agency Pro are fixed for every pack, free or premium: a pack that declares a row-insert trigger now actually fires when you add a row (the authored table reference is rewritten to the real table at install), and a pack that declares a schedule now registers a real schedule you can see on the Schedules page (re-installing never resets its state; uninstalling cleans it up; the dashboard's "next run" tile reads it live). Packs installed from the running app are usable immediately — no restart needed.

### Changed

- `relay pack add` now reports registered schedules alongside tables, profiles, and blueprints, so nothing a pack materializes is invisible.
- The publish smoke gate now exercises the real premium pack end-to-end: unlicensed refusal, license redemption, no-flag install, and the packs-stay-installed promise after license removal.

## [0.18.0] — 2026-07-01

### Added

- **A Packs page in the app** — packs were previously CLI-only, installable only by a filesystem path buried in `node_modules` that no one would guess. **Compose → Packs** now shows every pack bundled with your install: what it contains (profiles, blueprints, tables), what it seeds, and a one-click **Install** that materializes the same app/customers/tables the CLI path does. Premium packs are visible there too — locked, with what-you-get, the price, and a **Get license** link — so you can see what a license unlocks before you buy. Nothing is hidden, and nothing installs without entitlement.
- **Install packs by name** — `relay pack add relay-agency` now works. A bare name resolves to the bundled pack of that id; folder paths and git URLs still work exactly as before (an existing local folder always wins over a bundled name). Unknown names list the packs your install actually bundles.
- **Settings → License** — activate and inspect licenses without a terminal. Paste (or upload) the `.license.json` from your fulfilment email; Relay verifies it offline and shows the same activation summary the CLI gives: who it's licensed to, what it unlocked, where it's stored. The page reads the exact same license store as the CLI banner and `relay license status` — one identity, no drift. Removing a license from here carries the standing promise in writing: installed packs stay installed.
- **Premium installs from the UI use your saved license automatically** — if a pack needs a license you've already redeemed (CLI or web, either), the gallery installs it with no proof re-supplied. If not, the card points you to Settings → License instead of dead-ending.

### Changed

- The Apps page's empty state now offers "Install a pack" alongside starting in chat, so a fresh install can find the vertical content that makes Relay useful.

## [0.17.0] — 2026-07-01

### Added

- **Relay now remembers your license** — previously a premium-pack license was verified once at install and then forgotten: every launch still greeted you as "Community Edition," and every premium install demanded `--license-url` again. Redeeming is now a one-time act: `relay license add <path-or-url from your fulfilment email>` verifies the license (offline, Ed25519 — no server contact, ever), saves it under your data directory (`licenses/`), and walks you through an activation summary: who it's licensed to, what it unlocks, and where it lives. From then on, entitled packs install with a plain `relay pack add` — no flags — and every launch greets you by name: `Orionfold Relay 0.17.0 — Licensed to <you>`.
- **`relay license status`** shows your saved licenses with identity, term, seats, and entitlements — re-verified live at read time, so what it says is what the verifier actually concludes. Approaching expiry (≤30 days) shows a renewal reminder; expiry never blocks anything you already installed.
- **`relay license remove <id>`** forgets a saved license. Installed packs stay installed — your packs are yours forever; a license only gates *new* premium installs and updates.
- **`relay pack list` marks premium packs** with a `[premium]` tag so you can tell licensed content from free packs at a glance.
- **README "Free vs paid" section** — the boundary in writing: the engine is free (Apache-2.0, no tiers, no feature locks), premium packs are paid content on top, verification is offline, and what's free stays free.

### Changed

- The "missing license" refusal for premium packs now points at `relay license add` (redeem once) as the primary path, with `--license-url` retained as a per-install alternative.

## [0.16.0] — 2026-07-01

### Added

- **`npx orionfold-relay` now runs a real production build** ([#10](https://github.com/orionfold/relay/issues/10)) — every install previously ran Next.js in development mode, the root cause of a whole class of first-impression problems: the endlessly retrying HMR websocket console spam ([#7](https://github.com/orionfold/relay/issues/7)), the `Can't resolve <dynamic>` warning ([#8](https://github.com/orionfold/relay/issues/8)), a "Mode: development" banner on a released install, slower on-demand compilation, and the dev-only cross-origin gate behind the LAN-access reports (#5/#6/#11/#12/#13). On the first launch of a version, the CLI now downloads that release's CI-built production bundle (~36 MB, once per version, cached under your data directory in `builds/`) from GitHub Releases, verifies its checksum, and starts in production mode. The npm package itself stays small (~1.4 MB). If the download fails — offline, firewalled — Relay prints a clear warning and falls back to dev mode exactly as before, so the floor is the status quo; `RELAY_BUILD_ARTIFACT_URL` can point at a mirror (or a local file) for air-gapped setups.

### Changed

- **LAN use no longer depends on the dev-origin allowlist** — with the production build, `/_next/*` assets serve cross-origin without Next's dev-mode origin gate, which durably fixes the `--hostname 0.0.0.0` → other-machine topology (the 0.15.5 RFC1918 allowlist remains only for the dev-mode fallback path).
- **`next` is now pinned exactly** (16.2.4) so the downloaded production bundle always matches the runtime version your install resolves — you run the same bits CI built and smoke-tested.
- **Release CI now rehearses a real customer install before publishing** — every release packs the npm tarball, installs it into a clean directory, boots it against the freshly built production bundle, and checks the LAN cross-origin and download-failure paths. A release that fails this rehearsal never reaches npm.

## [0.15.5] — 2026-07-01

### Fixed

- **LAN access no longer blocked by a cross-origin error** ([#13](https://github.com/orionfold/relay/issues/13)) — after binding to the network with `--hostname 0.0.0.0`, opening Relay from another machine failed with "Blocked cross-origin request to Next.js dev resource" and a broken UI. When you opt into LAN binding, Relay now trusts private-network (RFC1918) origins so the app loads normally from other machines on your LAN. Public origins remain blocked. (A future release will ship a production build for `npx`, which removes this dev-mode restriction entirely.)
- **Providers & Runtimes settings no longer spin forever on error** ([#9](https://github.com/orionfold/relay/issues/9)) — if loading the provider configuration failed, the Settings section showed an endless "Loading…" card with no explanation. It now surfaces the error and a **Retry** button so you can see what happened and try again.
- **UI scales up on high-resolution 4K displays** ([#4](https://github.com/orionfold/relay/issues/4)) — text and spacing were fixed to a small base size, so everything looked tiny on a 4K screen and needed browser zoom to read. The interface now scales up gradually on wide/high-resolution displays (comfortable by ~4K) while staying exactly as-is on standard laptops and monitors.
- **Correct dev-mode env-var name in Settings** — the Instance panel's "Dev mode" notice told you to set `AINATIVE_INSTANCE_MODE=true`, a stale name left over from the rebrand; the app actually reads `RELAY_INSTANCE_MODE`. Following the old instruction silently did nothing. The notice now shows the correct variable.

## [0.15.4] — 2026-07-01

### Fixed

- **Compose no longer creates duplicate projects** ([#3](https://github.com/orionfold/relay/issues/3)) — when you describe an app for a named client ("build a Contractor Invoices app for Acme Renovations"), Relay now reuses an existing project of that name instead of quietly creating a second one. A full multi-artifact compose (project + profile + table + workflow + schedule) completes end-to-end and creates each artifact exactly once.

### Changed

- **Chat approvals are more robust under back-to-back tool prompts** — hardened the permission-request bridge so that when one approval is pending, a second approval that arrives right after surfaces immediately rather than appearing to hang. Most chat tools are auto-approved and never showed this, but tools that do prompt (some browser and external-tool actions) could previously stall for up to two minutes waiting for the next prompt to appear; they now advance without the wait.

## [0.15.3] — 2026-07-01

### Added

- **`--hostname` flag** — the CLI can now bind to a host other than loopback, e.g. `npx orionfold-relay --hostname 0.0.0.0` to expose Relay on the LAN (requested for headless/Alpine deployments). Defaults to `127.0.0.1`. Because Relay is local-first with no network authentication, binding to a non-loopback host prints a security warning, and the auto-open browser step opens the loopback URL (a `0.0.0.0` address isn't browsable). The host is forwarded to Next's `--hostname` and reflected in the startup URL.

## [0.15.2] — 2026-07-01

### Fixed

- **WSL/UNC-path crash on first run** ([#1](https://github.com/orionfold/relay/issues/1)) — running `npx orionfold-relay` from a `\\wsl.localhost\...` UNC path made `CMD.EXE` silently reset the working directory to `C:\Windows`. The first-run `.env.local` auto-writer then threw an unhandled `EPERM` writing to that protected directory and crashed the CLI before it could start. The auto-write is now non-fatal: on failure it warns, falls back to the default `~/.relay` data directory, and (for a Windows-dir cwd) prints WSL-specific guidance to relaunch from the Linux filesystem.

## [0.14.0] — 2026-05-05

Batched release covering the Self-Extending Machine M1–M5 milestone arc plus three net-new product surfaces (Apps, Conversation Branches, Plugins). 247 commits, 731 files changed, +72,735 / −1,209 lines since 0.13.2. No breaking changes.

The unreleased `0.13.3` entry below is folded into this release — that fix shipped to `main` but was never published to npm, so end users move from `0.13.2` straight to `0.14.0`.

### Added — Apps platform

- **Composed apps** — a new top-level `/apps` route plus `/apps/[id]` detail view that bundles existing primitives (agent profiles, workflow blueprints, user tables, schedules, document routing) into focused, kit-aware experiences. There is no new code in an app — only a YAML manifest at `~/.ainative/apps/[id]/manifest.yaml` referencing existing primitives by slug.
- **Six kits** — Tracker, Coach, Ledger, Inbox, Research, Workflow Hub — each with a distinct visual layout and intent. The kit reflects the *purpose* of an app, not just its data shape.
- **Starters showcase** — one starter per kit on the Apps page; clicking a starter opens a chat conversation pre-seeded with a manifest-authoring prompt.
- **Manifest authoring tools** — three chat tools (`set_app_view_kit`, `set_app_view_bindings`, `set_app_view_kpis`) let users edit a composed app's view configuration via natural language without ever opening a YAML file.
- **Manifest trigger dispatch** — apps can fire a workflow blueprint on row-insert, with `{{row.<col>}}` template resolution and notification on dispatch failure.
- **Apps API** — `/api/apps`, `/api/apps/[id]` for CRUD; `listAppsCached` with 5-second TTL and invalidation on manifest mutations.
- **Apps registry seeded with 6 starters** (one per kit) plus dogfood examples for reading-radar and others.

### Added — Conversation Branches (chat)

- **Rewind / Redo / Branches** — a chat conversation can be rewound to any prior message (⌘Z), redone (⌘⇧Z), or branched at any turn. Branches are persisted with a tree visualization in the branches dialog.
- **API surface** — `/api/chat/conversations/[id]/rewind`, `/redo`, `/branches`, plus `/api/chat/branching/flag` for opt-in.

### Added — Plugins (Self-Extending Machine M3, kind-1)

- **MCP-as-extension surface** — third-party and self-authored plugins ship a `.mcp.json`; registration reuses the existing `withAinativeMcpServer()` plumbing instead of a custom plugin SDK.
- **Plugin API** — `/api/plugins`, `/api/plugins/scaffold`, `/api/plugins/reload`. Self-authored plugins get zero-ceremony registration; third-party plugins flow through the M3 trust pipeline (gated behind flags).

### Added — Self-Extending Machine M4.5 (nl-to-composition-v1)

- **Natural-language → composition pipeline** in chat: pattern-based 3-verdict intent classifier, primitive map (keyword → profile + blueprint), composition hint builder (advisory system-prompt block), scaffold-path short-circuit in `engine.sendMessage`, and `ExtensionFallbackCard` rendering for unhandled cases.

### Added — Self-Extending Machine M5 (install-parity-audit)

- **npm publish parity audit** — `npm files` array now includes `book/chapters/` and `ai-native-notes/*.md` so an `npx`-installed instance has feature parity with a `git clone` instance (book reader and notes browser both work).

### Added — Other

- **Onboarding runtime provider choice (P2)** — first-launch flow asks the user to pick OAuth vs. API key, then auto-writes `.env.local` accordingly.
- **Task turn observability** — `tasks` table gains `turnCount` and `tokenCount` columns; agent runs report cumulative turn and token usage per task.
- **Schedule auto-stagger** — collision prevention now active in the schedule UI; same-cadence schedules get auto-jittered start offsets.
- **App-composition guidance** for new users on dashboard + chat.
- **Relationship cards** on tasks/projects show document counts.
- **View-kit shape inference** — `hasMessageShape`, `hasNotificationShape`, hero-table consultation rules for inbox kit selection.
- **Profile synthesis from app manifests** — inline profile refs in app manifests are auto-registered.
- **Reading-radar dogfood plugin bundle** + smoke handoff scripts.

### Changed

- **Database schema** — additive only. New migration `0027_add_tasks_context_row_id.sql` adds `context_row_id` to `tasks`.
- **Workflows engine** — stamps `tasks.context_row_id` from workflow definition; `instantiateBlueprint()` accepts `metadata._contextRowId`.
- **Runtime errors** — `NoCompatibleRuntimeError` now names the profile + runtime gap so users see exactly which combination failed.
- **App view editor** — `AppViewEditorCard` renders proposed view changes; clicking Apply rewrites the manifest atomically.

### Fixed

- **Settings → Instance no longer shows a false "setup incomplete" warning on npx installs.** The bootstrap correctly skips when there's no `.git/` directory (per `ensureInstance()`'s decision tree), but the Settings UI was treating that skip as a failure. `GET /api/instance/config` now returns `skippedReason: "no_git"` in the npx case, and the `InstanceSection` component renders an accurate "npx install — upgrade via `npx ainative-business@latest`" notice instead of the amber warning and dead-end "Run setup" button. *(Originally prepared as 0.13.3; folded into this release.)*
- **Apps cache invalidation on manifest mutations** — manifest writes now correctly invalidate `listAppsCached` so the gallery never shows stale entries.
- **Apps dispatcher resilience** — tolerates `listAppsWithManifestsCached` failures and writes a notification on dispatch failure rather than silent drop.
- Various test-infrastructure fixes (40 enrichment-planner unit tests + 11 route tests, M4.5 compose-path Skill-deny coverage, etc.).

### Compatibility

- No breaking changes. Existing `~/.ainative/` data directories, agent profiles, workflow blueprints, and chat conversations continue to work without migration.
- `~/.ainative/apps/` is a new directory that is created lazily on first app install.
- Plugin trust for third-party MCPs remains gated behind flags pending future hardening.

## [0.13.2] — 2026-04-18

### Fixed

- **`npx ainative-business` isolated-data-dir Fix button now persists.** The CLI previously used Next.js-style env precedence (shell env wins over `.env.local`), so a stale `AINATIVE_DATA_DIR` shell export silently defeated the sidebar's Fix action on every restart. `bin/cli.ts` now treats the launch folder's `.env.local` as authoritative, matching a CLI launcher's semantics.

### Changed

- **First-run auto-writer.** The first `npx ainative-business` invocation in a non-dev folder now writes `.env.local` with `AINATIVE_DATA_DIR=~/.<folder>` automatically. New users see a green data-dir chip on first launch — no red badge, no manual Fix click, no restart cycle. Skipped in the main dev repo (`AINATIVE_DEV_MODE` / `.git/ainative-dev-mode` gates) and when the user has already chosen an explicit shell override.
- **Clearer post-Fix copy.** The sidebar's "restart to apply" hint now reads "Ctrl-C, then re-run npx ainative-business" so users know the exact action.

### Added

- Regression coverage: `src/lib/__tests__/cli-env-local.test.ts` — 6 subprocess tests for `.env.local` precedence, auto-writer happy path, and every skip condition.

## [0.12.1] — 2026-04-18

### Changed

- **npm package renamed** from `ainative` to `ainative-business`. Install with `npm i ainative-business` or run `npx ainative-business`. The CLI binary remains `ainative`.
- **Brand wordmark** added — new `AinativeWordmark` component used in dashboard welcome and sidebar header.
- **Icon set refreshed** — `public/icon-512.png`, `public/ainative-s-64.png`, `public/ainative-s-128.png` updated to the new visual identity.
- **Skill naming convention** documented in `book-updater`, `doc-generator`, and `user-guide-sync` SKILL.md files.

### Unchanged

- Runtime behavior, CLI subcommands, SQLite schema, agent contracts, workflow blueprint format.

## [0.12.0] — 2026-04-17

### Changed — BREAKING

- **Package renamed** from `stagent` to `ainative`. Install with `npm i ainative` or run `npx ainative`. The `stagent` npm package is deprecated.
- **GitHub repository identity updated** during the historical package migration.
- **Homepage** is now [ainative.business](https://ainative.business).
- **User data directory** auto-migrates from `~/.stagent/` to `~/.ainative/` on first boot. The database file inside is also renamed (`stagent.db` → `ainative.db`), and in-place SQL migrations rewrite `mcp__stagent__*` tool prefixes and `sourceFormat: "stagent"` enum values in `agent_profiles` rows. Pre-flight backup recommended: `cp -r ~/.stagent ~/.stagent.bak-pre-ainative`.
- **Environment variables renamed** to `AINATIVE_DATA_DIR`, `AINATIVE_DEV_MODE`, `AINATIVE_INSTANCE_MODE`, `AINATIVE_LAUNCH_CWD`. Clean break — update any shell aliases, `.env.local`, or CI configurations.
- **macOS Keychain service** renamed from `stagent` to `ainative`. The migration pass copies the existing entry best-effort; OpenAI Codex OAuth re-login may be required on failure.
- **MCP tool prefix** for Stagent's internal tool server changed from `mcp__stagent__*` to `mcp__ainative__*`. User-authored agent profiles referencing the old prefix are auto-migrated.
- **Agent profile `sourceFormat`** enum value `"stagent"` accepted as a read-side alias (normalized to `"ainative"` on parse) — externally-authored profile YAML files in other repos continue to import without modification.

### Unchanged

- Runtime behavior.
- CLI commands and subcommands (just the binary name changed: `stagent` → `ainative`).
- SQLite schema, migration numbering, and data layout.
- Agent runtime contracts, tool shapes, and workflow blueprint format.
