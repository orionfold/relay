---
title: Web Designer pack — assets + publisher over the generator/publisher substrate
status: built
priority: P1
milestone: mvp
source: features/generator-publisher-substrate.md Phase 5 / features/pack-depth-next-wave.md
dependencies: [generator-publisher-substrate]
---

# Web Designer pack

## Description

Relay Web Designer is the first real TDR-039 pack family. It ships as a bundle
over two standalone-useful children:

- `relay-web-assets` — a small web-asset inventory with a typed `gallery`
  preview primitive.
- `relay-web-publisher` — a static-site section table that declares
  `view.bindings.generate` and `view.bindings.publish`, so the app can generate a
  local preview and publish that exact artifact to GitHub Pages.

The bundle installs as one app (`relay-web-designer`) but keeps both children
valid on their own. All seed data is synthetic and contains no local peer
project provenance or private workspace references.

## Acceptance Criteria

- [x] `relay-web-assets`, `relay-web-publisher`, and `relay-web-designer` exist
      as in-tree bundled pack templates.
- [x] The Web Designer bundle is visible in the local pack catalog and composes
      the two children into one app.
- [x] A strict `galleries` manifest binding renders a reusable gallery/preview
      primitive from managed table rows.
- [x] `relay-web-publisher` declares a real `static-site` generate seam and
      `github-pages` publish seam.
- [ ] Live GitHub Pages smoke through the UI.
- [ ] Move TDR-039 proposed -> accepted after the live smoke.

## Scope Notes

The first pass keeps the generator row contract from Phase 2: one ordered section
table emits a single `index.html`. Theme controls, custom domains, delete-target,
and multiple generate arms are later enhancements.
