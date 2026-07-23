---
title: Packed Relay Knowledge Runtime Root
status: completed
priority: P0
milestone: post-mvp
source: _IDEAS/triage.md#triage-058
dependencies: [version-aware-relay-chat-help]
---

# Packed Relay Knowledge Runtime Root

## Description

Relay packages a release-stamped guide and API knowledge bundle so Chat can
answer product questions from the exact installed release. The clean packed
`0.45.2` walkthrough proved that the bundle itself is present and passes the
package verifier, but the production server resolves the launch workspace as
its application root. The staging workspace `package.json` intentionally has no
version, so Chat fails closed with `package.json version is invalid` and labels
the release `unknown`.

This feature makes production knowledge resolution use the authoritative Relay
product version and installed runtime inputs rather than the customer's launch
directory. Fail-closed integrity remains mandatory: a missing, corrupt, or
version-mismatched knowledge bundle must still be unavailable instead of
silently using stale docs.

## User Story

As a customer using an npm-installed Relay release, I want Chat to answer basic
“how do I use Relay?” questions from the verified docs shipped with my exact
version so that first-use help works without internet access or guesswork.

## Runtime contract

- The release version comes from Relay's build-time product-version authority
  or an equally explicit installed-package authority, never an arbitrary
  `process.cwd()/package.json`.
- Knowledge files resolve from the same trusted runtime-input root that owns
  the version.
- Source-tree development, packed npm + downloaded prebuilt Next artifact, and
  Host/Cell production layouts all use the same public retrieval contract.
- Integrity checks continue to compare the manifest release version, root
  hashes, index and entry declarations.
- Failure output keeps a named error code and does not expose private
  filesystem paths in Chat.

## Technical Approach

1. Replace `prepareRelayKnowledgeTurn()`'s independent `getAppRoot()` lookup
   with a helper that returns one trusted `{version, knowledgeRoot}` authority.
   Prefer the existing build-defined `relayProductVersion()` and the runtime
   input/hoisted-workspace contract over another root heuristic.
2. Make the CLI/prebuilt launch surface pass or expose the installed package
   root when Next's bundled `import.meta.dirname` cannot identify it.
3. Preserve `options.rootDir` for deterministic tests, while ensuring
   production does not fall back to the customer's launch package.
4. Add a packed-layout fixture whose outer launch `package.json` has no
   `version` and whose installed Relay package contains the verified bundle.
5. Extend customer-identical npm smoke to ask a knowledge-help question and
   assert a ready receipt stamped with the package version.

## Acceptance Criteria

- [x] The clean packed npm/prebuilt journey answers “How do I run a workflow in
      Relay?” using a `ready` knowledge receipt stamped `0.45.2` (or the current
      package version).
- [x] The answer exposes at least one current guide/API source and one
      allowlisted in-product navigation action.
- [x] A launch-workspace `package.json` without a version cannot override the
      installed Relay package version.
- [x] Source-tree development and production packed layouts both pass focused
      retrieval tests.
- [x] Missing, corrupt, unsafe, and version-mismatched bundle fixtures still
      fail closed with named receipt codes.
- [x] The staging server log contains no
      `KnowledgeBundleSchemaError: package.json version is invalid` during the
      successful help turn.

## Verification — 2026-07-23

- The CLI and Relay Host image now pass an explicit immutable
  `RELAY_RUNTIME_INPUT_ROOT`; production retrieval validates that root as the
  `orionfold-relay` package and uses Relay's compiled product version. An
  explicit fixture root remains available only for deterministic tests.
- Thirty-three focused knowledge and launch-contract regressions passed,
  including a packed layout whose outer launch package has no version.
  `knowledge:verify` passed for Relay `0.45.2` with 17 entries and 450 sections,
  TypeScript passed, and the production build completed.
- A rebuilt 46.6 MB prebuilt artifact and packed npm tarball were installed into
  isolated staging. Chrome asked **How do I run a workflow in Relay?** and
  received grounded help with Relay `0.45.2` guide sources plus Settings and
  Workflows actions. The staging log contained no knowledge-schema error.
- Browser evidence is retained under
  `output/staging/2026-07-23/o6-repair-proof/02-final-grounded-chat-0452.png`.

## Regression Budget

- Focused knowledge retrieval and Chat engine tests.
- Packed-layout integration fixture with an unversioned outer package.
- `knowledge:verify`, TypeScript and production build.
- Rebuilt prebuilt artifact plus customer-identical Chrome Chat proof.

## Scope Boundaries

**Included:**

- Product-version and knowledge-root authority.
- Packaged Chat retrieval and quick-access sources/actions.
- Customer-identical npm/prebuilt regression protection.

**Excluded:**

- Changing knowledge content or public documentation claims.
- Falling back to live Website content when the bundle is unavailable.
- Broad changes to non-knowledge filesystem root resolution.

## Stop / Rescue

If the current prebuilt artifact cannot expose a stable runtime-input root
without coupling Chat to the CLI process, introduce one explicit immutable
environment/manifest pointer at launch. Do not restore `process.cwd()` guessing
or weaken integrity validation.

## References

- `_IDEAS/triage.md` — TRIAGE-058
- `src/lib/knowledge/chat-retrieval.ts`
- `src/lib/config/version.ts`
- `src/lib/utils/app-root.ts`
- `features/version-aware-relay-chat-help.md`
