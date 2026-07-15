---
title: Release-Synchronized Relay Knowledge Bundle
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md G-054; _ASSETS/docs; _ASSETS/api
dependencies: []
---

# Release-Synchronized Relay Knowledge Bundle

## Description

Every Relay package must carry a compact, local knowledge artifact that exactly
matches the package version and is derived only from the verified user-guide and
API-reference sources in the strategy-owned `_ASSETS` corpus. The artifact is a
release input, not a second authoring surface: prose is edited in `_ASSETS`, the
generator refuses dirty or stale source state, and packaged Relay consumes only
the generated public files.

The bundle establishes the source and integrity boundary needed by G-055. It
does not inject documentation into every Chat prompt or decide retrieval
ranking. It exposes stable source ids, section ids, headings, source kinds,
release/source hashes, screenshot metadata, API paths, and allowlisted local
product-route locators so a later bounded retriever can cite exact current
sections without reading the strategy repository or inventing links.

## User Story

As a Relay operator or developer using a packaged release, I want product-help
context to come from documentation built for that exact Relay version so that
answers never silently substitute roadmap material, private sources, or stale
API behavior.

## Artifact Contract

The package contains a top-level `knowledge/` directory:

```text
knowledge/
  manifest.json
  index.json
  entries/
    guide.<chapter-id>.json
    api.<group-id>.json
```

- `manifest.json` is the release and integrity root. It records schema version,
  exact Relay version, source corpus versions and hashes, screenshot-manifest
  hash, aggregate bundle hash, and every entry's id/kind/path/source/content
  hashes.
- `index.json` contains no prose. It provides bounded lookup metadata for every
  section: source id, section id, kind, title, heading, ordinal, word count,
  normalized search terms, API paths, screenshot targets, and safe product
  routes.
- Each entry file contains one guide chapter or API group as deterministic
  section records. Content is normalized Markdown with frontmatter and image
  embeds removed; screenshot references remain typed metadata rather than
  broken package-relative images.
- Files use recursively key-sorted JSON with one terminal newline. The build
  omits wall-clock timestamps so identical inputs reproduce identical bytes.
- The generator writes only byte-changed files, preserves unchanged entry
  files, and removes entry files no longer declared by the current trackers.

## Source And Freshness Contract

The authoring command defaults to the Relay `_ASSETS` symlink and verifies that
it resolves to the strategy-owned Relay asset root. Fixture callers may pass an
explicit source root only through the testable library API; the production CLI
does not offer a provenance bypass.

Before writing output, the generator must:

1. run the guide and API sync checks without writing;
2. require zero dirty chapters/groups, added/changed/removed/unassigned API
   routes, unreviewed API endpoints, uncovered/stale/unknown guide features,
   and unresolved screenshot mappings;
3. run both existing content verifiers with required files;
4. reject missing, malformed, duplicate, unsafe, or private source metadata;
5. derive every entry only from tracker-declared Markdown plus the mapped
   screenshot/API metadata; and
6. complete the build in a temporary sibling directory before atomically
   reconciling the published `knowledge/` directory.

`npm run knowledge:build` is the authoring command. `npm run knowledge:verify`
validates the committed artifact without requiring `_ASSETS`; the verifier and
its pure core ship so it can run from a clean clone or an installed package.
Both `prepack` and `prepublishOnly` run it, so a version bump without a matching
bundle or any integrity drift blocks packing and publishing.

## Incremental Invalidation

- A guide entry fingerprint includes its Markdown, tracker mapping and source
  feature hashes, and only the screenshot-manifest records named by that
  chapter. An unrelated screenshot or feature change cannot rewrite the entry.
- An API entry fingerprint includes its Markdown, group metadata, endpoint
  inventory, methods, stability, source files, and source hashes. A route change
  dirties only the owning API group.
- `manifest.json` and `index.json` may change when any entry changes; unchanged
  entry files must remain byte-identical and must not be rewritten.
- Removed tracker units remove their generated entry and index records. A stale
  orphan file is a verification failure.

## In-App Chat Boundary For G-055

- G-054 packages knowledge; G-055 owns query parsing, ranking, token budgeting,
  prompt assembly, source badges, navigation actions, and persisted message
  metadata.
- Chat may load the packaged artifact only after the manifest version and
  integrity hashes pass. It must not read `_ASSETS`, strategy files, roadmap,
  feature specs, or the network at runtime.
- Retrieval uses `index.json` to select a bounded section set and then opens
  only the referenced entry files. A full-corpus system-prompt dump is outside
  the contract.
- Source citations use manifest ids/headings/version. Product navigation can use
  only normalized absolute-local routes declared by the entry metadata. API
  endpoint paths are citations, not product navigation actions.
- Missing, corrupt, stale-version, oversized, or unknown-schema artifacts are
  named unavailable states. Consumers never silently fall back to an older
  bundle or fabricate sources/routes.

## Acceptance Criteria

- [x] A clean source corpus builds the documented per-unit directory bundle;
  manifest Relay version equals `package.json` exactly and all source/content
  hashes verify.
- [x] One mapped guide feature-hash change affects only its guide entry plus the
  aggregate manifest/index; unrelated guide/API entries remain byte-identical
  and are not rewritten.
- [x] One API route source-hash change affects only its owning API group plus the
  aggregate manifest/index.
- [x] An unchanged second build writes zero files and reproduces the same
  aggregate bundle hash.
- [x] Dirty guide/API tracker state, added/removed/unassigned routes, missing
  files, stale source hashes, corrupt JSON, duplicate ids, unsafe routes, and
  private/machine-specific content fail with named errors before publication.
- [x] Removed source units delete their generated entries; undeclared orphan
  entries fail verification.
- [x] The npm package contains `knowledge/` and no `_ASSETS`, strategy path,
  tracker, report, screenshot binary, roadmap, or private authoring material.
- [x] A clean-clone/package verifier succeeds without the strategy repository
  and refuses a package-version mismatch or byte-tampered entry.
- [x] The package remains below the existing 10 MB release budget.
- [x] The durable G-055 boundary above is reflected in exported TypeScript
  contracts without wiring the artifact into Chat during this goal.

## Scope Boundaries

### Included

- `_ASSETS` freshness enforcement and current API-doc reconciliation.
- Deterministic incremental bundle generator and standalone verifier.
- Top-level packaged artifact, npm allowlist, release gate, public-boundary and
  clean-package regression coverage.
- TypeScript data contracts for the later local Chat consumer.

### NOT in scope

- Chat retrieval/ranking, prompt injection, citations, or help action UI (G-055).
- Shipping screenshot image binaries; only mapped metadata and safe routes ship.
- Network documentation lookup, embeddings, vector databases, SQLite, or a
  hosted documentation service.
- Editing prose inside generated entry files.
- Cutting a release, bumping a version, publishing npm/GitHub artifacts, or
  committing/pushing the strategy repository.

## Failure States

| Name | Trigger | Required behavior |
|---|---|---|
| `KnowledgeSourceProvenanceError` | Production source is not the strategy-owned `_ASSETS` symlink | Stop before reading/writing output |
| `KnowledgeSourceStaleError` | Sync reports dirty, changed, removed, unknown, or uncovered units | Name affected units and stop before output reconciliation |
| `KnowledgeSourceVerificationError` | Existing guide/API verifier fails | Preserve prior bundle and surface verifier output |
| `KnowledgeBundleSchemaError` | Manifest/index/entry shape or id/path/route is invalid | Refuse build or load |
| `KnowledgeBundleIntegrityError` | Hash, aggregate, duplicate, orphan, or tamper mismatch | Refuse the artifact; no partial reads |
| `KnowledgeBundleVersionError` | Manifest version differs from package version | Block pack/release and runtime use |
| `KnowledgeBundleWriteError` | Temporary build or final reconciliation fails | Preserve the last verified bundle; report the failed path |

## Completion Evidence

- Source reconciliation: guide sync and API sync report no dirty, changed,
  removed, uncovered, stale, unknown, or unassigned units; both content
  verifiers pass with zero warnings and all 186 API routes are reviewed.
- Determinism: two consecutive real-corpus builds produced bundle hash
  `1f998e896c0aa3f2ce5562e3e89989600892f68e83b1bea18e3c475ba3d8f777`;
  the second build wrote zero files.
- Artifact: Relay `0.41.0`, 17 entries, 418 sections, 1,362,456 bytes.
- Regression: 10 focused knowledge/source-sync tests and 8 npm-package contract
  tests pass; TypeScript and documentation-link checks pass.
- Package: real `npm pack` ran the `prepack` verifier, produced a 9,528,282-byte
  unpacked package, passed the npm public-boundary scan, and its shipped
  verifier succeeded directly inside the dependency-free unpacked tarball.

## References

- G-054 in `_IDEAS/backlog.md`
- G-055 in `_IDEAS/backlog.md`
- `_ASSETS/docs/guide-tracker.json`
- `_ASSETS/api/api-tracker.json`
- `scripts/check-public-boundary.mjs`
- `src/lib/__tests__/npm-pack-files.test.ts`
- Historical in-app guide removal: Git commit `e6f532e9`
- Implementation plan: `features/release-synchronized-knowledge-bundle-plan.md`
