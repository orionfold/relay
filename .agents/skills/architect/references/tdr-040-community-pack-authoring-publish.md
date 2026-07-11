---
id: TDR-040
title: Community Pack Authoring and User-Owned Repository Publish
status: accepted
date: 2026-07-11
category: infrastructure
---

# TDR-040: Community Pack Authoring and User-Owned Repository Publish

## Context

Relay can compose a running app from profiles, blueprints, tables, schedules,
and a typed view, and it can install a pack from Git. Issue #45 exposed the
missing inverse: turn a running app back into the standard pack tree and save
it to a private Git repository. The public Packs memo frames the pack as the
owned application/operating-system layer, so this path must preserve ownership
without turning live customer data or credentials into incidental payload.

## Decision

1. **Author through Relay primitives, then export the validated app.** Chat
   continues to create profiles, blueprints, tables, schedules, and views. An
   app-to-pack exporter reverses install-time UUID rewrites and emits the same
   `pack.yaml` + `base/` contract hand authors use.
2. **Namespace community-owned logical ids.** Exported tables and schedules use
   `<pack-id>--<primitive>` ids. The unnamespaced taxonomy remains reserved for
   canonical cross-pack shared primitives with one registered owner.
3. **Preserve the live data contract, not live data.** Export includes table
   names, descriptions, column types, required/default/config metadata, and
   typed view bindings. Rows are excluded by default; an explicit switch may
   include at most 25 rows per table as sample seed data. Licensed premium pack
   content cannot be re-exported.
4. **Portable schedules run blueprints.** A pack schedule must name the
   blueprint it runs, and scheduled required variables must have defaults.
   Profile-only schedule bindings are valid local schedules but are rejected by
   pack export because they cannot round-trip through the pack installer.
5. **Publishing is a distinct, consented SEND.** The exporter has zero egress.
   The `github-repo` PublisherAdapter uses the existing masked
   `publishTargets` credentials and durable `deployments` rows. The operator
   must preview the exact file tree and artifact hash, then confirm publish;
   deployment refuses if the app changed after preview.
6. **One atomic Git commit, scoped ownership.** Publishing uses Git blobs,
   trees, commits, and refs rather than per-file mutation. A checked-in Relay
   marker records only previously published pack paths, allowing stale pack
   files to be removed while unrelated repository files remain untouched.
7. **Direct Git sources are community/unverified.** A direct Git URL without a
   trusted `orionfold.packs/v1` index signature never inherits the implicit
   official tier used for bundled/local sources. The canonical index links to
   customer repositories; Relay does not write an Orionfold-owned index or
   collect install telemetry.

## Consequences

- A user can say “build me a pack to do X,” receive a running app, download a
  portable `.tgz`, or publish it to a private repository without exposing a
  token in chat.
- Pack install now has an additive `columnDefinitions` contract and a two-pass
  relation-target rewrite so typed/related tables round-trip without breaking
  existing string-only `columns` manifests.
- Publishing is intentionally GitHub-only in this version. GitLab/Bitbucket
  can add sibling adapters without changing the exporter or pack format.
- Community packs remain unverified until a trusted index signature attests
  them. Local hand-authored folders remain trusted as operator-owned input.

## Alternatives Considered

- **Ask the model to write pack YAML directly:** rejected because it re-derives
  UUID mappings and trigger constraints from memory instead of reversing live,
  validated state.
- **Put GitHub tokens in chat tool arguments:** rejected because tool arguments
  become conversation history. Credentials stay in masked publish-target rows.
- **Publish files one at a time with the Contents API:** rejected because a
  failure can leave a half-updated pack and stale files. One Git tree/commit is
  atomic and scopes deletions through the Relay marker.
- **Include all current rows:** rejected because structure sharing must not
  silently become customer-data egress.

## References

- GitHub issue #45: Save Packs to Git repos
- `features/pack-app-exporter.md`
- `features/pack-community-publish.md`
- `src/lib/packs/app-exporter.ts`
- `src/lib/publishers/github-repo-adapter.ts`
- `docs/trust/data-flow.md`
- TDR-039 Generator/Publisher Substrate
