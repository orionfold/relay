# Relay Field Notes — Design Spec

_Date: 2026-07-09 · Stage: `_ASSETS` T5 (Articles) · Status: design approved, pre-plan_

> Sibling context: this is one deliverable in the `_ASSETS` golden-source corpus. See the
> priority table in `HANDOFF.md` → `_ASSETS` and the overriding operator origin instruction
> pinned at the top of `_ASSETS/README.md`. Articles sit at **P2** (behind enforcement,
> the docs/demo false-green fixes, and consolidation). This spec defines the article
> pipeline; it does not authorize starting it ahead of P0/P1 work.

## 1. What it is

**Relay Field Notes** are long-form (~3,000–4,500 word), data-visualization-narrative-driven,
building-in-public dogfooding essays — Relay's version of the reference at
`ainative.business/field-notes/` ("every post is a session transcript turned into an essay").
They are the raw material the peer **website** later polishes into marketing pieces
(à la `orionfold.com/story/`, longer form), and eventually 10–20 compile into a book
(the Spark Field Notes → DGX Spark book path).

### Topology — single source of truth (operator decision, 2026-07-09)

`_ASSETS/articles/` **is** the single source of truth. Relay authors **polished, final,
publication-ready** articles there, using the website's design system as creative guidance at
authoring time. The website's role shrinks to a **verbatim copy-and-publish** (git-as-transport,
no re-skin, no downstream polish pass).

```
_ASSETS/articles/
  <slug>/
    article.md            essay, 8-section skeleton, publication-ready
    metrics.json          mined numbers; every prose number traces here
    evidence/             raw source/data (images publish; code stays private, linked out)
    screenshots/          article-specific captures only (the gap the shared library lacks)
    signature.svg         hero visual, authored to the DS contract (hand-authored geometry)
    transcript.md         authoring provenance — NEVER published
  _design-system/         VENDORED website contract (schema, svg-invariants, explainers, tokens)
  scripts/                new-article, mine-metrics, verify-article, verify-svg, scrub, drift-check, stats
```

**Consequence:** render-fidelity enforcement moves *to the source*. An article must prove it is
render-ready in `_ASSETS` before the website copies it — because nothing downstream fixes it.

### Screenshot contract (two locations, distinct roles)

- `_ASSETS/screenshots/` — the **product-wide systematic library** (88 retina PNGs,
  `{light,dark}/<surface>/<view>__{desktop,mobile}.png`, metadata-tagged, derived from the
  seeded product). Canonical, evergreen, de-duplicated. Shared across docs/demo/marketing/articles.
- `_ASSETS/articles/<slug>/screenshots/` — **article-specific** ad-hoc captures for one story
  (a specific state, a mid-flow moment, a reproduced bug, an annotated crop).

**Rule — prefer-shared, capture-only-the-gap:** an article references the shared library first;
it captures into its own folder only when the story needs a state the library does not hold.
The article verifier (§2 stage 9) resolves screenshot refs against **both** locations and **flags
a per-article shot that duplicates an existing library shot** (nudges authors to the canonical one,
prevents two drifting copies of the same surface).

## 2. Authoring lifecycle

Relay's version of the reference's proven backbone, with the single-source simplification applied.
Each stage tagged **Human** / **Agent** / **Script**.

```
BRIEF → SCAFFOLD → MINE → DRAFT → EVIDENCE-BIND → VIZ → ANNOTATE → SCRUB → GATE → STATS → COMMIT
```

1. **BRIEF** *(Human)* — the one non-derivable input: the **editorial overlay** (this article's
   angle/theme) + a permanent kebab-case slug. This is the always-present operator guidance ("D").
   **If absent, ask — do not invent it; it's the operator's.** A per-series default overlay may
   pre-fill, but the operator confirms.
2. **SCAFFOLD** *(Script)* — `scripts/new-article.sh <slug>` stamps `_ASSETS/articles/<slug>/`
   from a template: the 8-section skeleton, schema-valid frontmatter stub, empty `evidence/` +
   `screenshots/`.
3. **MINE** *(Script)* — `scripts/mine-metrics.mjs` reads **primary sources** into
   `<slug>/metrics.json`: git log (commits/versions/wall-clock window), CHANGELOG/release data,
   `_ASSETS/stats/`, and — where the series calls for it — session JSONL.
   **Hard rule: a prose number not in `metrics.json` is a bug.**
4. **DRAFT** *(Agent)* — distill transcript → essay across the fixed **8-section skeleton**:
   (1) hook w/ the specific claim → (2) why it matters for the Relay operator →
   (3) where it sits in the arc → (4) the journey (*what I ran / what happened / what it means*
   per beat) → (5) verification → (6) tradeoffs & honest gaps →
   (7) what this unlocks (3 named things) → (8) closing (ties to series + next).
   Voice: building-in-public — lead with the failure mode, cite exact numbers, admit gaps.
5. **EVIDENCE-BIND** *(Script + Agent)* — raw evidence *code* stays private in `evidence/`
   (linked out); only *images* publish. Every quantitative claim binds to `metrics.json`.
6. **VIZ** *(Agent + Script-validator)* — one **hand-authored signature SVG** (encodes the headline
   metric/topology *by geometry* — "copy the closest existing one, don't start blank") +
   **≥1 inline `fn-diagram` figure** whose figcaption carries the argument. **Token-color contract
   only** (`--svg-accent-*`, no hex literals), theme-reactive, **zero chart library**.
   Enforced by `verify-svg.mjs` (ported invariants).
7. **ANNOTATE** *(Agent)* — gutter explainer layer: 6–10 `:::define / :why / :pitfall / :math /
   :deeper` callouts, typed palette, per-piece budget.
8. **SCRUB** *(Script gate)* — **mandatory** PII/secret sweep over `article.md`, `transcript.md`,
   and text in `evidence/` before anything lands. Reference's ~12-pattern set **plus Relay tokens**
   (`sk-ant-`, license keys, `~/.relay` paths, seed customer data). Follows the repo secrets-guard
   fixture convention (placeholders < 16 chars).
9. **GATE** *(Script)* — `scripts/verify-article.mjs`, a **hard pre-commit gate**: frontmatter
   schema-valid (against the **vendored** `_design-system` schema), `summary ≤ 300`, slug == folder,
   all screenshot refs resolve **against both locations** + **prefer-shared duplicate flag**,
   **every prose number ∈ `metrics.json`**, SVG invariants, scrub clean. Plus the render-verify the
   reference deferred to the website — since we publish verbatim, it runs **here**.
10. **STATS** *(Script)* — recompute the Field Notes aggregate (article count, №-ordinals from
    git-add order, word totals) into one JSON, staged **in the same commit** as the article.
11. **COMMIT (no push)** *(Human-gated)* — stage `<slug>/` + stats together; **never auto-push**.
    Website copy-publish pulls only after the operator pushes. `_ASSETS` is strategy-owned
    (edit-via-symlink; the commit is on the strategy side, operator-driven).

**Two collapses from the single-source simplification (made explicit):**
- Reference stages 12–13 (sync-with-reskin + destination render-verify) → **gone**. Website does a
  dumb verbatim copy; all fidelity enforcement lives in stage 9.
- The website design-system contract stage 9 checks against is the **vendored `_design-system/`
  snapshot** (§3), kept honest by a **drift-check** (§3b).

## 3. Vendored design system, drift-check, and the skill

### 3a. `_ASSETS/articles/_design-system/` — the vendored contract (render-fidelity SSOT)

Four files, each with a provenance header naming its live-site source path + snapshot commit/version:

- **`frontmatter.schema.json`** — the Zod `fieldNotes` collection as JSON Schema (required
  `title/date/stage/summary`; closed `stage`/`series` enums; optional
  `tags/difficulty/signature/status/ordinal…`). Source: `ainative-business.github.io/src/content.config.ts`.
- **`svg-invariants.json`** — the ~10 machine-checkable SVG rules (token-only fills, z-order,
  `animateMotion begin ≥ 1.4s`, stroke-width set, `role="img"`+`aria-label`, ≥1 inline figure for
  published). Source: `verify_svg.sh`.
- **`explainers.json`** — the directive set (`define/why/pitfall/math/deeper/hardware`) + palette
  tokens. Source: `remark-explainers.mjs` + `explainers.css`.
- **`tokens.json`** — typography + `--svg-accent-*` / `--color-primary` token names articles may
  reference. Source: `orionfold-theme.css`.

**Why vendored, not referenced:** an article proves render-readiness against this local snapshot —
`_ASSETS` stays self-contained and self-verifying, with no authoring-time dependency on the peer repo.

### 3b. `scripts/check-design-system-drift.mjs` — the drift-guard

Same pattern as the catalog drift-guard already built. Reads the four live-site sources, re-derives
what each vendored file *should* contain, diffs against the snapshot, and **fails CLOSED** on drift
with a precise report. When the peer website repo is **not on disk**, it degrades to a loud
**SKIP-with-warning** (authoring never *requires* the website checkout; a drifted snapshot can't
hide when it *is* present). **Resync is a deliberate human act** — never auto-syncs.

### 3c. `assets-field-notes` skill — the orchestrator that RUNS the gates

Per the origin instruction (author `assets-` skills that RUN verifiers + gate on exit code — the
supervisor only checks existence). Three modes:

- **`draft <slug>`** — full lifecycle §2: ask for the overlay if absent → scaffold → mine → guide
  the 8-section draft + viz + explainers → scrub → report what needs operator input. Never publishes.
- **`verify <slug>`** — runs `verify-article.mjs` (+ `verify-svg.mjs`, scrub, drift-check preflight)
  and **gates on exit code**. The hard "is it done?" gate.
- **`publish <slug>`** — verify → recompute stats → stage `<slug>/` + stats in one commit →
  **stop, report the hash, never push.**

Each mode is **fail-loud**: a non-zero from any script halts the skill with that script's error,
never a swallowed green. Skill body stays local/gitignored; only the invoked scripts live in
`_ASSETS/scripts/`.

### 3d. Consolidation tie-in (LIVE #8)

`assets-field-notes` is one of the six `assets-` skills the origin instruction called for. The
flow supervisor (`assets-flow`) gains a "does `verify-article.mjs` pass for every published
article?" check so the pipeline supervisor finally **runs** a verifier instead of only checking
existence.

## 4. First vertical slice — article №01

Build the scripts + vendored DS **only as far as one real, bar-clearing article demands**, then
extract the reusable pipeline from what we did. The first article's `metrics.json` + `evidence/`
become the fixtures the verifiers are tested against.

### The story: *"The False Green: how our marketing docs looked done and weren't"*

This session is the story. It satisfies the three constraints — genuinely dogfooded (this
transcript), data-bearing (mines real numbers), building-in-public honest (leads with a failure):

- **Real transcript:** the "did you critically review the guides?" thread → session-history trace →
  origin-instruction recovery → structural-vs-behavioral gap diagnosis.
- **Mines real numbers:** 9 guides; ~1000-word structural gate; 88 screenshots "green";
  `verify-user-guides.mjs`'s banned-phrase/section/word-count checks vs. zero claim-verification;
  the catalog drift-guard that *does* enforce sync; the demo verifier proven RED on the mock.
  All trace to real files + git.
- **Signature SVG writes itself:** a two-band "structural-green vs. behavior-verified" chart — the
  gap between "files exist" and "claims are true" *is* the headline metric.
- **Native honest-gap voice:** "we shipped something that passed its own checks and was still wrong,
  here's how we caught it." Anti-marketing, receipt-driven.
- **Meta-proof:** the article about "structural green isn't behavioral green" is authored *through*
  a pipeline whose thesis is "enforce behavior, not existence." The medium proves the message.

**Series:** seeds **"Building Relay in Public"** with the false-green as №01.

### The slice produces

1. `_ASSETS/articles/the-false-green/` — `article.md` (8 sections, ~3,500 words, to the bar),
   `metrics.json` (mined from this session's real git + file state), signature SVG, 1 inline
   `fn-diagram`, `screenshots/` (prefer-shared: reuse `/agents`, `/packs` library shots; capture
   only the guide/verifier-specific gap), `transcript.md` (private).
2. Scripts, built **only to the depth this article exercises**: `new-article.sh`,
   `mine-metrics.mjs`, `verify-article.mjs`, `verify-svg.mjs`, scrub.
3. `_design-system/` — the four contract files + `check-design-system-drift.mjs`.
4. `assets-field-notes` skill — `draft`/`verify`/`publish`, gating on the above.
5. **End-to-end proof:** `assets-field-notes verify the-false-green` exits 0 on the finished
   article and **exits non-zero if a mined number is deleted from `metrics.json` while the claim
   stays in prose** — the behavioral gate demonstrated, not asserted (the article's own thesis run
   against itself).

### Deferred (YAGNI until article #2–#3 proves the shape)

- Faceted `series/`, `stages/`, `tags/` index machinery (no faceted routes for N=1).
- The `sequence.json` №-ordinal generator (trivial at N=1).
- Bulk / multi-article authoring.
- Any website-side change (peer's copy-publish, coordinated via `_RELAY` later).

## Out of scope

- Reprioritizing articles above P0/P1 `_ASSETS` work — this spec defines the pipeline, it does not
  move articles up the queue.
- The website's copy-publish implementation (peer repo, separate coordination).
- The book compilation (T6, downstream, joint operator+CC).

## End-to-end check

The slice is done when `assets-field-notes verify the-false-green` **exits 0 on the finished
article** and **exits non-zero when a `metrics.json` number is removed but its prose claim remains** —
proving the derive-and-verify gate works on a real artifact, not a fixture.
