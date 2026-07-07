---
generated: 2026-07-06
mode: integration
---

# Architect Report

## Integration Design — Generator/Publisher Substrate (2026-07-06)

### New Capability

A new capability class for Relay packs: **packs that generate an artifact from
their managed data and publish it to an external target.** First consumer is a
**Web Designer** bundle (`relay-web-assets` + `relay-web-publisher`); it must
generalize to a named family of future generators (social, video, research
paper, book). Decision codified in **TDR-039** (proposed).

### Pattern Alignment

| Core Pattern | Applies | How |
|-------------|---------|-----|
| Fire-and-forget execution (TDR-001) | yes | Trigger-publish route returns 202; status via `deployments` polling. |
| DB polling for status (TDR-003) | yes | Publish is NOT fire-and-forget-and-forget — a `deployments` row is the durable status surface. |
| Server Components for reads (TDR-004) | yes | Deployments/publish panel reads the `deployments` table directly. |
| Multi-runtime adapter registry (TDR-006) | yes (as template) | `GeneratorAdapter` + `PublisherAdapter` registries mirror the adapter-registry shape. |
| Channel adapter registry (TDR-018) | yes (the mirror) | `PublisherAdapter { publish, testConnection }` maps ~1:1 to `ChannelAdapter`; masked JSON-in-TEXT creds. |
| Plugin-contributed config as composite id (TDR-034) | yes | Pack-contributed publish targets = `plugin:<id>:<target>` rows, not a new column. |
| Two-path trust model (TDR-037) | yes | Substrate holds the `net`/`child_process` capability; packs stay data-only `'self'` (zero-ceremony). |
| Idempotent bootstrap (TDR-009) | yes | New `publishTargets` + `deployments` tables added to bootstrap + clear (FK-safe). |
| JSON-in-TEXT columns (TDR-011) | yes | Publish-target credentials as a JSON `config` TEXT column, sensitive keys masked. |

### The two-halves design

```
manifest data ──[Generator]──> Artifact ──[Publisher]──> external target
   (tables)      registry       (file set)   registry     (GitHub Pages)
```

- **`GeneratorAdapter`** (`src/lib/generators/`) — reads pack rows, emits an
  `Artifact` (file set + entry point). No egress.
- **`PublisherAdapter`** (`src/lib/publishers/`) — takes an `Artifact` + a
  target config, publishes, returns `{ success, url, commit, error }`. First
  adapter: `github-pages`.
- Two registries so N generators × M targets compose freely.

### The seam (pack-format law: extend AROUND the manifest)

- **`generate:`** — a new `.strict()` arm on `AppManifestSchema` (app behavior;
  reads the app's own tables). Table refs UUID-rewritten via `rewriteViewRefs`
  (install.ts:674 — recursive; the new arm must sit where the rewriter descends,
  OR the rewriter is extended to it. Pin at spec time.)
- **`publish:`** — names a `generate[].id`; the target + credential are NEVER in
  the manifest. They live in a runtime `publishTargets` config row (user-created
  or a pack-seeded `plugin:<id>:<target>` composite-id row).

### Data Model Design

- **`publishTargets`** (new): `{ id (composite for pack-contributed), appId,
  targetType, config (JSON TEXT, sensitive keys masked), createdAt }`.
- **`deployments`** (new): `{ id, appId, targetId, status, url, commit,
  artifactHash, startedAt, finishedAt, error }`.
- Both → schema.ts + bootstrap.ts + clear.ts (FK-safe order) + a migration.

### Security + Promise (hard requirements)

1. **Credential masking invariant** — `publishTargets.config` NEVER returned
   unmasked; `maskPublishTarget()` at every API boundary; a new architect drift
   check enforces it. A GitHub token fits the existing pattern — **no new
   secrets vault**.
2. **Promise compliance** — publishing to the USER'S OWN GitHub Pages does not
   violate "Relay never sends your data to Orionfold" (user's target, user's
   credential, user-initiated, never orionfold.com — same shape as blessed
   egress rows 5/7/10). BUT the promise's mechanism is the *complete* egress
   inventory, so shipping a publisher **MUST add row #11 to
   `docs/trust/data-flow.md`** (release-gating).
3. **Prefer the GitHub Contents API over shelling `git`** — avoids the heavier
   `child_process` capability and a git-binary dependency.

### New TDRs Needed

- **TDR-039** (this run) — the substrate decision. **Proposed**; promote to
  accepted after a live publish smoke.
- A follow-up may be warranted for the **generation half** specifically (does it
  mirror the document-processor registry, TDR-017?) — deferred to the
  generation-half design.

### Implementation Sequence (phased — High blast radius, 5+ layers)

1. Substrate types + registries + `publishTargets`/`deployments` storage +
   `github-pages` adapter (behind tests, no manifest wiring yet).
2. Manifest `generate`/`publish` `.strict()` arms + `rewriteViewRefs` extension
   + `mergeBundle` accumulator extension (else they vanish in a bundle — the
   funnel shadow-path lesson).
3. API routes (create/test/mask target; trigger publish → 202; status polling)
   + `docs/trust/data-flow.md` row #11.
4. Frontend: deployments panel + publish-target settings surface.
5. The two Web Designer packs (`relay-web-assets` with the gallery primitive +
   `relay-web-publisher`) as the first consumer; live GitHub Pages publish smoke.

### Handoff

- To `product-manager` (or direct spec authoring): turn this blueprint into
  `features/pack-web-designer.md` (bundle) + the substrate feature spec, with
  the phase sequence above and the two open design questions (rewriter placement;
  generator-registry shape vs TDR-017) named as decisions to resolve.
- The gallery primitive (`view.bindings.gallery`) is a plain Core primitive
  independent of the substrate — `relay-web-assets` is useful standalone.

---

*Generated by `/architect` — integration mode*
