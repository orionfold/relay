# ✅ SHIPPED — ainative → relay BRAND REFACTOR (2026-06-30, local commits, NOT pushed)

The in-repo rename is **DONE + verified**. This was the NEXT-FIRST launch-blocker (deferred batched
rename, `project-self-extending-machine-npm-deferred`). Strategy **(b) accept the break** + centralize
env in `src/lib/config/env.ts` (operator decisions). Four bisectable commits on `main` (24 ahead of
origin, local-only per `feedback-no-push-reminders-pre-release`):
- `d17e6759` refactor(config): centralize env reads + rename data layer ainative→relay
- `f0c6bf22` refactor(mcp): rename in-process MCP server id ainative→relay
- `4f366867` refactor(cli): rename package to orionfold-relay + bin relay
- `fd8500ba` refactor(ui,docs): Orionfold Relay brand copy + correct catalog counts

## ▶▶ FOLDER RENAME IS SAFE — operator's remaining manual steps
CC confirmed safe. The code is done; these are the **operator-manual** steps (strategy b has no
auto-migration):
1. **Stop the `:3000` dev server** first.
2. **`.env.local`** (CC is permission-blocked from reading/editing it): currently only `RELAY_DEV_MODE`
   is renamed. Also rename any `AINATIVE_DATA_DIR` → `RELAY_DATA_DIR` if present (operator said it has
   **no** DATA_DIR override → the app uses the default `~/.relay`).
3. **Move the data:** `mv ~/.ainative ~/.relay` (the live DB has the relay-agency pack + Meridian run;
   without the move a dev boot creates a fresh empty `~/.relay`). DB file is now `relay.db` — the dir
   already contains `ainative.db`, so after `mv` also rename the file: `mv ~/.relay/ainative.db
   ~/.relay/relay.db` (+ `-wal`/`-shm`), OR start fresh.
4. **Folder rename:** `mv ainative relay`. No `git worktree repair` needed (the relay-demo worktree was
   removed this session). Confirm `.git/relay-dev-mode` survived the `mv` (it lives under `.git`, so it
   does). Restart CC.
5. **CC session continuity:** history is path-keyed under
   `~/.claude/projects/-Users-manavsehgal-orionfold-ainative/` → a NEW dir is derived after the folder
   rename. The repo `HANDOFF.md` + that path-keyed `memory/` dir are the bridge — copy the memory dir
   across if you want it carried.

## What changed (the durable record)
- **`src/lib/config/env.ts`** (NEW) — single accessor for the **9 real** env keys (RELAY_* only, no
  fallback) + `dataDir()`/`dbPath()`. `ainative-paths.ts` delegates to it (filename + getAinative*
  symbols KEPT — internal, not a platform surface; operator's reduced-blast-radius call). 6 inline
  data-dir duplicates collapsed; 2 latent path bugs fixed (chat/export ignored the override;
  upgrade-route literal fallback). Dead `AINATIVE_PLANNER_ENABLED` dropped (handoff's 13 keys → 9 real;
  CODEX_CONFIG/SYSTEM_PROMPT/TOOLS were local consts, not env).
- **Dev-mode gate** — `RELAY_DEV_MODE`/`RELAY_INSTANCE_MODE` + sentinel `.git/relay-dev-mode` (created;
  legacy `ainative-dev-mode` left as harmless). Generated pre-push hook text + `RELAY_HOOK_VERSION`
  marker (recognizes the old marker for upgrade). **Gate proven to hold in the smoke** — no hook
  installed.
- **MCP server id** `ainative`→`relay` (atomic): `createSdkMcpServer({name:"relay"})`, the `relay:`
  merge-key in all 3 runtime adapters, `mcp__relay__*` allow-prefixes + per-tool literals, chat-shell
  check, Codex client identity. Internal `withAinativeMcpServer` name KEPT. **Profile-format enum
  `format:"ainative"` deliberately KEPT** (stored contract). mcp-loader `${RELAY_DATA_DIR}` token (keeps
  `${AINATIVE_DATA_DIR}` as deprecated alias).
- **package.json** `orionfold-relay`, bin `{relay, orionfold-relay}`; `bin/cli.ts` self-name `relay`,
  banners/help/version. `npx orionfold-relay`. (Repo URL + `ainative.business` domain left — separate.)
- **UI copy** ~20 strings → "Orionfold Relay" (combined phrase, operator preference). localStorage keys
  / CustomEvent names / `x-ainative-internal` header KEPT (wire contracts). **Catalog counts fixed**
  (Gap #5): 13→21 profiles, 8→15 blueprints in `features/*.md`. README package-name → orionfold-relay
  (repo raw-URLs kept). CLAUDE.md + AGENTS.md updated (gitignored — local SDK source, not committed).
- **relay-demo worktree REMOVED** (`--force`; superseded seed; branch `feat/relay-agency-seed-dataset`
  `cac4121d` kept).

## Verification (all green)
`tsc --noEmit` exit 0; `validate:tokens` passed; zero lingering `process.env.AINATIVE_*` /
`mcp__ainative__` / `ainative-dev-mode` in production. Full suite **2229 passed, 10 failed — all 10
confirmed pre-existing on clean HEAD** (router ×6, api-version-window ×2, run-cadence-heatmap ×1,
settings ×1) + blueprint e2e flaky; **ZERO new failures**. **Dev smoke GREEN**: app boots, dev-mode
gate held (`bootstrap skipped: dev_mode_env`, no pre-push hook), CLI `pack add/list/remove` clean
(customers-retained warning works), **real chat task ran via `mcp__relay__execute_task` → completed +
wrote a `task_run` ledger row** (agent replied "Confirmed — relay MCP smoke test received and
responding."), zero ReferenceError.

## Out of scope (still deferred)
The npm publish of `orionfold-relay@0.1.0` (`project-self-extending-machine-npm-deferred` — single
batched release once milestones ship to GitHub). The `orionfold` umbrella bin + PATH-collision note
(see npm-bin note below). Repo/domain rename. This task did the **in-repo** rename only.

---


# Handoff: Step 3 COMPLETE + COMMITTED (customer-dimension + relay-pack-format + relay-agency-pack)

**Updated:** 2026-06-30. **All of Step 3 is DONE, verified, and now COMMITTED (local-only, not
pushed).** Two commits on `main` (16 ahead of origin):
- **`538121f4` feat(customers): first-class customer dimension** — `customers` table + `customerId`
  FKs, write-time ledger attribution + `getCostByCustomer` rollup, `ensureCustomer`, `/api/customers`,
  `/customers` UI, nav item. Migration renumbered `XXXX_` → **`0028_add_customer_dimension.sql`**.
- **`3375f325` feat(packs): relay pack format + installer + relay-agency reference pack** — the pack
  format (`src/lib/packs/format.ts`/`install.ts`/`cli.ts` + 3 tests), `bin/cli.ts` `pack` subcommand,
  `app-root.ts` bundle fix, the installer **view-ref fix** + **customer-retention warning** (both new
  this session), and the **relay-agency reference pack** now living at
  **`src/lib/packs/templates/relay-agency/`** (relocated from gitignored `output/` into tracked source).

Committed in dependency order on purpose: packs' `install.ts` does `await import("@/lib/customers")`,
so customer-dimension had to land first for each commit to build standalone (bisectable).

## ▶ WHAT'S NEXT (nothing queued/blocking — pick from these)
- **Push** when ready (operator policy = local-only pre-release; do NOT push or prompt unprompted —
  `feedback-no-push-reminders-pre-release`). 16 commits accumulate toward the next batched release.
- **`HANDOFF.md` + the untracked archive** (`.archive/handoff/2026-06-29-orionfold-ds-redesign-shipped.md`)
  are the only uncommitted items — operator's call whether to track the archive.
- **The deferred rename release** (`project-self-extending-machine-npm-deferred`): `relay`/`orionfold-relay`
  bin + data-dir rename, ~18-file sweep. The pack `update` stub + `base/`+`overrides/` split are
  forward-compatible so the future managed-base spec is purely additive.
- **`relay-artifact-runtime`** (FUTURE spec) — triggered by whatever the agency pack actually *produces*
  (LP reports, funder updates, listing one-pagers) once a partner wants any served as a URL.

## ▶ WHAT SHIPPED THIS SESSION (the relay-agency-pack turn) — all committed

**1. The `defer-ledger` skill** (`.claude/skills/defer-ledger/`, LOCAL-only — `.claude/skills/` is
gitignored, operator chose to leave it local). The ponytail study's outcome: (c) ignore ponytail's bulk
(its "write minimum code" thesis = our CLAUDE.md #5/#6 + `/simplify` + `/code-review`), but (b) adapt the
ONE novel idea — its debt-ledger loop — as an Orionfold-native skill: a `DEFER: <shortcut> — UPGRADE
WHEN: <trigger>` marker convention + an `rg` harvester that flags untriggered deferrals as "later means
never" rot. Read-only audit skill. MIT-attributed in its body. No third-party plugin installed; no global
`~/.claude/` writes.

**2. The relay-agency pack** (`src/lib/packs/templates/relay-agency/`, 26 files, pure config + seed, ZERO
per-pack code): `pack.yaml` + `base/manifest.yaml` (7 profiles, 8 blueprints, 1 `clients` table,
workflow-hub view + 3 KPIs); **7 genuinely-tuned vertical profiles** (CRE: cre-analyst / cre-listing-writer
/ bookkeeper; nonprofit: grant-researcher / impact-writer; ops: onboarding-runner / governance-officer);
**8 blueprints** (the demo's 8 workflows re-expressed 1:1 with per-step `profileId` + `requiresApproval`
HITL gates); **6 scrubbed customers** seeded via `ensureCustomer` (Lakeshore canonicalized — the demo's
"Riverside" alias dropped; illustrative retainer figures live in customer `notes` per operator decision).

**3. Two real defects fixed (both committed in `3375f325`):**
- **Operator steer #3 — pack `remove` now WARNS** that customers are retained (durable business data the
  cascade never touches). Added to `cli.ts` `runRemove` + a regression assertion in `cli.test.ts`.
- **Core installer bug the live walkthrough caught** — `rewriteTableRefs` rewrote `tables[].id`
  (logical→UUID) but NOT the **view bindings / KPI `source.table` refs**, so the "Clients" KPI silently
  read 0. Fixed with a recursive view-ref rewriter (rewrites any `{table: <logical>}` anywhere in the
  view subtree, incl. nested `ratio` leaves). TDD red→green; +1 install.test assertion. KPI now reads 6.

## ▶ VERIFICATION DONE — all green, evidence-backed
- `tsc --noEmit` exit 0; `validate:tokens` green; **24/24 pack tests** + **20/20 customer-dimension tests**.
- **CLI dev smoke (TDR-032 / runtime-registry-adjacent install path) PASSED** against isolated
  `AINATIVE_DATA_DIR` from the NEW tracked pack path: install (project + 6 customers + 6 table rows + 7
  profiles + 8 blueprints), idempotent re-add ("project reused, 0 table(s)" — no dupes), remove (cascade
  sweep + **6 customers retained** + warning printed). NO `ReferenceError: … before initialization` on any
  path.
- **Live Claude-in-Chrome walkthrough (light theme) — the acceptance bar, all 4 green:** `/customers`
  shows 6 real customers (not `"Client:"` prefixes); `/apps` shows Relay Agency as a Running composed app;
  `/apps/relay-agency` cockpit renders KPIs (**Clients: 6** after the fix) + all 8 blueprints; **a live
  task run** (`relay-agency--cre-analyst` profile, Claude Code runtime, under the Meridian-linked project)
  wrote a **real ledger row attributed to Meridian** → `/customers/meridian` shows "Linked projects: 1 ·
  AI spend 1 run · 3 tokens" — the demo's hardcoded "$1,040/73% margin" markdown is now REAL per-customer
  attribution. "Fakes become real" proven in working software.

## ▶ BROCHURE REFRESHED (the partner deliverable — sibling `books` repo + ainative `output/` mirror)
Operator asked to update the Relay partner brief with the new generic screengrabs + make it apt for any
customer. DONE: captured 5 full-res light-theme shots (customers list, Meridian rollup, apps gallery, app
cockpit, task detail) via DevTools MCP → `output/relay-brochure/screenshots/14–18-*.png` + mirrored to
`../books/relay-brochure/screenshots/`. Edited `../books/relay-brochure/relay-brochure.qmd`: **graduated
the customer dimension from "roadmap/future" to "shipped now"** (new "Customers — now first-class" section
+ rewrote the partnership callout to "SHIPPED NOW — DEEPENED WITH PARTNERS"), added apps-gallery + cockpit
shots to Pillar 3, removed the stale projects-as-tenants shot. Re-rendered → **16-page**
`output/relay-brochure/Orionfold-Relay-Partner-Brief.pdf` (`TYPST_FONT_PATHS="$(pwd)/theme/fonts" quarto
render relay-brochure.qmd --to typst`, then copy `_output/*.pdf` to the ainative output dir). Verified
page-by-page. The brochure source/output is the only sibling-repo work this session (operator-asked, so
the `feedback-no-sibling-repo-edits` default is satisfied).

## ▶ STATE / paths that changed (for the next session)
- Pack lives at **`src/lib/packs/templates/relay-agency/`** (NOT `output/` anymore) — chosen because it's
  under `src/` (auto-included in npx hoisting), matches the `builtins/` shipped-asset convention, and is
  tsc-safe (only `.ts(x)` is type-checked). Mirrors the spec's "fork-a-template repo" framing.
- Migration is **`0028_add_customer_dimension.sql`** (renumbered from `XXXX_` per `db-migration-sequencing`).
- `relay-agency` is currently installed in the **real dev DB** (`~/.ainative`) with the demo task + Meridian
  link intact (so the cockpit is live for demos). Uninstall with `node dist/cli.js pack remove relay-agency`
  if a clean DB is wanted — customers will be retained + warned.
- Dev server was restarted (`:3000` only, per `feedback-only-restart-own-dev-server`) to clear the KPI cache.

<details><summary>customer-dimension (Step 3 #1) — SHIPPED earlier this session (record)</summary>

- **Schema** (`schema.ts`): hard `customers` table (id/name/slug-unique/status/industry/notes/ts +
  idx_customers_slug, idx_customers_status); nullable `projects.customerId` + `usageLedger.customerId`
  (+ idx_usage_ledger_customer_id) FKs → `customers.id`. `CustomerRow` type exported.
- **Bootstrap** (`bootstrap.ts`): idempotent CREATE customers (+ indexes) BEFORE projects;
  addColumnIfMissing for both customer_id cols; `"customers"` added to LEGACY_DATA_TABLES.
- **clear.ts**: FK-safe `db.delete(customers)` AFTER usageLedger + projects; return-object key added.
- **Migration**: `migrations/XXXX_add_customer_dimension.sql` (dev prefix — renumber to next 00NN_ at
  PR per db-migration-sequencing; journal NOT touched, bootstrap is the live-DB safety net).
- **Attribution** (`ledger.ts`): `UsageLedgerWriteInput.customerId?`; resolved at the single
  `recordUsageLedgerEntry` funnel — prefers explicit customerId, else inherits `project.customerId`
  (one place auto-attributes all 23 call sites; best-effort, null = "Unattributed"). NO call-site edits.
- **Rollup** (`ledger.ts`): `getCostByCustomer(days)` + `CostByCustomerEntry` — Map-reduce mirroring
  getProviderModelBreakdown; null → first-class **"Unattributed"** bucket; name-join via inArray+Map.
- **Helper+API**: `src/lib/customers/index.ts` `ensureCustomer({slug?,name,…})` (slug-idempotent,
  create-if-absent NOT upsert-all; `CustomerSlugError`); `slugifyCustomer`. Routes: `POST/GET
  /api/customers` (POST → ensureCustomer, 201 new / 200 existing), `GET/PATCH /api/customers/[id]`
  (slug immutable), `POST /api/customers/[id]/link-project`. Validators in `validators/customer.ts`.
  **This `ensureCustomer({slug,…})` is the seam relay-pack-format's installer seeds customers through.**
- **UI**: nav "Customers" in Data group (dataItems now 4/4; nav-items test 13→14 + activeGroupId);
  `app/customers/page.tsx` (Server Comp list), `app/customers/[id]/page.tsx` (FULL detail page),
  `customer-form-sheet.tsx` (create/edit, px-6 pb-6), `customer-detail-actions.tsx` (edit island).
- **Verified**: tsc clean; validate:tokens green; 69/69 customer-touching suites; dev smoke PASSED
  (live ledger row landed with correct customer_id via project inheritance; no ReferenceError).

</details>

---

<details><summary>Original Step-2 review handoff (specs awaiting review — now approved)</summary>

**Step 0 (research) + Step 1 (strategy doc) + Step 2 (the 3 specs)** were all DONE. The 3
dependency-ordered specs were groomed lightweight in-session. All three written to `_SPECS/`
(gitignored) and opened in Obsidian. Operator reviewed + approved (decisions above).

## ▶ STEP 2 OUTPUT — the 3 specs (awaiting operator review in Obsidian)

1. **`_SPECS/customer-dimension.md`** (Core, dependency root) — hard `customers` table + nullable
   `customerId` FK on `projects`/`usageLedger`; write-time attribution at the single
   `recordUsageLedgerEntry` funnel (`ledger.ts:205`); per-customer rollup w/ "Unattributed" bucket;
   `/customers` in the Data nav group; `ensureCustomer({slug,…})` slug-idempotent API helper (the seam
   pack-format depends on). Mandatory dev smoke = ledger-write path.
2. **`_SPECS/relay-pack-format.md`** (Core) — extended manifest + `pack.yaml`, pre-split `base/` +
   `overrides/` + precedence resolver; `relay pack add/list/remove` (+ `update` stub) via the `plugin`
   subcommand precedent (`cli.ts:127-150`, dynamic import); install DB-write boundary reuses
   `ensureAppProject` + table creation + `ensureCustomer`; uninstall via existing `deleteAppCascade`.
3. **`_SPECS/relay-agency-pack.md`** (Pack, the partner deliverable) — re-expresses the relay-demo
   worktree's 8 workflows + CRE/nonprofit profiles + 6 scrubbed customers as PURE config/seed, riding
   on #1 + #2. Proves the format; "fakes become real" is the acceptance bar.

Each spec ends with an **Open items to surface at review** section — those are the genuine choices the
operator may want to steer (e.g. customer detail = Sheet vs page; `src/lib/packs/` vs extend
`src/lib/apps/`; do pack-seeded customers survive uninstall). Walk those at review.

## ▶ ON APPROVAL — Step 3 build order (each spec has its own Sequencing + Verification)

Build **in dependency order**: `customer-dimension` → `relay-pack-format` → `relay-agency-pack`. Each
spec is self-contained (files/interfaces named, sequenced vertical slice, **mandatory dev smoke**,
verification). `customer-dimension` is the only one touching the schema + the runtime-registry-adjacent
ledger-write path — budget the end-to-end `npm run dev` smoke there (CLAUDE.md smoke-test budget).

Open the specs for review: `open "obsidian://open?vault=orionfold&file=ainative%2F_SPECS%2F<file>.md"`
(customer-dimension / relay-pack-format / relay-agency-pack).

> **Operator policy reminders:** commits local-only pre-release (no push/prompts). Default `main`.
> `_IDEAS/` + `_SPECS/` are gitignored local strategy files. Author production code in-session (Opus);
> delegate only reads/research to subagents. Review docs → open in Obsidian, don't just cite the path.

## WHAT'S DONE (read these first — they ARE the spec inputs)

- **`_IDEAS/relay-core-and-packs.md`** — the durable strategy thesis (Step 1). Kernel+pack model, the
  Core-vs-Pack partition test + worked table, pack format (extended manifest), distribution
  (git/folder+CLI), and **all decisions locked** (see frontmatter `decisions_locked`). §7 names the 3
  dependency-ordered specs with their fences. **This is the source of truth for Step 2.**
- **`_IDEAS/relay-pack-install-research.md`** — the Step 0(b) web survey (comparison table + synthesis
  + sources) that backs the install-semantics decision. Durable so it survives `/clear`.

## DECISIONS LOCKED THIS SESSION (do NOT re-litigate; baked into the strategy doc)

1. **Pack = EXTENDED app manifest** (pure config, no per-pack code) — superset of the app manifest +
   seed data + metadata. Reuses Zod loader / row-triggers / view-kits. Expressive ceiling is a FEATURE
   (hitting it → generalize a new CORE primitive, not a pack hack). Ceilings enumerated in the doc §2:
   triggers (`row-insert` only, `registry.ts:31-37`), views (7-kit enum `.strict()`), KPIs (enum, not
   formulas), bindings (`.strict()`).
2. **Distribution = git/folder + CLI** (`relay pack add <path|git-url>`). Local-first, NO
   registry/marketplace/review. Partners fork a template repo to author. Does NOT resurrect the §4
   DROPPED marketplace — only the forward-compatible local format §4 said to keep.
3. **Build Core-first:** customer dim → pack format → Agency pack.
4. **Install semantics = overlay-target, editable-seed v1** (RESOLVED WITH OPERATOR). v1 copies pack
   into user space (editable); format **pre-split into `base/` + `overrides/`** so it graduates to a
   managed-base + overlay (load-time precedence resolver) with NO format break. `relay-pack-format`
   must define the split + resolver now even though v1 only copies. See doc §5.
5. **Customer = HARD core table, NOT user-table** (evidence: `userTableRelationships` `schema.ts:966`
   only models userTable→userTable FKs; `usageLedger` `schema.ts:350` has `projectId` but no
   `customerId`).
6. **Vertical profiles = Pack content** (ride in Agency pack), not a Core feature. Profiles are
   file-droppable with `<appId>--` namespacing.
7. **Core tenancy = local single-tenant canonical; cloud multi-tenant via ISOLATION** (doc §8). Schema
   stays single-tenant (evidence: ZERO tenant columns; isolation is process-per-tenant via
   `AINATIVE_DATA_DIR`). Cloud multi-tenant = N isolated instances (container/DB-per-tenant, routed),
   NOT `tenantId` columns + scoped queries. **Customer = a row WITHIN a tenant, NOT a sub-tenant** —
   keeps `customerId` a simple intra-tenant FK; tenancy adds NOTHING to customer-dim scope.
8. **Produced-artifact runtime = named future tier, NO build now** (doc §9). Produced apps/sites/reports
   are inert files in `documents`/`outputs` today (no serve layer). The runtime tier has its own
   local/cloud + single/multi-tenant axes; gets a later `relay-artifact-runtime` spec once we see what
   the Agency pack actually produces. The 3 queued specs stay focused — runtime is NOT folded in.

## OPEN QUESTIONS — ALL RESOLVED (doc §6)

1. Install semantics → overlay-target/seed-v1 (decision #4 above). *Resolved with operator.*
2. Pack-addressable Customer APIs → customer-dim must expose **API-level** create/link (not just UI),
   because a pack's seed references customers. → note in the customer-dimension spec.
3. Vertical profiles → Pack content (decision #6 above). *Resolved.*

## OPERATOR REVIEW FLAGS — raised, not yet confirmed (surface these, don't silently bake in)

Two framing choices in the strategy doc the operator may still adjust on review — don't treat as
final until confirmed:
- **§8 "agency runs Relay-per-client" escape hatch** — the doc says full per-client isolation = the
  multi-instance topology (agency runs Relay-per-client), NOT a customer-dim feature. Confirm this
  matches how the operator pitches isolation to a partner before the `relay-artifact-runtime`/tenancy
  framing hardens.
- **§9 produced-artifact runtime trigger** — the runtime spec's trigger is currently "what the Agency
  pack actually produces." Operator may prefer a different signal (e.g. a specific partner asking for
  a hosted report). Revisit when `relay-agency-pack` reveals real outputs.

## STEP 0 RESEARCH FINDINGS (carry into the specs)

- **Registration topology (decides "can a pack drop files?"):** apps + profiles + blueprints are
  **file-droppable** (`getAinative*Dir`, `<appId>--` namespace); the parent `projects` row
  (`ensureAppProject`) + user `tables` are **DB-rows** → the installer must do a bounded DB write
  (a real install-step boundary; a pack is not pure file-drop). No git/folder install machinery
  exists yet (`upsertAppManifest` is local-only) — the installer is net-new but reuses the strict
  `AppManifestSchema` + atomic temp-rename write (`registry.ts:432`) as its validation gate.
- **Customer-dim schema slot-in:** add nullable `customerId` FK on `projects` + `usageLedger`;
  write-time attribution at the ledger-write path = the runtime-registry-adjacent **mandatory dev
  smoke** target (CLAUDE.md smoke-test budget).

## STEP 2 — Groom 3 specs (dependency-ordered) via `product-manager` skill (QUEUED — gate the ceremony first):
  1. `customer-dimension` (Core) — first-class Customer entity; hard `customers` table + nullable
     `customerId` FK on `projects` + `usageLedger`; write-time cost attribution + per-customer rollup;
     `/customers` list/detail; pack-addressable APIs. (Full prior draft existed this session, then was
     rolled back at operator request — reconstruct from this handoff + the research. **Arch decision
     already resolved on evidence: HARD table, NOT user-table** — `userTableRelationships` (schema.ts
     :966) only models userTable→userTable FKs, so a user-table Customer can't relate to core
     projects/usageLedger. **Customer = row WITHIN a tenant, NOT a sub-tenant** (decision #7) — a
     simple intra-tenant FK; no tenantId. Scope FENCES OUT billing policy (retainer/margin/invoice =
     partner one-pager input, future `customer-billing-policy` spec), RBAC, **multi-tenancy/tenant
     isolation (deployment concern per decision #7, out of scope)**, portals/mobile. Mandatory dev
     smoke: ledger-write path is runtime-registry-adjacent.)
  2. `relay-pack-format` (Core) — extends app manifest into a loadable, CLI-installable pack
     (loader, `relay pack add`, template repo, metadata/versioning, install semantics from Step 1).
     Proven by re-expressing the relay-agency demo as the first pack.
  3. `relay-agency-pack` (Pack) — the first real pack: the demo's 8 vertical workflows + CRE/nonprofit
     profiles, riding on #1's customer dim + #2's format. This IS the Harun deliverable.

## CONTEXT POINTERS
- Demo audit (this session): relay-agency seed faked clients as `"Client: "` project-name prefixes,
  per-client billing as hardcoded markdown, vertical profiles as relabeled generic samples. Worktree
  `ainative-worktrees/relay-demo` (branch `feat/relay-agency-seed-dataset`).
- Strategic frame: `_IDEAS/reprioritze.md` §4–6 (cutline + gap analysis; §5 Gap#1 = Proof/Arena seam,
  the funnel that makes Relay the real 3rd product — a CORE concern, the most defensible build).
- The partner brief (`output/relay-brochure`) defers the customer dimension to a roadmap note — do
  NOT let its framing narrow the Core to "agency only." Agency is the FIRST pack, not the core thesis.
- Cut-freeze SHIPPED this session (commit `9e17a342`, local) — IA is now 4 nav groups; `/analytics`
  deprecated, `/environment` deferred, telemetry+plugins frozen. The pack work must not resurrect the
  marketplace those cuts removed.

</details>

---

<!-- ============================================================= -->
<!-- QUEUED ALSO — Relay partner brochure revisions (2026-06-29)    -->
<!-- ============================================================= -->
<!--
RELAY BROCHURE — built this session, lives in the BOOKS peer repo, not here.
  - Source:   orionfold/books/relay-brochure/ (relay-brochure.qmd + theme/brochure.typ)
  - Skill:    orionfold/books/.claude/skills/publish-brochure/
  - Output:   ainative/output/relay-brochure/Orionfold-Relay-Partner-Brief.pdf (+ .html, screenshots/)
  - Seed:     feat/relay-agency-seed-dataset branch (CRE+nonprofit "Relay Agency Demo" dataset)
  - Render:   cd orionfold/books/relay-brochure && TYPST_FONT_PATHS="$(pwd)/theme/fonts" \
              quarto render relay-brochure.qmd --to typst   (then copy _output PDF to ainative/output)

OPERATOR FEEDBACK to apply (in progress this session):
  1. Whitespace/newline issues between text blocks — review thoroughly: caption→next paragraph,
     section title→paragraph start, between blocks. (Typst/Pandoc margin-collapse.)
  2. Do NOT dangle a headline at a page bottom with its section starting the next page
     (keep heading with its first content block — orphan/widow control).
  3. De-personalize: remove partner/co-founder NAMES (Harun/Daniel/Jeff), remove confidential
     partner-customer $ details ($5K retainer, 73% margin, specific client identities), generalize
     to a CRE+nonprofit agency audience.
  4. Add Orionfold branding: the OfMark disc+star (src/components/shared/of-mark.tsx — cyan disc
     #009b97 Tide cyan + white 45°-rotated star), a © copyright line, and Apache-2.0 license note
     (Orionfold-wide convention per website terms.astro + seo.ts).
  ALL FOUR APPLIED (2026-06-29) — brochure re-rendered, copied to ainative/output/relay-brochure/.
  PLUS: logo fixed (was broken — hand-rolled Typst star collapsed; now embeds theme/of-mark.svg +
  of-mark-ondark.svg, geometry from of-mark.tsx). PLUS: added 5 workflow/app screenshots (09 simple
  sequence, 10 complex human-in-the-loop checkpoint, 11 blueprints gallery, 12 blueprint detail, 13
  "Describe an app — Relay builds it" magic-feature) + new Orchestration section + upgraded zero-code
  apps pillar. Now ~11 pages, 13 screenshots.
  SPACING FIX SHIPPED: text-led section() H2s no longer hug their body — the fix was adding an optional
  `lead:` arg to section() so the first paragraph renders INSIDE the heading's block (no Pandoc raw-block
  boundary for the margin to collapse against). Converted the 4 text-led openers (Why-this-brief, Five-
  gaps, Orchestration, Zero-code-apps); grid/roadmap-led ones never had the problem.
  CLIENT NAMES SCRUBBED: re-seeded relay-agency with generic-but-believable names + re-captured all 13
  screenshots (light theme). Mapping: Lakeside→Meridian Commercial Realty, North Star→Summit CRE
  Advisors, Cedar & Co.→Parkview Property Management, Twin Cities Nonprofit Alliance→Community Impact
  Alliance, Headwaters→Cornerstone Community Foundation, Riverside Family→Lakeshore Family Services.
  Kept Twin Cities geography (Bloomington/Edina/Minneapolis — not client identities). Renames applied in
  BOTH worktree (relay-demo) and need mirroring to the feature branch's seed files at PR time.
  Minor remaining: (1) page-3 has a lone "5·Distribution" panel from the Five-Gaps grid split (layout,
  not a bug); (2) the build-an-app screenshot's chat-history sidebar shows generic default-dataset chat
  titles (createConversations isn't CRE-specific) — cosmetic background only.
  THEME-STICK NOTE: DevTools MCP page renders dark server-side (no theme cookie in that context); set
  the ainative-theme=light cookie + DOM class per route before each capture (navigate initScript helps).
  Open follow-up (optional): demo SCREENSHOTS still show invented client names (Lakeside, North Star,
  etc.) baked into seed data; captions frame them as "a sample agency." To fully scrub, re-seed with
  generic names + re-capture.

NPM NAMING — DONE (2026-06-29):
  - npm account `orionfoldllc` created (2FA on); org `@orionfold` created (scope for
    @orionfold/relay|proof|arena). Username ≠ org name on purpose — npm shares the username/org/scope
    namespace, so `orionfold` had to go to the ORG, not the personal account.
  - Reservation placeholders PUBLISHED: `orionfold@0.0.1` + `orionfold-relay@0.0.1` (1 kB stubs,
    "coming soon" bin, Apache-2.0). Source: orionfold/npm-reserve/ (untracked). `orionfold-relay`
    bins: `orionfold-relay` + `relay`.
  - PyPI parity: orionfold / orionfold-proof / orionfold-arena already held on PyPI (separate registry,
    no conflict). npm siblings orionfold-proof / orionfold-arena NOT yet reserved.
  - DEFERRED (per project-self-extending-machine-npm-deferred): the real `orionfold-relay@0.1.0`
    rename-release (package + bin rename, ~18-file sweep of "ainative-business"/"ainative" bin, npx
    hoisting, README/docs) ships with the BATCHED pivot release, not now. `npx ainative-business` is
    still the current command until then.
  - Bypass-2FA publish token was created, used once, then REVOKED + scrubbed from .env.local.

DONE (2026-06-29): SENT the Harun email from manav@orionfold.com (Orionfold Mail / u/1) via
  gmail-browser-ops Claude-in-Chrome flow. Operator added recipient + attached the PDF manually, then
  sent. Two in-session revisions vs the approved draft below: (1) DROPPED the "Tue/Wed once Cloud Code
  credits refresh + I'll send the install" launch commitment — credits situation resolved, operator
  chose to commit no further action and let the PDF be the "killer" next step; (2) cut the whole
  "next steps / your one-pager" forward-ask paragraph, closing on "PDF attached. Would love your
  unfiltered read." Generic tone preserved (no client names / $). Subject unchanged.
  Note: account default signature (Founder/Orionfold + CAN-SPAM opt-out line + physical address)
  auto-appended; left as-is per operator (flagged that the opt-out line reads marketing-ish on a warm 1:1).

  APPROVED DRAFT TEXT (generic version — paste into the Gmail body):
  --------------------------------------------------------------------
  Subject: Orionfold Relay — the partner brief I mentioned

  Hi Harun,

  Great catching up the other day — congrats again on the LLC and signing your first customer. The
  forward-deployed, agency-managed model you described is exactly the shape Relay is built for, so I put
  together a short partner brief to make the case concrete.

  The thesis in one line: Relay is the agency operating layer you'd otherwise spend months building —
  every client a project, every vertical a profile, every service a reusable workflow, every model a
  switch, with per-client billing and human-in-the-loop governance built in. The brief walks through it
  with real screenshots: the one-board cockpit, simple vs. governed multi-step workflows, multi-vendor
  model switching (Claude/Codex/Gemini/local), and the "describe an app, Relay builds it" zero-code
  composition.

  I also flagged the one piece that's still ahead of us — a first-class customer dimension for true
  multi-tenant agency management. That's the part I'd want to design with you, from your one-pager,
  rather than retrofit later.

  Next steps on my side: Relay goes public Tuesday/Wednesday once the Cloud Code credits refresh — I'll
  send you the install the moment it's live so you can put it through its paces and tell me where the
  gaps are. On yours, whenever it's ready, the one-pager on how you'd deploy Relay for clients (and what
  your customer/group schema looks like) would let me start shaping the agency surface around how you
  actually run accounts. Then we can structure the subcontractor/partnership side.

  PDF attached. Would love your unfiltered read.

  Best,
  Manav
  --------------------------------------------------------------------
-->

<!-- npm bin decision (from operator): eventually want THREE launch commands — `relay`,
     `orionfold-relay`, AND `orionfold` (umbrella dispatcher). Bake into the 0.1.0 rename plan.
     Watch: a bare `orionfold` npm bin could PATH-collide with the PyPI `orionfold` CLI if a user
     installs both globally; npx is unaffected. Keep npm bin names distinct (relay/orionfold-relay)
     or make the umbrella dispatch, to avoid the collision. -->


# Handoff: DONE — `_SPECS/feature-cut-freeze.md` implemented (cut/freeze the below-the-line surfaces)

**Updated:** 2026-06-29 (cut-freeze implementation session). The cutline is **SHIPPED + local**
(one commit, not pushed). All spec gates passed: `tsc --noEmit` clean, `validate:tokens` green,
`nav-items` 9/9, dev smoke + Claude-in-Chrome walkthrough (both themes) confirmed. Prior DS/redesign
handoff archived at `.archive/handoff/2026-06-29-orionfold-ds-redesign-shipped.md` (those 7 commits
shipped + local). The queued-task detail below is kept as the implementation record.

## WHAT SHIPPED (2026-06-29)
- **Nav cut** — `nav-items.ts`: removed Analytics + Environment; dissolved the `configure` group;
  `NAV_GROUPS` now **4 groups** (Home · Compose · Data · Observe); dropped 3 unused icon imports.
- **Settings right-align** — `app-bar.tsx`: icon-only gear in the right utility cluster, cyan-active
  on `/settings`, `aria-label`/`title`/`aria-current` set; verified no accordion mis-open
  (`activeGroupId`→home fallback holds).
- **Freeze markers** — 4 `FROZEN SCOPE` comments: `telemetry-rail.tsx`, `rail-cell.tsx`,
  `api/telemetry/route.ts`, `lib/plugins/registry.ts`.
- **Roadmap hygiene** — 11 `features/` distribution/marketplace specs flipped `deferred → dropped`
  (+ reason); "Dropped — not pursuing" note added to `features/roadmap.md` Post-MVP.
- **Doc reconcile** — `_IDEAS/reprioritze.md`: revision-log row + "Executed cuts / Frozen surfaces".
- **Verified zero-regression** — dormant `/analytics` (200, renders) + `/environment` (200, 44KB
  live workspace scan → `src/lib/environment/**` intact); `/monitor` + `/` charts render
  (`chart-data.ts` untouched). No `src/lib/**` behavior change, no DB/route/API/component deletion.
- **NOTE:** untracked `.archive/handoff/2026-06-29-orionfold-ds-redesign-shipped.md` (prior session's
  archive, not gitignored) was left untracked — not part of this commit; operator to decide.

---

<details><summary>Original QUEUED handoff (implementation record)</summary>

> **Operator policy:** commits stay **local-only** through the next release — do NOT push or prompt
> to push (`feedback-no-push-reminders-pre-release`). Default to `main`
> (`feedback-default-main-not-worktree`). `_IDEAS/` + `_SPECS/` are gitignored local strategy files.

## CONTEXT — why this work exists

Relay (formerly ainative) is becoming the **third** Orionfold product (menu: **Proof · Arena ·
Relay**). Positioning landed: **one buyer, three jobs** — Proof = *"which AI can I trust?"*, Arena =
*"which build wins?"*, **Relay = "now make the trusted AI do the actual work"** (the *operations
tier*; the only product whose value compounds *after* evaluation stops). Full thesis + a
28-feature **Desirability/Feasibility/Viability/Uniqueness** matrix is in
**`_IDEAS/reprioritze.md`** (living doc). Its §4 draws an **aggressive concentration cutline**: ship
fewer primitives deeper, stop carrying below-the-line surfaces that dilute the ops story or fight a
peer on the same screen.

This handoff is to **execute that cutline** via the approved spec.

## THE TASK — implement `_SPECS/feature-cut-freeze.md` end-to-end

Read the spec first; it is the source of truth (status: `spec — awaiting approval`, but operator
approved the approach + all open decisions in-session). It is **subtractive + zero-regression** —
removes/relabels, builds almost nothing. Operator decisions already baked into the spec frontmatter:
- **Cut method = hide from nav, keep routes dormant on disk** (reversible, minimal diff).
- **Freeze enforcement = doc + code marker comments** (no lint/test guard).
- **Marketplace DROP = roadmap-only** — there is NO shipped marketplace/`.sap`/remix code to delete
  (verified by grep). Do not hunt for files.
- **Settings → right-aligned icon-only gear; dissolve the now-single-item Config group.**

### Execution order (from spec § Sequencing — vertical slice, smallest blast radius first)

1. **Nav cut — `src/components/shell/nav-items.ts`** (one file):
   - Remove the **Analytics** item from `observeItems` (`href: "/analytics"`). Observe keeps Monitor
     + Cost.
   - Remove the **Environment** item from `configureItems`; then **dissolve the whole `configure`
     group** (it's down to a single Settings item): delete `configureItems`, its `NAV_GROUPS` entry,
     and `"configure"` from the `NavGroupId` union. `NAV_GROUPS` → **4 groups** (Home · Compose ·
     Data · Observe).
   - Remove now-unused icon imports: `BarChart3` (Analytics), `Globe` (Environment), `Settings`
     (moving to app-bar).
2. **Settings right-align — `src/components/shell/app-bar.tsx`** (one file, the ONLY behavior-bearing
   UI edit): add an **icon-only gear `Link`** to the right `ml-auto` utility cluster, placed BEFORE
   the ⌘K button. Mirror the ⌘K button sizing (`h-8`, rounded-md, muted→foreground hover). **Active
   state** (`pathname.startsWith("/settings")`) = cyan `text-primary` (bar's single action color).
   Add `aria-label="Settings"`, `title="Settings"` (icon-only needs the accessible name),
   `aria-current` when active. Import `Settings` from `lucide-react` here.
   - **Correctness check:** `activeGroupId()` already falls back to `"home"` when no item matches, so
     `/settings` (now in no group) won't mis-open an accordion — verify in smoke, no code change
     needed there.
3. **Test sync — `src/components/shell/__tests__/nav-items.test.ts`**: update to **4 groups**;
   `observe` = 2 items; no `/analytics`, `/environment`, or `/settings` in any group's items. Keep
   the `activeGroupId` fallback + active-matching assertions. Run `npm test -- nav-items`.
4. **Freeze markers** (4 short `FROZEN SCOPE` banner comments, no behavior change), each pointing to
   this spec + `_IDEAS/reprioritze.md` §4:
   - `src/components/shell/telemetry-rail.tsx` — 10 cells is the frozen surface; don't out-build
     Arena's machine monitor.
   - `src/components/shell/rail-cell.tsx` — frozen RailCell API.
   - `src/app/api/telemetry/route.ts` — frozen aggregate shape.
   - `src/lib/plugins/registry.ts` — plugin fall-through is the escape hatch, maintain-only.
5. **Roadmap hygiene**: flip the deferred app-distribution/marketplace specs under `features/` from
   `deferred` → `dropped` (the `.sap`/remix/updates/channels/marketplace-reviews/creator-portal/
   install-widget specs named in `reprioritze.md` gap analysis); add a "Dropped — not pursuing" note
   to `features/roadmap.md` Post-MVP section.
6. **Doc reconcile — `_IDEAS/reprioritze.md`**: append a revision-log row + add an "Executed cuts /
   Frozen surfaces" note so matrix and code agree.

## REGRESSION FENCES — the do-not-touch list (critical)

The cut surfaces sit on top of **deeply shared libs**. The danger is grazing the lib while hiding the
surface. **Do NOT touch** (spec § Regression fences has the full table):
- `src/lib/queries/chart-data.ts` — shared by telemetry rail (frozen, still reads it), `/monitor`,
  dashboard, `projects/[id]`. **Distinct from** `src/lib/analytics/queries.ts`.
- `src/lib/environment/**` — workspace-context / auto-scan / scanner / list-skills / parsers,
  consumed by chat, agents, runtime, telemetry route, `/monitor`, projects, tasks, plugins. Hiding
  the `/environment` UI must not graze any of it. `environment_*` DB tables stay.
- `src/lib/apps/**` — the local app-manifest KEEP (the composability moat we're concentrating ON);
  load-bearing for chat engine, table row-trigger dispatch, blueprint/profile/schedule tools.
- No DB migration, no API deletion, no route/component deletion. **Dormant ≠ deleted.**

## VERIFICATION (spec § Verification — do all)

- `npx tsc --noEmit` clean (catches unused imports + stray refs to removed items).
- `npm run validate:tokens` green (no token edits — sanity gate).
- `npm test -- nav-items` passes (updated IA).
- **`npm run dev` smoke** (`nav-items` feeds `app-bar.tsx`, mounted globally):
  - Bar shows **4 groups** (Home · Compose · Data · Observe); no Config group; Observe = Monitor +
    Cost (no Analytics). **Settings = icon-only gear in right cluster**, cyan-active on `/settings`,
    no accordion mis-opens.
  - **Dormant routes still resolve by direct URL**: `/analytics` + `/environment` each 200 (proves
    hidden-not-deleted + no shared lib harmed).
  - `/monitor`, `/`, `/projects/[id]` still render charts (proves `chart-data.ts` untouched);
    chat `list_skills` still works (proves `src/lib/environment/**` untouched).
- **Browser walkthrough** — operator prefers **Claude-in-Chrome side-by-side** (drive the live
  Chrome session, not headless/DevTools; the live tab doesn't auto-raise — tell operator to switch
  to the Browser-1 window; don't auto-close mid-session). Confirm 4-group bar + right gear +
  tooltip/active in both themes; frozen rail still renders its 10 cells.

## COMMIT (when verified, local-only)

Suggested: one focused commit. Conventional-commit style; end body with the Co-Authored-By trailer.
e.g. `refactor(shell): cut below-the-line surfaces; right-align Settings; freeze telemetry scope`.
Version NOT bumped per-commit — `0.15.0` accumulates toward the next batched release
(`project-self-extending-machine-npm-deferred`).

## STATE
- Branch `main`. Seven shipped local redesign commits (none pushed) — see archived handoff. **No new
  commit from this session yet** — only `_IDEAS/reprioritze.md` (new) + `_SPECS/feature-cut-freeze.md`
  (new) written, both gitignored local strategy files. Plus this `HANDOFF.md`.
- Code still self-identifies as `ainative-business` / "AI Native Business"; "Orionfold Relay" is the
  brand layer. Rename/CLI/data-dir migration is **out of scope** (operator decision) — do not touch
  identifiers while implementing the cut.
- Two artifacts from this session to read at start: **`_SPECS/feature-cut-freeze.md`** (the task) and
  **`_IDEAS/reprioritze.md`** §4 (the why). `feedback-handoff-md-workflow`: this handoff was written
  at task boundary for a clean `/clear`.

</details>
