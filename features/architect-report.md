---
generated: 2026-07-16
mode: integration-design
goal: relay-operator-workshop-enablement
---

# Architect Report — Relay Operator Workshop enablement

## Decision frame

The first Training product is a zero-founder-runtime applied workshop, not an
LMS or a content subscription. Relay's architectural responsibility is narrow:
provide a truthful local lab bench, deterministic preflight, governed capstone,
automated evidence and a retained artifact. Website owns commerce/access;
Motion owns audiovisual production; the Training owner owns curriculum and the
learning-unit envelope.

The first workshop should reuse the Marketing Line pack, current product docs,
Chat app composition, workflow HITL, cost/trust surfaces, operations receipts,
output documents, app-to-pack export and the static demo. Creating parallel
workshop implementations of those systems would increase drift and make the
zero-founder promise less credible.

## Content-engine audit

| Engine | Canonical strength | Reuse decision | Duplication forbidden |
|---|---|---|---|
| Relay `_ASSETS` | source-derived product catalog, journeys, synthetic seed, screenshots, docs/API, memos and static demo | source and verify the Relay workshop fragment and sample lane here | no new workshop docs/demo tree outside `_ASSETS` |
| Orionfold Motion | content-hashed source snapshots, claims/rights gates, provider plans, masters/renditions, QC and delivery receipts | submit one approved source-rich job; consume verified local rendition bundles | no video/render pipeline in Relay or Website |
| Orionfold Website | Astro content types, product pages, stories/memos/receipts, Stripe catalog/webhooks and public publishing | own offer, public sample, guest checkout, access delivery and later optional identity | no product-runtime truth or audiovisual generation |
| Orionfold Books | committed-source ingest and deterministic EPUB/PDF/HTML rendering | use chapters as doctrine/deeper reading and paid durable companions | no workshop runtime or copied Relay instructions |
| Orionfold Proof | config-hashed evidence, verdict, failure/repro narrative and export precedent | reuse semantics and presentation precedent; Relay composes its own existing operations evidence | no required Proof service and no second evaluation engine |
| Arena static demo | fixture shim, mutable static simulation, deploy rewrite and link verification | keep as quality bar; Relay's existing `_ASSETS/demo` already adopts the architecture | no copied Arena content or second Relay simulator |

## Existing Relay seams

| Workshop need | Existing Relay seam | Architectural action |
|---|---|---|
| Canonical example | `src/lib/packs/templates/relay-marketing/` and `_ASSETS/memos/marketing-line/` | use one versioned fixture family |
| Guided construction | Chat app builder, app registry, pack install, workflows | orchestrate existing actions; do not create a workshop runtime engine |
| Human checkpoint | workflow HITL and Inbox notification flow | assert/configure one checkpoint |
| Cost and trust | runtime routing, Settings, Monitor, cost/budget views | cite/deep-link existing surfaces |
| Completion evaluation | `src/lib/operations/criteria.ts`, `evaluate.ts`, `receipts.ts` | add workshop criteria composition/export, not a new evaluator |
| Retained outputs | `src/lib/documents/output-scanner.ts` | include captured versioned outputs |
| Portable capstone | `src/lib/packs/app-exporter.ts` and pack export route | export only the learner's user-created app; preserve installed-pack protections |
| Current help | packaged knowledge bundle and version-aware Chat help | provide edition-matched rescue links |
| Public sample | `_ASSETS/demo` static simulator | add one workshop lane and preflight state |
| Home proof | G-062 module registry and G-061 Render view | prioritize before workshop beta |

## Integration boundary

```text
Training-owned learning unit
  ├─ Website offer/access adapter
  ├─ Motion source-snapshotted rendition job
  └─ Relay source fragment
       ├─ product version + source hashes
       ├─ Marketing Line starter identity
       ├─ required capabilities + preflight
       ├─ capstone criteria + rescue catalog
       ├─ demo lane references
       └─ completion-bundle contract

Relay local execution
  → user-created app/workflow
  → human checkpoint + cost/trust evidence
  → operations receipt + output documents
  → app-to-pack export
  → redacted completion bundle
```

The learning-unit envelope is not a Relay database entity in W0/W1. Relay
consumes a content-hashed edition manifest delivered after purchase and emits a
source/evidence fragment from `_ASSETS`. This keeps the first workshop
account-free and prevents Relay from becoming the portfolio LMS.

G-087 must decide whether W2 needs a minimal local `workshop_run` record or can
derive restart-safe progress from the edition manifest, project/app identity,
workflow run markers and operations receipts. If a generic persisted workshop
domain is accepted, create a TDR before schema implementation; do not hide it in
an app component or arbitrary settings JSON.

## Layer design

### Source and edition

- Training owns stable unit/edition ids, learner promise, syllabus, paid/free
  boundary, rubric language and access policy.
- Relay owns exact product version, source hashes, required capabilities,
  starter pack/app identity, preflight checks and capstone evidence mapping.
- Motion snapshots approved sources into `job.json`; Website renders public
  metadata and access but never becomes the canonical curriculum source.
- Unknown schema, stale product version, missing hash or tampered starter fails
  closed with a named edition error.

### Preflight and starter

- Reuse environment/runtime discovery and the current package/data-dir/version
  surfaces.
- Seed into an isolated project/app with synthetic Marketing Line data. Never
  inspect or copy a learner's existing workspace without an explicit import
  step.
- Preflight is read-only until the learner confirms starter installation.
- A no-runtime or incompatible-runtime state supplies a known-good local/mock
  path where truthful; it never claims a provider call occurred.

### Checkpoints and rescue

- A workshop checkpoint references observable Relay state or an operations
  success criterion. It is not arbitrary course completion metadata.
- Deterministic checks run first. Rubric-backed judgment must declare the model,
  prompt/version, limitations and retry behavior.
- Failures name the failed criterion, actual evidence, next action and known-good
  fallback. No silent auto-repair.
- The existing workflow retry, output, receipt and notification paths remain
  authoritative.

### Completion bundle

The local bundle should compose:

- workshop edition id and hashes;
- Relay version and non-secret environment summary;
- capstone project/app/workflow ids;
- operations receipt verdict and criterion evidence;
- selected output documents;
- the user-created app pack artifact/hash;
- an explicit limitation/redaction record.

Do not include provider keys, raw settings secrets, unrelated workspace data,
paid pack source, absolute user paths, customer content not selected by the
learner, or model prompt transcripts unless explicitly required and redacted.
Website may render a completion page from this bundle, but the local evidence
remains usable without Website availability.

## UX integration

- G-062 supplies a typed dashboard module registry. Workshop progress may later
  consume that registry as an optional local module; it must not hard-code a
  promotional card or outrank unresolved operator action.
- G-061 supplies the shared semantic renderer for capstone records. Workshop
  screens must not create their own card renderer.
- A bounded workshop/checkpoint panel may exist for the active edition. It must
  preserve the ordinary Relay navigation and expose source routes rather than
  clone Tables, Workflows, Inbox, Monitor or Costs.
- All interactive surfaces retain keyboard semantics, visible focus and system
  cursor behavior.

## Release and dependency posture

| Dependency | Type | Consequence |
|---|---|---|
| G-062 and G-061 | owned hard sequence within W0 | marketing-grade product proof precedes the public demand probe |
| G-023 | shared hard prerequisite for W1 | reused demo reset must be reliable before a restartable sample lane |
| G-038 | coordination dependency | fresh-install prompt behavior should not disrupt workshop onboarding |
| G-025 | recurring release gate | customer-identical validation before founding beta |
| G-053 | non-blocking coordination | repository publishing is optional after local capstone export; GitHub is not required |
| Motion MOTION-G-012 | coordination/conformance | automation of rendition/export improves repeatability; a validated manual bundle may launch first |
| Website workshop commerce/access goals | external release gate | no Relay implementation should absorb checkout, fulfillment or auth |

Customer-owned Relay Host and enterprise connectors remain independent
workstreams. Workshop local alpha does not wait for Host, cloud, connectors,
Supabase Auth or Training Pass architecture.

## TDR disposition

No TDR is created during grooming because the persisted workshop-domain and
paid-edition delivery choices remain operator gates. G-087 must create a TDR if
either choice introduces a public manifest/schema, new local persistence model,
or signature/entitlement boundary. Reusing existing operations receipts,
pack export and `_ASSETS` derivation does not itself require a new TDR.

## Verification and rescue

- Contract tests: schema/version/hash, paid/free boundaries, unsafe paths and
  redaction.
- Preflight matrices: fresh/used data dirs, supported/unsupported runtime,
  offline state, missing starter, stale edition and double start.
- Capstone matrices: pass, partial, failed checkpoint, retry, rubric
  unavailable, restart and known-good fallback.
- Export matrices: user-created app, installed licensed pack refusal, missing
  artifact, output versions, secrets/path leak scan and deterministic hashes.
- Browser proof: dashboard, Render view, sample lane and local workshop path at
  desktop/tablet/mobile in light/dark themes.
- Customer-identical smoke: purchase/access is simulated locally until Website
  owns it; Relay start-to-bundle completes with zero founder action.

If the generic workshop UI or persistence begins duplicating an LMS, stop and
return to the edition-manifest plus existing Relay primitives. If Motion or
Website contracts are unavailable, produce the versioned local handoff bundle
and stop before external publication.

---

*Generated by `/architect` — integration design mode*
