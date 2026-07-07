# Web Designer — Phase 2 (manifest seam + first real generator)

_Design doc · 2026-07-06 · scope mode: HOLD · TDR-039 substrate_

## Purpose

Make the TDR-039 generator/publisher substrate **manifest-declarable and demo-able**. A pack
declares `generate:` / `publish:` in its manifest; a real `static-site` generator turns managed
section rows into an HTML `Artifact`; that Artifact flows through the already-built `github-pages`
publisher. This is Phase 2 of the substrate (Phase 1 = the registries + storage, already shipped
in `b9fcb674`).

Phase 2 was specced only as a stub (`features/generator-publisher-substrate.md` lines 139-142).
This doc fills it in, and settles the pack's row contract enough that the generator matches the
eventual `relay-web-assets` / `relay-web-publisher` pack (Phase 5) rather than being reworked.

## The site model (locked)

`relay-web-publisher` generates a **single composed landing page** from ordered section rows. One
row = one section of the page. The generator emits ONE HTML page (`index.html`). This is the
simplest real generator and ties naturally to the shipped marketing-line packs
(`relay-crm`/`relay-social`/`relay-marketing`).

The `gallery` view primitive the substrate spec mentions is a SEPARATE standalone Core primitive
(per that spec) — not this generator's concern.

## Section row contract (locked)

Every row in the sections table:

| Column     | Type   | Required | Notes                                                        |
|------------|--------|----------|--------------------------------------------------------------|
| `kind`     | text   | yes      | one of `hero` \| `features` \| `cta` \| `text`; unknown → skipped |
| `heading`  | text   | yes      | rendered as the section heading (HTML-escaped)               |
| `body`     | text   | no       | section body copy (HTML-escaped)                             |
| `order`    | number | yes      | ascending sort; ties broken by insertion order (stable)      |
| `ctaLabel` | text   | no       | button/link label (used by `hero`, `cta`)                    |
| `ctaUrl`   | text   | no       | link href (HTML-attr-escaped)                                |
| `imageUrl` | text   | no       | image src (HTML-attr-escaped; used by `hero`)                |
| `status`   | text   | no       | only `published` renders; `draft`/null/unknown → skipped (fail-safe) |

**Draft gate (locked):** `status === "published"` renders; everything else is excluded. Fail-safe —
an unfinished section can never accidentally publish. Mirrors the funnel exclusion-filter precedent.

## Manifest seam (the Phase 2 code)

A pack declares generate + publish inside `view.bindings` (mirrors `funnel`):

```yaml
view:
  bindings:
    generate:
      generatorType: static-site   # → getGeneratorAdapter("static-site")
      table: web-sections          # named `table` → free rewriteViewRefs UUID-rewrite
      siteTitle: "Acme Landing"    # generator config (page <title> + og)
    publish:
      targetType: github-pages     # → getPublisherAdapter("github-pages")
```

**Pairing (decided, rationale below):** exactly **one** generate arm + **one** publish arm per app,
implicit pairing — `publish` consumes the app's `generate` output. No `generateFrom` cross-ref field.
- _Rationale:_ mirrors `funnel` (single-valued, `.strict()`, first-child-wins in `mergeBundle`). An
  app is one site. Arrays + id-refs are YAGNI with no consumer. Multi-site later is an additive change.

**UUID-rewrite (decided):** only the input `table` field is named `table`, so `rewriteViewRefs`
(`packs/install.ts:774`) deep-rewrites logical id → UUID for free. `ctaUrl`/`imageUrl` are content,
NOT table-refs — they render verbatim (escaped). Same convention `FunnelBandSpecSchema` documents.

### Zod schemas (in `src/lib/apps/registry.ts`, beside `FunnelSpecSchema`)

```ts
export const GenerateSpecSchema = z.object({
  generatorType: z.string().min(1),
  table: z.string().min(1),            // logical table id; rewritten to UUID on install
  siteTitle: z.string().min(1).optional(),
}).strict();

export const PublishSpecSchema = z.object({
  targetType: z.string().min(1),
}).strict();
```

Added to `ViewSchema.bindings` (`.strict()` at registry.ts:226):
```ts
generate: GenerateSpecSchema.optional(),
publish: PublishSpecSchema.optional(),
```

### mergeBundle allowlist (the funnel shadow-path lesson)

`src/lib/packs/bundle.ts` — carry both keys through the merge or a bundled Web Designer silently
drops them. Three edits, both keys, single-valued first-child-wins like `funnel`:
- accumulators (~L94): `let generate; let publish;`
- read block (~L129): `if (generate === undefined && b.generate !== undefined) generate = b.generate;` (same for publish)
- write block (~L159): `if (generate !== undefined) bindings.generate = generate;` (same for publish)

## Generator registry + static-site generator (settles open-question (b))

**Registry shape (decided):** lightweight `Record<type, adapter>` dispatch, mirroring
`channels/registry.ts` and the publisher registry already built in Phase 1.
- _Rationale:_ settles spec open-question (b). Publishers already chose lightweight dispatch;
  generators mirror. No metadata-catalog (TDR-006) need — generators are behavioral adapters.

### `src/lib/generators/registry.ts`
```ts
const adapters: Record<string, GeneratorAdapter> = { "static-site": staticSiteGenerator };
export function getGeneratorAdapter(type: string): GeneratorAdapter {
  const a = adapters[type];
  if (!a) throw new Error(`Unknown generator type: ${type}`);
  return a;
}
```

### `src/lib/generators/static-site-generator.ts`
`staticSiteGenerator: GeneratorAdapter`. `generate(rows, config)`:
1. Filter `status === "published"`.
2. Sort by `order` ascending, stable.
3. Render each row by `kind` (hero/features/cta/text → distinct HTML block), HTML-escaping all
   text and attr-escaping all URLs.
4. Compose one `index.html` (uses `config.siteTitle` for `<title>`; inline `<style>`, no external
   assets — matches artifact "self-contained" ethos).
5. Return `Artifact { files: [{ path: "index.html", content }], entryPoint: "index.html", hash }`
   where `hash` is a deterministic content hash (sha256 of concatenated file contents) — same input
   → same hash (enables the `deployments.artifactHash` idempotency later).

Pure: no DB, no egress, no `Date.now()`/random (deterministic). Rows passed in by the caller (the
row loader is Phase 3).

## Data flow

```
pack manifest (view.bindings.generate/publish)
        │  install → rewriteViewRefs rewrites `table` → UUID
        ▼
[Phase 3 loader]  reads section rows from the table  ── (NOT this phase)
        │  rows: Array<Record<string,unknown>>
        ▼
getGeneratorAdapter("static-site").generate(rows, {siteTitle})
        │  filter published → sort order → render per kind → escape
        ▼
Artifact { files:[index.html], entryPoint, hash }
        │
        ▼
getPublisherAdapter("github-pages").publish(artifact, {owner,repo,token})
        │  PUT /contents per file on gh-pages  (mocked in tests)
        ▼
PublishResult { success, url, commit }
```

## Error & Rescue Registry

| Error / edge | Trigger | Impact | Rescue (this phase) |
|--------------|---------|--------|---------------------|
| No published rows | all rows draft/empty table | empty site | generate a valid page with a single "No content yet" placeholder section — never emit a broken/empty `index.html`; `Artifact` is always well-formed |
| Unknown `kind` | typo / future kind | section could break layout | skip the row (same fail-safe as draft); do not throw — one bad row must not fail the whole page |
| Missing `order` | row without order | nondeterministic sort | treat missing/non-numeric `order` as `+Infinity` (sorts last), stable — deterministic output preserved |
| XSS in `body`/`heading` | user pastes `<script>` | injected script on the published site | HTML-escape ALL text nodes; attr-escape ALL URLs; `javascript:` URLs stripped to `#` |
| Unknown generatorType | manifest typo | crash at generate | `getGeneratorAdapter` throws `Unknown generator type: X` — named, visible (Principle #2) |
| Unknown targetType | manifest typo | crash at publish | `getPublisherAdapter` throws `Unknown publish target type: X` (Phase 1, already tested) |
| Bundle drops generate/publish | mergeBundle allowlist miss | silent — pack loses its site | the funnel shadow-path lesson; a bundle test asserts both keys survive the merge |
| Malformed manifest arm | extra/misspelled key | should fail loudly | `.strict()` on both schemas rejects unknown keys at parse |

## What already exists (reuse, don't rebuild)

- `src/lib/publishers/{types,registry,github-pages-adapter}.ts` — Phase 1, DONE. `Artifact`,
  `PublishResult`, `getPublisherAdapter`, masking. The generator's output type is `Artifact` from here.
- `src/lib/generators/types.ts` — `GeneratorAdapter` interface, Phase 1. This phase adds registry + adapter.
- `FunnelSpecSchema` / `FunnelBandSpecSchema` (`registry.ts:180-213`) — the exact `.strict()` +
  `table`-named-ref + `ViewSchema.bindings` precedent to mirror.
- `channels/registry.ts` — the `Record<type,adapter>` dispatch to mirror for generators.
- `bundle.ts:88-160` — the mergeBundle accumulator/read/write pattern (funnel is the template).
- `publish_targets` / `deployments` tables — Phase 1. The `artifactHash` column is why `generate`
  returns a deterministic hash now.

## NOT in scope (deferred, with rationale)

| Deferred | Why |
|----------|-----|
| API routes / 202+polling | Phase 3. No user-triggered egress this phase. `data-flow.md` row #11 lands there (release-gating THEN, not now). |
| Row loader (DB read → rows) | Phase 3. Generator is pure over passed-in rows; a test feeds fixtures. |
| UI (declare target, hit publish) | Phase 4. |
| `relay-web-assets` / `relay-web-publisher` packs (full) | Phase 5. This doc locks only the row contract + seam the generator needs; the full pack (permissions, seed data, gallery primitive, bundle) is Phase 5. |
| Live GitHub Pages publish smoke (real token/repo) | Phase 5; promotes TDR-039 proposed→accepted. Tests here mock `fetch`. |
| Multiple generate/publish arms, `generateFrom` refs | YAGNI; additive later. |
| `gallery` primitive | separate standalone Core primitive; not the generator. |
| Themes / custom domains / SEO / analytics | Phase 5+ pack features; the generator emits one self-contained default-styled page. |

## End-to-end check (Phase 2 done means)

1. `npm test` green incl. all new test files; full suite = only the 8 known pre-existing failures.
2. `getGeneratorAdapter("static-site")` resolves; `("nope")` throws.
3. A manifest fixture declaring `generate:`+`publish:` round-trips through `parseAppManifest` AND
   `mergeBundle` (both keys survive the merge).
4. Fixture rows → `staticSiteGenerator.generate` → valid `Artifact` → `githubPagesAdapter.publish`
   (mocked fetch) succeeds — the full generate→publish chain in one test.
5. `git diff --stat` touches only `src/lib/generators/`, `src/lib/apps/registry.ts`,
   `src/lib/packs/bundle.ts`, and tests. No storage change (Phase 1 did that) → schema/pure-function
   change, NOT runtime-registry-adjacent → no dev-boot smoke required this phase.

## Tests (TDD — write first)

- `generators/__tests__/registry.test.ts` — hit `static-site`, miss throws.
- `generators/__tests__/static-site-generator.test.ts` — real rows → Artifact shape; deterministic
  hash (same input twice → equal hash); draft/unknown-status excluded; unknown-kind skipped; missing
  order sorts last; HTML-escape of `<script>` in heading/body; `javascript:` URL stripped; empty
  published set → placeholder page (never empty/broken).
- `apps/__tests__/…` (manifest) — a manifest with `generate:`/`publish:` parses; a misspelled arm key
  is rejected by `.strict()`.
- `packs/__tests__/bundle.test.ts` (extend) — a child declaring `generate:`/`publish:` carries both
  through to the merged manifest.
- integration (co-located) — fixture rows → generate → publish (mocked fetch) → success.

## Release decision (deferred to code-done, per operator)

MINOR bump candidate (new manifest capability). Developer/pack-author-facing CHANGELOG story. Whether
to tag+publish tonight vs. hold unreleased with the Phase-1 tail is decided when the diff is done.
If released: apiVersion window bump required (every MINOR — `CURRENT_PLUGIN_API_VERSION` +
registry previous-MINOR + 3 example plugin.yamls, same commit).
