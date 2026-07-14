---
title: Public repository boundary
status: completed
priority: P1
milestone: repository-hygiene
source: G-050 / TRIAGE-016
dependencies: []
built: 2026-07-13
---

# Public repository boundary

## Description

Relay's public repository previously mixed product/contributor documentation
with live operational continuity, session plans, machine paths, retired
endpoints, and personal fixture data. The npm `files` allowlist prevented most
of that material from reaching customers, but a normal source checkout and
`git archive` still exposed it. This feature establishes one classified public
boundary and verifies the actual artifacts rather than trusting ignore files or
package metadata indirectly.

## User story

As a contributor or customer auditing Relay, I want every file in a public
checkout or release artifact to be intentional product, trust, or contributor
documentation so that I can evaluate the project without encountering private
coordination residue or stale support identities.

## Scope challenge

- **Reduced path rejected:** scanning only the npm tarball leaves source archives
  and normal clones unprotected, so it does not satisfy the repository outcome.
- **Chosen path:** classify root/archive/docs surfaces, retain public product and
  contributor records, move continuity/history out of Git without deleting it,
  sanitize retained records, and apply one policy engine to all three artifacts.
- **Expanded path rejected:** rewriting every historical product-name reference
  would destroy useful migration context. Names remain where they explain code
  or release history; actionable stale identities do not.

## Technical approach and implementation plan

1. Record the approved classification in
   `docs/public-repository-boundary.md` and retain durable decisions in feature
   specs, TDRs, and changelog entries.
2. Untrack approved internal continuity/history with `git rm --cached`, then add
   `.gitignore` and `.gitattributes` defense in depth so local copies survive and
   future archives omit accidental re-additions.
3. Sanitize retained public documentation and fixtures: use synthetic examples,
   current Relay identity, and a neutral package-lineage note.
4. Implement a dependency-free policy engine with exact path/rule exceptions,
   a minimal tar reader, gzip support, and named findings with file/line evidence.
5. Gate the tracked tree, real Git archive, and real npm tarball in local scripts
   and the publish workflow.
6. Verify from a clean clone, link-check retained documentation, run focused
   regressions, inspect artifact manifests, update product records, and commit.

## Acceptance criteria

- [x] Every tracked root/archive/docs surface is classified in the public policy.
- [x] The public tree retains only product/trust/contributor documentation;
      internal continuity/history remains locally available but untracked.
- [x] Useful decisions from removed history remain represented by feature specs,
      TDRs, changelog entries, or this classification receipt.
- [x] A fail-closed guard rejects machine paths, private peer-project provenance,
      retired actionable domains, personal support/repository identities, and
      operational handoff references.
- [x] Exceptions are exact path/rule pairs and have positive regression evidence;
      negative fixtures cover every forbidden class.
- [x] The same policy passes against the tracked tree, an actual Git archive, and
      an actual npm tarball.
- [x] Retained documentation links resolve after relocation.
- [x] A clean clone reproduces the tracked-tree and artifact checks.
- [x] A fresh review confirms the public artifacts contain no stale direct
      identity/support messaging outside intentional author attribution and the
      documented immutable production-signature fixture.

## Verification evidence — 2026-07-13

- Classification receipt: 125 internal records left Git without local deletion
  (74 archived handoffs, 48 session plans/specifications, three root continuity
  documents); the staged/public index contains none of the classified paths.
- Policy regressions: five boundary tests and three index-aware Markdown-link
  tests pass, including every negative class, scoped positive examples, real tar
  and gzip parsing, corrupt/empty artifacts, and an untracked-on-disk link trap.
- Retained docs: 472 tracked Markdown files pass the local link check.
- Existing privacy/security coverage: both pack-template privacy tests and all
  18 license-store tests pass; the immutable production-signed fixture retains
  one exact exception and every runtime assertion derives its recipient.
- Build/static checks: `npx tsc --noEmit`, `npm run build:cli`, and
  `npm run check:pack-tarball` pass.
- Artifact checks: the same policy passes a real committed `git archive` and
  `npm pack` tarball, locally and again from a literal clean clone.
- Fresh source review: public support copy routes through the Relay website;
  direct machine paths, private peer provenance, retired actionable domains,
  personal repository identities, archived handoff links, and session-plan
  links have no unallowlisted occurrence.

Known unrelated baseline: the full `relay-web-designer-template.test.ts` file
still expects two installed tables while the existing template installs three.
G-050 did not modify that template or assertion; its dedicated public-safe seed
test passes and the stale count remains outside this privacy goal.

## Regression budget

| Risk | Required evidence |
|---|---|
| Policy silently skips a class | One named negative fixture per forbidden class. |
| Allowlist becomes broad | Positive tests for portable examples plus exact exception assertions. |
| Tar parsing misses an artifact | Uncompressed Git-tar and gzipped npm-tar tests, including malformed input. |
| Ignore rules hide but archive still ships | Scan an actual `git archive` generated from committed state. |
| npm `files` drifts | Scan an actual `npm pack` artifact in the publish job. |
| Relocation breaks docs | Repository-local Markdown link check after the move. |
| Clean checkout differs | Literal clean-clone artifact run before completion. |

## Error and rescue registry

| Failure | Visible behavior | Rescue |
|---|---|---|
| Git enumeration/read fails | Guard exits non-zero with the unreadable path. | Repair checkout/index permissions; never skip the file. |
| Archive is missing/truncated/malformed | Guard exits non-zero with an artifact error. | Regenerate the artifact and rerun. |
| New private finding | Guard prints path, line, rule, and excerpt. | Sanitize/move it, or document an exact public exception with a regression. |
| Artifact-only finding | Release job stops before publish. | Inspect the packed manifest and correct packaging inputs. |
| Relocated doc had the only durable decision | Acceptance remains incomplete. | Promote the decision into a public feature spec, TDR, or changelog first. |

## Scope boundaries

Included: repository classification, local preservation/untracking, retained-doc
sanitization, source/archive/tarball enforcement, regression tests, clean-clone
verification, product records, and local commit.

Excluded: rewriting generic historical product names, inspecting private peer
project content, publishing/pushing a release, or changing runtime product
behavior unrelated to packaging/privacy.
