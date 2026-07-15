# Grounded Relay Help Links

**Goal:** G-075
**Status:** Completed 2026-07-15
**Depends on:** G-054 release-synchronized knowledge bundle; G-055 version-aware Relay help in Chat

## Outcome

After a grounded Relay-help response completes, Chat presents two truthful,
scannable affordance groups:

1. source citations linked only to the matching canonical public Relay Guide or
   API page on `https://orionfold.com`; and
2. related in-product actions linked only to verified live Relay routes and
   fragments.

Sources without a safe canonical destination remain visible non-link badges.
Invalid product destinations fail the knowledge bundle build or verification
instead of becoming dead actions.

## Contract

- Every knowledge entry owns one generated `publicUrl` derived from its tracked
  Guide or API slug. Guide numeric ordering prefixes are removed from public
  slugs; API prefixes are retained.
- Public destinations must use HTTPS, have the exact `orionfold.com` hostname,
  contain no credentials/query/hash, and match the source kind's canonical
  `/relay/docs/…/` or `/relay/api/…/` route family.
- Source quick-access metadata may persist a verified `href`. Defensive parsing
  strips invalid public destinations while retaining the source attribution as
  a non-link.
- Product actions accept only absolute-local, non-API Relay routes. The bundle
  verifier resolves static and dynamic App Router pages and requires every
  fragment to exist as a literal id in its page source.
- The historical screenshot locator `/settings#runtime` is normalized to the
  current provider section `/settings#settings-providers` before it enters the
  bundled navigation contract.
- Linked sources open in a new tab with `target="_blank"`,
  `rel="noopener noreferrer"`, a visible external-link icon, and accessible
  new-tab naming. Product actions remain in-app.
- Citation and related-action groups occupy separate rows in source-first tab
  order. Empty groups produce neither labels nor spacing. Existing entity links
  share the related-actions group.
- All affordances retain the system cursor and visible keyboard focus.
- Quick access remains hidden until the assistant message is complete and is
  durable across persistence, reload, branches, and every supported Chat
  runtime through the existing G-055 metadata contract.

## Acceptance criteria

- The deterministic bundle generator emits canonical public URLs for every
  Guide and API entry and the runtime verifies them before retrieval.
- Bundle build/verify refuses missing pages, missing fragments, unsafe public
  URLs, noncanonical source-kind paths, and tampered hashes.
- “Where do I configure the Ollama runtime?” produces a source citation and an
  `Open Providers & runtimes settings` action to
  `/settings#settings-providers`.
- Valid, missing, malicious, stale-release, citation-only, action-only, mixed,
  wrapping, persistence, and provider-parity regressions pass.
- Desktop and 390 px browser checks confirm separated groups, wrapping,
  external indicator, keyboard focus, and correct destination behavior.
- Package knowledge verification and a clean packaged-instance grounded-help
  smoke pass.

## Non-goals

- Reintroducing the deleted in-app User Guide UI or copying `_ASSETS` into the
  package.
- Generating links from model prose.
- Publishing or changing `orionfold.com` content.
- Opening internal product actions in a new tab.

## Rollback and rescue

The change is additive to G-054/G-055 metadata. If linked citations regress,
the renderer can safely fall back to non-link source badges without weakening
the knowledge integrity boundary. Stop after two materially different attempts
fail against the same bundle, runtime, or browser blocker and report the
smallest reproducible evidence packet.

## Completion evidence

- The generated schema-2 bundle contains 17 canonical public source URLs and
  418 verified sections; both repository and extracted npm-package verification
  report bundle hash
  `20116fb4908487a52701754a3a7fa6776c96d67d65df1bdaf77d8cc95a90bc98`.
- Generator, retrieval, renderer, persistence, branching, and all provider
  contract regressions passed. The full suite passed 3,451 tests in 450 files
  with one intentional skip, plus TypeScript and public-boundary checks.
- A real completed Chat question, “Where do I configure the Ollama runtime?”,
  rendered two canonical external Guide citations above the internal actions.
  The action landed on and focused `#settings-providers`.
- Desktop and 390 px browser checks confirmed source/action separation,
  wrapping, external indicators, no horizontal overflow, and system-cursor
  styling. The in-app Browser binding was unavailable due to a stale-tab tool
  error after two approaches; the connected browser fallback supplied the same
  localhost DOM and visual evidence.
