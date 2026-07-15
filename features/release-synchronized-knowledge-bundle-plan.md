# G-054 implementation plan — release-synchronized knowledge bundle

Authoritative specification:
`features/release-synchronized-knowledge-bundle.md`

## Scope challenge

**PROCEED as-is.** A single JSON blob would be simpler but would violate the
accepted stable-unit requirement because every change rewrites the artifact.
SQLite or embeddings would add native/runtime complexity before G-055 has a
retrieval need. A manifest/index plus one JSON entry per tracker unit reuses the
existing source partition and is the smallest architecture satisfying all
acceptance criteria.

## What already exists

- Guide chapters are partitioned by `guide-tracker.json`, including feature
  hashes and chapter-scoped screenshot targets/paths.
- API reference is partitioned by `api-tracker.json`, including route ownership,
  methods, stability, source files, and per-route source hashes.
- Both corpora have sync scripts, reports, scaffolds, and content verifiers.
- G-050 provides one public-boundary scanner for tracked, Git archive, and npm
  tarball surfaces.
- The npm `files` allowlist, real-tarball tests, clean-install staging harness,
  release size gate, and `prepublishOnly` already define the package boundary.

## Affected surfaces

- Strategy `_ASSETS/api` tracker/reference files and sync report.
- Relay `knowledge/` generated public artifact.
- Bundle generator/verifier scripts and their Node regression tests.
- TypeScript knowledge metadata contracts for G-055.
- `package.json`, npm package contract tests, release gate, feature/changelog
  records, and G-054 backlog state.

No runtime-registry-adjacent module is touched, so the special real-task smoke
budget does not apply.

## Specification and acceptance mapping

| Slice | Acceptance criteria |
|---|---|
| 1. Reconcile source | clean current guide/API sync and content verification |
| 2. Core builder | format, release/source hashes, deterministic sections, safe metadata |
| 3. Incremental reconcile | scoped invalidation, zero-write rebuild, orphan removal |
| 4. Standalone verifier | schema, version, integrity, tamper, unsafe/private refusal |
| 5. Package/release seam | npm inclusion, no authoring corpus, size and clean-package proof |
| 6. Completion audit | G-055 boundary, changelog/backlog/spec status, commit |

## Vertical slices

1. **Current source truth** — dry-run both sync tools, update the seven dirty API
   groups from the 14 added and 27 changed routes, clear tracker state only after
   source review, then rerun both sync and content verifiers.
2. **Pure artifact model** — implement deterministic hashing, frontmatter and
   heading parsing, image-reference extraction, safe local-route normalization,
   typed index/entry/manifest generation, and named errors in a testable module.
3. **Fail-closed authoring command** — verify `_ASSETS` provenance, execute sync
   and content gates, generate in a temporary directory, then reconcile only
   byte-changed files and remove declared orphans.
4. **Independent package verifier** — validate exact package version, schemas,
   entry/index/manifest hashes, file inventory, aggregate hash, size limits,
   public-content policy, and orphan absence without reading `_ASSETS`.
5. **Release integration** — add scripts and npm allowlist, run verification in
   `prepublishOnly`, extend real `npm pack` assertions, and confirm no strategy
   or screenshot payload crosses the boundary.
6. **Closure** — run source gates, new Node tests, targeted Vitest package tests,
   public-boundary/doc-link checks, CLI build, real tarball verification, and a
   clean unpacked-package verifier before Ship Verification and local commit.

## Regression test budget

- `scripts/knowledge-bundle.test.mjs` owns deterministic generation, section
  parsing, mapped guide/API invalidation, unchanged zero-write rebuild, removal,
  version/tamper/orphan/unsafe/private failures, and missing/corrupt states.
- Strategy sync-script fixtures prove a changed catalog feature maps only to its
  declared chapters and one changed route maps only to its owning API group.
- `src/lib/__tests__/npm-pack-files.test.ts` proves `knowledge/` is included and
  authoring sources/screenshots are not.
- A real `npm pack` is unpacked and passed to the standalone verifier; the
  tarball inventory and existing 10 MB ceiling remain authoritative.
- No browser test: G-054 adds no visual or interactive surface. G-055 will own
  browser/accessibility evidence for citations and navigation actions.

## Broader verification

1. New closest Node tests.
2. Guide/API sync dry runs and content verifiers.
3. Targeted npm-package Vitest suite.
4. `npm run knowledge:verify`, public-boundary and doc-link gates.
5. `npm run build:cli` followed by a real `npm pack` and unpacked verifier.
6. `git diff --check`, public artifact scan, and requirement-by-requirement Ship
   Verification against the authoritative specification.

## Error & Rescue Registry

| Failure | Rescue |
|---|---|
| API source delta is too broad to review safely | Split by tracker group; retain dirty=true until each group is reconciled |
| Existing sync output cannot be consumed deterministically | Add a machine-readable CLI mode or export pure functions; do not parse human prose |
| Temp generation fails | Leave the current `knowledge/` untouched and surface the named failure |
| Entry fingerprint causes unrelated rewrites | Reduce it to tracker-unit metadata plus only mapped screenshot/route records |
| Manifest hash becomes circular | Hash canonical index and entry content, then derive the manifest root from those hashes only |
| Package verifier depends on `_ASSETS` | Separate source build from artifact verification; installed packages run artifact verification only |
| Bundle exceeds package budget | Remove duplicated prose/index fields; do not weaken the 10 MB release limit |
| G-055 needs a missing metadata field | Amend the versioned schema additively; do not wire Chat into G-054 |

## Rollback

- Remove `knowledge/` from `files` and `prepublishOnly` to restore the previous
  package seam.
- Generated artifacts are replaceable; source prose and tracker state remain in
  `_ASSETS` and are never overwritten by the bundle generator.
- Keep source reconciliation commits logically separate from Relay generator
  code so either side can be reviewed or reverted without data loss.
