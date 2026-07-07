---
title: Generator/Publisher substrate — packs that generate an artifact and publish it (TDR-039)
status: planned
priority: P1
milestone: mvp
source: features/architect-report.md (TDR-039 integration design) / _IDEAS/packs-publish.md §7 (Pillar D)
dependencies: []
enables: [pack-web-designer, pack-app-exporter, pack-community-publish]
---

# Generator/Publisher substrate (TDR-039)

## Description

A new capability class for Relay packs: **packs that generate an artifact from their managed
data and publish it to an external, user-owned target.** The substrate is two mirrored adapter
registries — a `GeneratorAdapter` (reads pack rows → emits an `Artifact` file set; no egress) and
a `PublisherAdapter` (takes an `Artifact` + a target config → publishes; returns a result) — plus
two new tables (`publishTargets`, `deployments`) and the manifest seam that lets a pack declare
`generate:` / `publish:`.

First consumer is the **Web Designer** bundle (`features/pack-web-designer.md`): `relay-web-assets`
(a Web Asset Manager whose `gallery` view primitive is a plain standalone Core primitive) +
`relay-web-publisher` (generates a static site from managed rows, publishes to the customer's own
GitHub Pages). It must generalize to a named family (social, video, research paper, book). It is
also the substrate that R6 (`pack-app-exporter`) and R7 (`pack-community-publish`) ride.

**This spec is Phase 1 only** — the substrate itself, behind tests, with no manifest wiring and no
UI. Phases 2-5 (manifest arms, API routes, frontend, the two Web Designer packs) are sequenced at
the bottom and specced separately when Phase 1 lands.

## Anchor correction (report paths were wrong)

`features/architect-report.md` names `src/lib/apps/install.ts` throughout. **That file does not
exist.** The real code lives in `src/lib/packs/`. Corrected anchors, all verified this session:

| Report said | Real location |
|-------------|---------------|
| `install.ts:674` `rewriteViewRefs` | `src/lib/packs/install.ts:764` |
| `install.ts:143-149` bundle-child fence | `src/lib/packs/install.ts` (bundle fence) |
| `install.ts` block 2d `assertRowTriggerVarsFillable` | `src/lib/packs/install.ts:599` (called `:324`) |
| `mergeBundle` ~L152 | `src/lib/packs/bundle.ts:72` (read 122-133 / write 152-159) |
| `install.ts` `createTable` | dyn-imported from `src/lib/data/tables.ts:27` |
| `AppManifestSchema` | `src/lib/apps/registry.ts:252` (top-level `.passthrough()`) |
| `ViewSchema.bindings` (`.strict()`) | `src/lib/apps/registry.ts:215-232` (bindings `.strict()` at :228) |

## Open design questions — RESOLVED with evidence

**(a) Where does `generate:` sit so `rewriteViewRefs` UUID-rewrites its table refs for free?**
RESOLVED. `rewriteViewRefs` (`packs/install.ts:764`) is **name-keyed, not arm-keyed**: it deep-
recurses arbitrary objects/arrays and rewrites *any* field literally named `table` (or `schedule`)
whose value is a string (`:774-778`). The call site (`:754-759`) only visits `rewritten.view`.
Therefore: **put the `generate:` arm inside `view.bindings`, and name every table-reference field
exactly `table`.** Then UUID-rewriting is free, no rewriter edit — the same convention
`FunnelBandSpecSchema` documents at `registry.ts:191`. (If a generator ever needs a field NOT named
`table`, the rewriter's key-match at `:774` must be extended — avoid this.)

**(b) Does the generation half mirror the document-processor registry (TDR-017)?**
DEFERRED to Phase 2 (generation-half design). Phase 1 builds the `PublisherAdapter` registry (the
mirror of `ChannelAdapter`/TDR-018, which is fully proven) and a *minimal* `GeneratorAdapter`
interface. The registry-shape choice for generators (TDR-018 lightweight dispatch vs. TDR-006
metadata catalog) is settled when the first real generator is built, not now.

## Phase 1 scope (this spec)

### New files

- **`src/lib/publishers/types.ts`** — mirror `src/lib/channels/types.ts:5-17`:
  ```ts
  export interface PublisherAdapter {
    targetType: string;                                   // mirrors channelType
    publish(artifact: Artifact, config: Record<string, unknown>): Promise<PublishResult>;
    testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>;
  }
  export interface Artifact { files: ArtifactFile[]; entryPoint: string; hash: string }
  export interface ArtifactFile { path: string; content: string | Buffer }
  export interface PublishResult { success: boolean; url?: string; commit?: string; error?: string }
  ```
  Plus the masking helpers, mirrored from `channels/types.ts:33-63` verbatim in shape:
  `SENSITIVE_PUBLISH_KEYS = ["token", "githubToken", "apiKey"]`, `maskPublishConfig(json)`,
  `maskPublishTarget<T extends {config: string}>(row): T`.

- **`src/lib/publishers/registry.ts`** — mirror `src/lib/channels/registry.ts:9-24`: a plain
  `Record<string, PublisherAdapter>` of imported singletons + `getPublisherAdapter(type)` throwing
  `Unknown publish target type: ${type}` on miss. (Lightweight TDR-018 dispatch, not the TDR-006
  catalog — publishers are behavioral adapters, not metadata-rich.)

- **`src/lib/publishers/github-pages-adapter.ts`** — the first adapter, `export const
  githubPagesAdapter: PublisherAdapter = {...}`. Uses the **GitHub Contents API** (fetch, not
  shelling `git` — architect-report §3 preference; avoids the heavier `child_process` capability).
  `testConnection` = a `GET /repos/{owner}/{repo}` auth check; `publish` = per-file
  `PUT /repos/{owner}/{repo}/contents/{path}` on the `gh-pages` branch.

- **`src/lib/generators/types.ts`** — minimal: `export interface GeneratorAdapter { generatorType:
  string; generate(rows, config): Promise<Artifact> }`. Registry deferred to Phase 2 (no consumer
  yet in Phase 1).

### Storage — FOUR wiring points (dual schema/bootstrap/migration mechanism)

The codebase uses **both** a hand-maintained numbered Drizzle migration *and* an idempotent
bootstrap `CREATE TABLE IF NOT EXISTS`, because shipped npx installs have no `migrations/` dir
(`instrumentation-node.ts:122`) and rely solely on bootstrap, while dev/migrated DBs replay the SQL.
**A table wired into only one path 500s on the other environment — release-gating shadow path.**

Two new tables (mirror `channelConfigs`/`channelBindings` at `schema.ts:724-769`):

- **`publishTargets`**: `{ id (text, PK — composite `plugin:<id>:<target>` for pack-seeded rows),
  appId (text, ref → app/project), targetType (text enum), config (text, JSON, masked at every API
  boundary), createdAt (integer timestamp) }`.
- **`deployments`**: `{ id, appId (ref), targetId (ref → publishTargets.id), status (text enum:
  pending|publishing|success|failed), url, commit, artifactHash, startedAt, finishedAt, error }`.

Wire into all four:
1. `src/lib/db/schema.ts` — `sqliteTable(...)`, `text("config")` for JSON, `.references(() =>
   publishTargets.id)` for the deployments FK; export `PublishTargetRow`/`DeploymentRow` types.
2. `src/lib/db/bootstrap.ts` — a `CREATE TABLE IF NOT EXISTS` block inside
   `bootstrapAinativeDatabase()` with SQL-style `FOREIGN KEY` clauses; **append both table names to
   `LEGACY_DATA_TABLES` (`bootstrap.ts:4-49`)**.
3. `src/lib/db/migrations/0029_add_publish_substrate.sql` — next number (current max is `0028`);
   matches the schema, SQL-style FKs (precedent: `0015_add_channel_bindings.sql`).
4. `src/lib/data/clear.ts` — `step("deployments", ...)` **before** `step("publishTargets", ...)`
   (children-before-parents, precedent `channelBindings:96` → `channelConfigs:102`), both before the
   app/parent; add both keys to the returned summary object.

### Tests (TDD — write first)

- `src/lib/publishers/__tests__/registry.test.ts` — lookup hit/miss (throws on unknown type).
- `src/lib/publishers/__tests__/masking.test.ts` — `maskPublishTarget` masks every
  `SENSITIVE_PUBLISH_KEYS` entry to `****<last4>`, leaves non-secrets, survives malformed JSON
  (returns input) — mirror the channel masking test.
- `src/lib/publishers/__tests__/github-pages-adapter.test.ts` — `testConnection` + `publish` with
  `fetch` mocked; assert Contents-API calls (PUT per file, correct branch), result shape on
  success + error.
- A storage round-trip test: insert a `publishTarget` + `deployment`, read back, confirm FK + the
  `clearAllData` FK-safe order deletes without a constraint error.

## Out of scope (Phase 1 fences)

- **No manifest wiring.** `generate:`/`publish:` arms on `AppManifestSchema` are Phase 2. (When
  added: arm goes in `ViewSchema.bindings` `.strict()` at `registry.ts:228`, table-ref fields named
  `table`; AND both keys added to `mergeBundle` read block `bundle.ts:122-133` + write block
  `152-159` — else they vanish in a bundle, the funnel shadow-path lesson.)
- **No API routes, no UI.** Phases 3-4.
- **No Web Designer packs.** Phase 5.
- **No `data-flow.md` row #11.** That lands when the first real *publish egress* ships (Phase 3+),
  and is release-gating then. Phase 1 has no egress surface wired to a user action.
- The `github-pages` adapter is built + unit-tested with mocked `fetch`, but a **live GitHub Pages
  publish smoke** (real token, real repo) is deferred to Phase 5 and is what promotes TDR-039
  proposed → accepted.

## End-to-end check (Phase 1 done means)

1. `npm test` green including the four new test files.
2. A dev-server boot (`npm run dev`) starts clean — the two new tables exist (bootstrap path) and
   `/api/data/clear` succeeds (FK order correct). This is the **runtime-registry-adjacent smoke** the
   storage/bootstrap change requires per CLAUDE.md — not just unit tests.
3. `getPublisherAdapter("github-pages")` resolves; `getPublisherAdapter("nope")` throws.
4. No manifest/bundle/route/UI change — `git diff --stat` touches only `src/lib/publishers/`,
   `src/lib/generators/`, and the four storage files + tests.

## Anchors / memory

- `funnel-flow-primitive-built` (the `mergeBundle` binding shadow-path lesson — Phase 2 must heed).
- `generator-publisher-substrate-tdr039` (the capability class + row-#11 requirement).
- `anthropic-direct-mcp-servers-remote-only` + CLAUDE.md smoke-test budget (runtime-adjacent → real
  boot smoke).
- Report: `features/architect-report.md` (TDR-039 integration design — paths corrected above).
- Mirror sources: `src/lib/channels/{types,registry}.ts` (PublisherAdapter), `catalog.ts` (the
  fuller registry convention, NOT used here), `schema.ts:724-769` + `clear.ts` + `bootstrap.ts`
  (the storage trio-plus-migration).
