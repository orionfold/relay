---
id: TDR-039
title: Generator/Publisher Substrate — Packs That Emit and Publish Artifacts
status: accepted
date: 2026-07-06
category: infrastructure
---

# TDR-039: Generator/Publisher Substrate

## Context

Every Relay pack today is **declarative composition**: a `pack.yaml` wrapping a
`base/manifest.yaml` (an `AppManifest`) that wires `tables` + `profiles` +
`blueprints` + `schedules` + a `view`. A pack gives the user the *operating
system* to run a function inside Relay — `relay-crm` manages a lead book,
`relay-social` manages content — but a pack never produces an artifact that
leaves Relay. There is no "generate a thing and publish it somewhere" verb.

A new product direction needs exactly that. The first consumer is a **Web
Designer** bundle — `relay-web-assets` (catalog + visuals + a gallery
primitive, harvested from `~/orionfold/website`) + `relay-web-publisher`
(generates a static site from the managed data and deploys it to the user's
GitHub Pages). And it must generalize: the operator named a **family** of
future generators on the same substrate — social-media generator, video
creator, research-paper publisher, book publisher. So this is not a one-off
pack feature; it is a **new capability class**: *packs that generate an
artifact from their managed data and publish it to a target.*

Building the GitHub Pages deploy as bespoke logic inside one pack would bake a
one-off that the next four generators cannot reuse. The right first move is the
substrate, with the Web Designer bundle riding it as the proving consumer.

### What the existing architecture already provides (grounding)

- **The pack-format law** (`src/lib/packs/format.ts` doc-comment): *"the pack
  format extends AROUND the AppManifest, not INTO it."* The `AppManifest`
  contract is pristine — distribution concerns (`entitlement`, `price`,
  `bundle`) live on the `pack.yaml` wrapper, never on the inner manifest. Any
  new capability class must respect this seam.
- **The channel-delivery pattern** (TDR-018, `src/lib/channels/`): the canonical
  way Relay causes an external, user-directed side effect. A static
  `ChannelAdapter` registry (`slack`/`telegram`/`webhook`), each adapter
  implementing `send(message, config)` + `testConnection(config)`; credentials
  stored as **JSON-in-a-TEXT column** (`channelConfigs.config`) with sensitive
  keys masked at every API boundary (`maskChannelConfig()`); adapters receive
  the parsed unmasked config only server-side at send time.
- **The two-path trust model** (TDR-037): every plugin/bundle classifies at load
  into `'self'` (self-extension, zero ceremony) or `'third-party'` (capability
  lockfile + click-accept). Capabilities are a declared set — `fs`, `net`,
  `child_process`, `env`. **Kind 5 primitives-bundles always classify `'self'`**
  (data-only, no executable surface). Strategy §10 (cited throughout TDR-037)
  **refused a "publish flow"** — but in the *marketplace / publish-plugins-to-a-
  registry* sense; a *user-artifact* publish is a different meaning (see below).
- **The plugin-contributed-config rule** (TDR-034): a future
  plugin-contributed channel persists as a `channelConfigs`-shaped row with a
  `plugin:<id>:<target>` **composite id**, NOT a new `pluginId` column. A publish
  target is exactly that shape.
- **The egress-inventory promise** (`docs/trust/data-flow.md`, README.md:107):
  *"Relay never sends your data to Orionfold — no telemetry, no update checks,
  no license server."* The promise is defined **negatively and precisely** as a
  complete, code-true egress inventory. It already blesses user-directed
  outbound calls as first-class: channel delivery with your tokens (row 5),
  GitHub imports with a repo URL you supply (row 7), git fetch to your own
  origin (row 10). The promise forbids sending data *to Orionfold*, not egress
  in general.

## Decision

**Add a generator/publisher substrate as a first-class Relay capability the
manifest DECLARES and the substrate EXECUTES — not as pack-shipped code. Split
it into two independent halves (generate, publish), each a registry mirroring
the channel-adapter pattern. Keep packs data-only (`'self'`, zero-ceremony);
the substrate owns the external side effect and its one consent gate.**

### 1. Two halves, two registries

Generation and publishing are separate abstractions with separate registries.
A pack may declare either or both; the Web Designer bundle uses one child for
each.

```
manifest data ──[Generator]──> Artifact ──[Publisher]──> external target
   (tables)      registry       (file set)   registry     (GitHub Pages)
```

- **`Artifact`** is the contract between the halves: a generated file set +
  an entry point. `{ files: { path: string; content: Buffer | string }[];
  entryPoint: string; kind: string }`. It never touches the DB; it is produced
  in memory / a scratch dir and handed to a publisher.

- **`GeneratorAdapter`** (`src/lib/generators/types.ts`, new):
  ```
  interface GeneratorAdapter {
    generatorType: string;                              // "static-site", later "social-post", "video", ...
    generate(input: GeneratorInput): Promise<Artifact>; // reads pack data, emits files
  }
  ```
  `GeneratorInput` carries the resolved pack rows + generator config (a
  template choice, a theme). Pure-ish: reads DB rows passed in, writes only to
  a scratch dir, returns the `Artifact`. NO external egress in a generator.

- **`PublisherAdapter`** (`src/lib/publishers/types.ts`, new) — mirrors
  `ChannelAdapter` almost 1:1:
  ```
  interface PublisherAdapter {
    targetType: string;                                    // "github-pages", later "s3", "netlify", ...
    publish(artifact: Artifact, config): Promise<PublishResult>;
    testConnection(config): Promise<{ ok: boolean; error?: string }>;
  }
  // PublishResult: { success: boolean; url?: string; commit?: string; error?: string }
  ```
  Registries are static `Record<type, adapter>` maps with
  `getGeneratorAdapter(type)` / `getPublisherAdapter(type)` throwing on unknown
  (Principle #2: named errors, not silent fallthrough).

### 2. Where the declaration lives (the seam)

The pack-format law forces a two-part answer:

- **Generation is app behavior** — it reads the app's own primitives (tables)
  and produces an artifact from them. It attaches to the **`AppManifest`** as a
  new optional primitive slot, alongside `view`:
  ```yaml
  # base/manifest.yaml
  generate:
    - id: site
      generator: static-site
      template: showcase          # generator-specific config
      source: { products: products, visuals: visuals }   # table refs, UUID-rewritten like `view` refs
  ```
  A new `.strict()` `GenerateSpecSchema` arm on `AppManifestSchema`, table refs
  named so `rewriteViewRefs` deep-rewrites logical→UUID for free (the exact
  discipline TDR-038 / the funnel primitive follow). This is composition —
  no code, no escape hatch.

- **Publishing is a distribution + security concern** (an external target, a
  credential, a capability). It does **NOT** go on the pristine `AppManifest`.
  The *binding* of a manifest's generated artifact to a concrete target lives
  in a **publish-target config row** (persisted, per §3), created by the user
  (or seeded by a pack as a `plugin:<id>:<target>` composite-id row per
  TDR-034). The manifest may *name* which generate-id feeds a publish, but the
  target + credential are never in the manifest:
  ```yaml
  publish:
    - id: deploy-site
      generatedArtifact: site      # references a generate[].id above
      # target + credential resolved at runtime from the publish-target config row,
      # NEVER inlined here (no secrets in a shipped manifest)
  ```

### 3. Credential + status storage (reuse, don't fork)

- **Publish-target credentials** persist exactly like channel configs: a
  `publishTargets` table (new), `config` as JSON-in-TEXT, sensitive keys
  (`githubToken`, etc.) in a `SENSITIVE_PUBLISH_KEYS` list, masked by
  `maskPublishTarget()` at **every** API boundary. Adapters receive the parsed
  unmasked config only server-side at publish time. A new architect drift check
  enforces the invariant: *"publishTargets.config never returned unmasked."*
  A GitHub token fits this pattern with **no new storage primitive**.

- **Publish is NOT fire-and-forget** (the one place it diverges from channels).
  It needs a durable result surface: a `deployments` table (new) — `{ id,
  appId, targetId, status, url, commit, artifactHash, startedAt, finishedAt,
  error }`. Every publish attempt writes a row (Principle #1: the failure path
  produces output). The `view` can surface it (a deployments panel), and this
  is the natural data model for the future generators too (a book-publish
  deployment, a video-render deployment).

### 4. Consent: reuse the capability gate, add one publish confirmation

A publishing pack is a **new capability class**, but it rides the existing gate
rather than inventing one:

- The `github-pages` publisher needs `net` (GitHub API) and possibly
  `child_process` + `fs` (git). Those are the **existing** declared capabilities
  (TDR-037). The substrate — not each pack — is the capability holder: a
  Relay-authored generator/publisher classifies `'self'` (zero-ceremony
  install), keeping packs data-only. The pack declares *intent* (`generate` /
  `publish` blocks); the substrate owns the *effect* and its capability.
- **A publish is an explicit, user-initiated, reversible-target action** — never
  automatic on install, never on a schedule without the user wiring it. The
  first publish to a target requires the user to (a) create the publish-target
  config (supply repo + token) and (b) confirm the deploy. This mirrors how a
  channel does nothing until the user configures it and a workflow sends to it.

### 5. Promise compliance (hard requirement, not optional)

Publishing a user's site to the **user's own** GitHub Pages does **NOT** violate
"Relay never sends your data to Orionfold" — the destination is the user's
target, the credential is the user's, the action is user-initiated, and nothing
routes through orionfold.com. It is the same shape as the already-blessed rows
5 (channel delivery), 7 (GitHub import), and 10 (git fetch to your origin).

**BUT** the promise's *mechanism* is that `docs/trust/data-flow.md` is a
**complete, code-true egress inventory**. Therefore the substrate MUST add a new
row to that inventory in the same change that ships a publisher:

> **#11 — Artifact publish** → `github.com` / user-configured target →
> your generated site content → **gated on you configuring the target +
> supplying a credential; never automatic; never to orionfold.com.**

Missing this row breaks the promise's real mechanism (the complete inventory)
*even though no data ever reaches Orionfold*. This is a release-gating checklist
item, enforced like the "trust-doc claims must stay code-true" standing rule.

## Consequences

### What this unblocks

- The Web Designer bundle (`relay-web-assets` + `relay-web-publisher`) ships as
  the first consumer with no bespoke deploy code — it declares `generate` +
  `publish`, the substrate does the work.
- The named future generators (social, video, research-paper, book) each add
  ONE `GeneratorAdapter` + reuse the whole publish/credential/status half.
- The gallery primitive (`relay-web-assets`) is independent of the substrate —
  it's a plain `view.bindings.gallery` Core primitive (like the funnel), so
  Web Asset Manager is useful standalone even before a publisher exists.

### What this reinforces

- **Pack-format law** — generation attaches to the manifest (app behavior);
  target + credential stay off it (distribution/security). The seam holds.
- **Channel-adapter pattern** (TDR-018) as the template for user-directed
  external effects — registry + `testConnection` + masked JSON-in-TEXT creds.
- **TDR-034 composite-id rule** — pack-contributed publish targets are
  `plugin:<id>:<target>` rows, not a new column.
- **TDR-037 self-extension default** — packs stay data-only `'self'`; the
  substrate holds the capability, so installing a generator pack stays
  zero-ceremony.

### What this rejects

- **Publishing as a pack-shipped Kind-1 `net`-capability plugin.** That would
  drop each generator pack out of zero-ceremony self-extension and duplicate
  the deploy logic per pack. The substrate-owns-the-effect model keeps packs
  declarative and the capability in one audited place.
- **Inlining target + credential in the manifest.** Secrets never ship in a
  `base/manifest.yaml`; the target binding is a runtime config row.
- **A general-purpose secrets vault.** Not needed — the masked JSON-in-TEXT
  config-row pattern already covers it. (Explicitly NOT building new crypto/
  keychain infra for v1.)
- **Reopening the refused marketplace (strategy §10).** This publishes the
  *user's artifact to the user's target*, not *plugins to a registry*. The TDR
  draws the line so the two are never conflated.

### Blast radius

| Layer | Impact |
|-------|--------|
| Data | New `publishTargets` + `deployments` tables → schema.ts + bootstrap.ts + clear.ts (FK-safe) + migration. Medium. |
| Registry/Runtime | New `src/lib/generators/` + `src/lib/publishers/` (types + registry + first adapter). New, isolated. |
| Manifest schema | New `.strict()` `generate`/`publish` arms on `AppManifestSchema` (`registry.ts`); `rewriteViewRefs` extended to the new table refs; `mergeBundle` accumulator extended (else they vanish in a bundle — the funnel shadow-path lesson). Medium. |
| API | New routes: create/test/mask publish-target; trigger a publish (returns 202, fire-and-forget per TDR-001; status via `deployments` polling per TDR-003). Medium. |
| Trust docs | `docs/trust/data-flow.md` row #11 (release-gating). Low but MANDATORY. |
| Frontend | A deployments/publish panel in the view; a publish-target settings surface. Medium. |

**Classification: High** — 5+ layers, net-new capability class. Phased: (1)
substrate types + registries + storage + `github-pages` adapter behind tests;
(2) manifest schema arms + bundle-merge + UUID-rewrite; (3) API + trust-doc row;
(4) frontend surfaces; (5) the two Web Designer packs as the consumer.

### Security notes

- **Credential masking is the invariant** — a leaked `githubToken` is the worst
  failure. Every API boundary masks; a drift check enforces it; adapters see
  unmasked config only server-side at publish time.
- **`child_process` git usage** (if the adapter shells out to git rather than
  the GitHub API) activates TDR-037's `child_process` capability — prefer the
  GitHub Contents API over shelling `git` where possible to avoid the heavier
  capability and keep the adapter portable (no git binary dependency).
- **Generated content is the user's own** — the generator reads only the pack's
  own tables; it never pulls Orionfold data in, and the artifact goes only to
  the user's configured target.

## Alternatives Considered

- **One combined `Publisher` that also generates.** Rejected — generation
  (reads data, emits files) and publishing (auth, external egress, status) have
  different capability profiles, different failure modes, and different reuse
  axes (many generators × few targets). Two registries let a new generator
  reuse every target and vice versa.
- **A `publish` block on the pristine `AppManifest`.** Rejected — violates the
  pack-format law (target + credential are distribution/security, not app
  composition) and would risk secrets in a shipped manifest.
- **Per-pack bespoke deploy (extract-on-third-use).** Rejected *for this case*:
  the operator named five generators up front, so the substrate is justified now
  (the abstraction earns its weight — Principle #6). A one-off would force a
  rewrite at the second generator.
- **Generator mirrors the document-processor registry (TDR-017).** Noted as an
  open design question for the generation half — TDR-017's processor-registry
  shape may fit `GeneratorAdapter`; to be confirmed when the generation half is
  designed in detail (out of scope for this decision, which fixes the two-halves
  split and the publish half).

## References

- `src/lib/packs/format.ts` (pack-format law: extend AROUND the manifest)
- `src/lib/apps/registry.ts` (`AppManifestSchema`, `ViewSchema`, `rewriteViewRefs`)
- `src/lib/channels/` + TDR-018 (channel-adapter pattern — the mirror)
- `src/lib/channels/types.ts` (`ChannelAdapter`, `SENSITIVE_CONFIG_KEYS`, `maskChannelConfig`)
- TDR-037 (two-path trust model, capability set, strategy §10 publish-flow refusal)
- TDR-034 (plugin-contributed config as `plugin:<id>:<target>` composite-id rows)
- TDR-001 (fire-and-forget → 202), TDR-003 (DB polling for status)
- `docs/trust/data-flow.md` + README.md:107 (the egress-inventory promise — row #11)
- `features/pack-depth-next-wave.md` (the ticket this substrate serves — Web Designer)
- `features/pack-taxonomy.md` (bundle-child discipline the Web Designer bundle follows)
- Memory `phone-home-definition` (promise forbids SENDS to Orionfold, not user-directed egress)
