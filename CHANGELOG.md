# Changelog

## Renamed from stagent

This project was formerly published as `stagent` on npm and hosted at `github.com/manavsehgal/stagent`. As of 2026-04-17 it is `ainative`. The old GitHub URL redirects permanently; `stagent` on npm is deprecated with an upgrade pointer to `ainative`.

## [Unreleased]

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
  - What this feature deliberately is NOT: no startup-banner upsell (that space stays yours), no launch nags, no phone-home — the recap is computed entirely from files on your disk. And per [orionfold.com/promise](https://orionfold.com/promise/), nothing here can ever touch content you already installed.

## [0.21.0] — 2026-07-02

### Added

- **`relay pack update` is real — and Agency Pro v0.2.0 is the first paid update it delivers.** When we sold Agency Pro we made a promise on the locked card: "Nonprofit deep chapter arrives in v0.2.0 as your first included update." Both halves of that sentence now exist:
  - **The update workflow (free, for every pack).** `relay pack update <id>` brings an installed pack to the newer bundled version — or from a folder/git source with `relay pack update <id> <source>`. `relay pack list` now shows each pack's installed version and flags `[update available → vX.Y.Z]`, and the Packs page grows an "Update to vX.Y.Z" button that does the same in one click. Updates are additive by design: your tables are reused (never re-seeded), your schedule state (pause, run counts) survives, and nothing you have is ever deleted.
  - **Your edits are backed up, never lost.** If you've customized a file a pack installed (a profile's SKILL.md, a blueprint), the update copies your version to `apps/<pack>/backup/<old-version>/` before laying down the new content, and tells you exactly what it backed up. Installs made before 0.21.0 have no edit-tracking record, so updating one backs up everything first — cautious by default.
  - **Agency Pro v0.2.0: the nonprofit deep chapter.** A grants pipeline that runs the full lifecycle: drop a grant opportunity into the new `grants` table and the deep blueprint fires by itself — absolute-dated deadline chain, a weighted go/no-go fit score with the pursuit-plus-compliance economics stated, an LOI/application draft where every claim is cited or flagged for client data, and a post-award restricted-funds compliance calendar so awarded money never becomes unmanaged risk. If you bought Agency Pro on 0.1.0: `relay pack update relay-agency-pro` and the chapter lands.
- **The never-re-lock promise, now enforced at the update gate.** Updating a premium pack re-checks your license the same way installing does — offline, against the license file on your disk, never a server. If the license is missing or expired, the update refuses with the honest message: your installed pack keeps working, nothing is locked, renewing gets you the new version. No online re-validation, no phone-home, and expiry never touches what you already installed — same terms as [docs/trust/license-terms.md](docs/trust/license-terms.md) and [orionfold.com/promise](https://orionfold.com/promise/).

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
- **GitHub repo renamed** to `manavsehgal/ainative`. Old URL redirects permanently.
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
