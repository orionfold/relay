---
title: Web Designer site controls — theme, density, layout, and section style
status: built
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [pack-web-designer, generator-publisher-substrate]
---

# Web Designer Site Controls

## Description

The first Web Designer pack proves the static-site generate and publish path, but the generated
site is controlled by hardcoded template defaults. Operators need app-owned controls for the
site's presentation before Web Designer can feel like an editable product rather than a code-only
demo.

This feature adds a small, versioned settings contract for static-site generation: `theme`,
`density`, `heroLayout`, `accent`, `showCtas`, and `sectionStyle`. The settings may live as a
managed `site_settings` row or as validated manifest config, but they must be user-editable from
Relay and carried into both preview and publish.

## User Story

As a Web Designer operator, I want to adjust the site's theme and layout from Relay so that the
previewed and published site reflects the client's positioning without editing generator code.

## Technical Approach

- Define a typed static-site settings schema with defaults for existing packs.
- Add a Relay UI surface near the Web Designer publish panel for editing theme, density, hero
  layout, accent, CTA visibility, and section style.
- Feed the validated settings into `static-site` generation for both preview and publish.
- Store settings in an app-owned table or manifest config with provenance and migration notes.
- Keep all generated output local until the existing explicit GitHub Pages publish action.

## Acceptance Criteria

- [x] Web Designer exposes editable controls for `theme`, `density`, `heroLayout`, `accent`,
      `showCtas`, and `sectionStyle`.
- [x] The generator validates settings and falls back to named defaults when settings are absent.
- [x] Preview and publish use the same settings object and record it in preview/deployment metadata.
- [x] Invalid settings produce visible named errors, not silently ignored defaults.
- [x] Existing `relay-web-publisher` and `relay-web-designer` installs continue to preview with the
      current default look.

## Implementation Notes

- Built 2026-07-07.
- Settings persist as typed app-scoped JSON in the existing settings table under
  `apps.staticSiteSettings.<appId>`, avoiding a new app-owned table migration while keeping the
  contract app-specific and validated.
- Preview metadata now records `generatorConfig`; deployments record the same config in
  `deployments.generator_config`. Preview staleness includes both source rows and the current
  static-site settings object.
- Verification: focused generator/publisher/preview-store/API/publish-panel/bootstrap tests 53/53,
  `npx tsc --noEmit`, and in-app Browser smoke on `/apps/relay-web-designer` confirmed controls
  render and Preview produces a fresh embedded artifact URL.

## Scope Boundaries

**Included:**
- Static-site presentation controls and persistence.
- UI for editing the controls.
- Preview/publish integration.

**Excluded:**
- Creating reusable template packs; see `web-templates-pack`.
- WYSIWYG section editing.
- Custom CSS upload or arbitrary script injection.

## References

- `features/pack-web-designer.md`
- `features/generator-publisher-substrate.md`
- `output/operator-walkthrough-feedback-2026-07-07.md`
