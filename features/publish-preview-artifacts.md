---
title: Publish preview artifacts — local website preview before GitHub Pages publish
status: planned
priority: P1
milestone: post-mvp
source: operator request 2026-07-07 / TDR-039 Phase 3+4 follow-up
dependencies: [generator-publisher-substrate]
---

# Publish Preview Artifacts

## Description

Relay's GitHub Pages publisher now has the core generate→publish path, but the operator should be
able to inspect the generated website locally before any SEND to GitHub. The right product contract
is stronger than "preview something similar": **the exact artifact the user previews is the artifact
Relay publishes** unless the user explicitly refreshes the preview.

This feature inserts a durable local preview step between `GeneratorAdapter.generate()` and
`PublisherAdapter.publish()`. The preview uses the same generated `Artifact` file set as publish,
stores it under Relay's data directory with an artifact hash and expiry metadata, serves it from the
existing Relay Next server, and lets the publish action accept an `artifactId` so GitHub Pages
receives the same bytes the user inspected.

## User Story

As a Web Designer pack user, I want to preview the generated website in my local browser before
publishing, and then publish that exact preview to my GitHub Pages repo, so I can catch content,
layout, or broken-link issues before anything leaves my machine.

## Technical Approach

### Core invariant

- Preview and publish share the same `Artifact` type from `src/lib/publishers/types.ts`.
- A preview stores the generated artifact and its `hash`.
- A publish launched from preview passes `artifactId`.
- The deployment row records the same `artifactHash`.
- If the source rows change after preview, the UI marks the preview stale and requires a refresh
  before "Publish this preview".

### Storage

Add a preview artifact store under Relay's data directory, not inside the repo:

- Directory shape: `<relay-data-dir>/previews/{artifactId}/files/...`
- Metadata sidecar: `<relay-data-dir>/previews/{artifactId}/meta.json`
- Metadata fields:
  - `artifactId`
  - `appId`
  - `generatorType`
  - `sourceTable`
  - `hash`
  - `entryPoint`
  - `createdAt`
  - `expiresAt`
  - optional `sourceFingerprint` for stale-preview detection

Use content-addressing defensively: the artifact hash is still the trust anchor, even if
`artifactId` is a random UUID used for routing.

### API routes

- `POST /api/apps/:id/preview`
  - Validates the app exists and declares `view.bindings.generate`.
  - Loads table rows with the same row JSON parsing path as `runDeployment()`.
  - Generates the artifact with the real generator.
  - Persists artifact files + metadata locally.
  - Returns `{ artifactId, url, hash, createdAt, expiresAt }`.

- `GET /api/apps/:id/previews/:artifactId/:path*`
  - Serves files from that preview artifact only.
  - `/` resolves to the artifact `entryPoint`.
  - Blocks path traversal and cross-app artifact access.
  - Sends conservative headers for generated HTML, including `X-Content-Type-Options: nosniff`
    and a restrictive CSP where compatible with the current static-site generator output.

- `POST /api/apps/:id/publish`
  - Accepts optional `artifactId`.
  - If present, loads the stored artifact and publishes it without regenerating.
  - If absent, preserves the current generate-fresh behavior for compatibility.
  - Fails visibly if the preview is missing, expired, app-mismatched, or hash-invalid.

### UI

Extend `AppPublishPanel`:

- Add a **Preview** action beside **Publish**.
- Preview creates a local artifact and opens its local URL in a new tab.
- After preview, show:
  - artifact hash prefix
  - created time
  - stale/fresh state
  - **Publish this preview** primary action
- Disable **Publish this preview** while preview generation or a deployment is active.
- If publish fails, keep the preview metadata visible so the user can retry or regenerate.
- Keep the existing "Publish" generate-fresh path available only as a secondary/advanced action or
  replace it once preview-first is stable.

### Cleanup

- Add a cheap cleanup path for expired previews, either opportunistically on preview creation or via
  an existing maintenance surface.
- Expired previews are deleted from disk and no longer publishable.

## Acceptance Criteria

- [ ] `POST /api/apps/:id/preview` creates a local preview artifact using the same generator path as
      publish and returns a browsable local URL plus artifact hash.
- [ ] The preview serving route resolves `index.html`, serves nested files, blocks path traversal,
      and prevents cross-app artifact access.
- [ ] The app publish panel has a preview-first flow: generate preview, open local preview, show hash
      metadata, and publish that preview.
- [ ] `POST /api/apps/:id/publish` accepts `artifactId` and publishes the stored artifact without a
      second generation pass.
- [ ] Deployment rows record the same `artifactHash` shown in the preview UI.
- [ ] Stale or expired previews cannot be silently published; the user sees a named error and must
      refresh preview.
- [ ] GitHub token values remain masked at every API/UI boundary; preview metadata never stores the
      token.
- [ ] Targeted tests cover preview creation, route serving/path traversal, publish-by-artifact,
      stale/expired errors, and UI double-click/slow-network states.
- [ ] `npm run build` passes; if preview/publish API contracts change before release, check
      `scripts/npx-prod-smoke.mjs`.

## Scope Boundaries

**Included:**

- Local preview artifact storage and serving from Relay's existing Next server.
- Preview-first UI in the app publish panel.
- Publishing a specific preview artifact to GitHub Pages.
- Expiry/cleanup guardrails.

**Excluded:**

- Starting a second local web server or allocating a separate port.
- GitHub Pages repo creation or Pages settings management.
- Visual regression tooling for generated sites.
- Multi-artifact preview history beyond the most recent preview display.
- Editing generated HTML in the preview.

## References

- `features/generator-publisher-substrate.md`
- `src/lib/publishers/app-publish.ts`
- `src/lib/publishers/types.ts`
- `src/lib/generators/static-site-generator.ts`
- `src/components/apps/app-publish-panel.tsx`
