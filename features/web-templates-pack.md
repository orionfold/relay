---
title: Web Templates pack — reusable static-site templates for Web Designer
status: built
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [pack-web-designer, web-designer-site-controls, generator-publisher-substrate]
---

# Web Templates Pack

## Description

Relay Web Designer currently has one hardcoded static-site template inside
`src/lib/generators/static-site-generator.ts`. That limits user choice and makes template evolution
a code-release problem. A `relay-web-templates` pack should let Relay create, bundle, select,
version, export, and import reusable static-site templates without copying private local projects
or embedding unsafe executable code.

Templates are still data, not arbitrary code: a schema describes slots, supported section roles,
allowed theme controls, preview fixtures, compatibility rules, and migration constraints. Web
Designer and Web Publisher can then select a template with clear provenance and generate a preview
through the same TDR-039 substrate.

## User Story

As a Web Designer user, I want to choose and reuse versioned website templates so that I can build
multiple polished sites without every design being hardcoded into Relay.

## Technical Approach

- Create a `relay-web-templates` pack with synthetic template examples and no private peer
  project provenance.
- Define a template schema for slots, supported section roles, theme-control capabilities,
  preview fixtures, compatibility version, and provenance.
- Add template selection to Web Designer/Web Publisher generation config.
- Enforce trust boundaries: templates may reference declarative layout tokens and safe static
  assets, but cannot execute arbitrary code or SEND data.
- Provide migration from the current built-in static-site template into a built-in template record.
- Add export/import affordances so reusable templates can move between Relay instances as packs.

## Acceptance Criteria

- [x] `relay-web-templates` exists as a bundled pack with synthetic template rows and preview
      fixtures.
- [x] Web Designer can select a template and preview the selected output before publishing.
- [x] Template schema validation rejects unsupported slots, unsafe code, and incompatible generator
      versions with named errors.
- [x] Template provenance is visible in the UI and included in preview/deployment metadata.
- [x] The current hardcoded generator look is represented as a default template-compatible path.
- [x] Tests cover schema validation, template selection, compatibility refusal, and private-data
      guardrails.

## Build Notes

- Built 2026-07-07. Added the premium bundled `relay-web-templates` pack with three synthetic
  declarative template rows: `relay-default`, `editorial-proof`, and `launch-system`.
- Added `StaticSiteTemplateSchema` and named `StaticSiteTemplateError` validation for unsupported
  section slots, unsafe extra fields, incompatible template versions, unknown template ids, and
  template-control incompatibilities.
- Added `templateId` to app-scoped static-site settings. Preview/publish generator config now
  records the selected settings plus compact template provenance metadata.
- Web Designer/Web Publisher publish panels now list server-provided templates in Site controls and
  show bundled synthetic provenance before preview/publish.
- Verification: focused template/generator/API/publish-panel/publisher/pack/taxonomy tests 64/64,
  `npx tsc --noEmit`, `npm run check:pack-taxonomy`, and `npm run check:pack-tarball`.

## Scope Boundaries

**Included:**
- Template schema and bundled Web Templates pack.
- Selection and compatibility checks in Web Designer/Web Publisher.
- Migration path from the hardcoded template.

**Excluded:**
- Community template marketplace.
- Remote template install beyond existing pack distribution mechanics.
- Arbitrary JavaScript template execution.

## References

- `features/web-designer-site-controls.md`
- `features/pack-web-designer.md`
- `features/generator-publisher-substrate.md`
