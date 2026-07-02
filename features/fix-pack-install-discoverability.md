---
title: Pack install discoverability (UI/registry, not just CLI path)
status: absorbed
priority: P1
milestone: mvp
source: _IDEAS/backlog.md
dependencies: [fix-pack-core-version-resolution]
---

# Pack install discoverability (UI/registry, not just CLI path)

> **2026-07-01 — absorbed into the PLG refinement program (PLG-2a).** The `/packs` gallery this
> spec proposes is being widened to also show premium packs visible-but-locked (soft-gate
> discovery), plus a Settings → License page. Program decision record: `_SPECS/plg-refine.md`
> (private strategy channel). Groom the combined scope there before implementing; the acceptance
> criteria below still hold as the free-pack slice.

## Description

Even once the core-version bug is fixed, pack install is **CLI-only with no discoverable path** — a
solo founder who lives in the UI can never find or install the vertical content that makes the product
useful. Verified: no `/packs` route, no UI install, no API endpoint. The command is
`npx orionfold-relay pack add <path-or-git-url>` where the path is a folder buried in `node_modules`
(`.../src/lib/packs/templates/relay-agency`) that no user would guess. The Apps/Profiles/Blueprints
galleries never nudge "install a pack." So the entire pack subsystem — which, once installed, is
excellent (6 seeded customers, clients table, 7 profiles, 8 blueprints, live as a first-class app) —
is effectively invisible to real users.

## User Story

As a solo founder, I want to browse and install packs from the UI (or by a simple name, not a
filesystem path), so that I can add the vertical content I need without knowing internal paths.

## Technical Approach

- **Minimum viable:** a documented `pack add <name>` registry mapping (so users install by name, not a
  node_modules path) — resolve known bundled pack names (e.g. `relay-agency`) to their template dir.
- **Better:** a `/packs` browser route + install action (list bundled/available packs, one-click
  install calling a new pack-install API endpoint that wraps the existing CLI install logic in
  `src/lib/packs/install.ts`).
- **Nudges:** surface an "install the Agency pack" prompt in the Apps/Profiles/Blueprints galleries
  when the relevant vertical content is absent (ties to the J2/J3 "fresh install ships only general
  built-ins" friction — no CRE/nonprofit starters, no pack nudge).
- Coordinate with existing marketplace features (`marketplace-*`, `curated-collections.md`) — this may
  be a local-first slice of that surface rather than net-new.
- Flag for `/frontend-designer` (new gallery route + install UX).

## Acceptance Criteria

- [ ] A user can install `relay-agency` without typing a node_modules filesystem path (by name and/or
      from a UI action).
- [ ] The pack subsystem is discoverable from the UI (a `/packs` browser or an install nudge in an
      existing gallery).
- [ ] Installing surfaces the materialized app/customers/table/profiles/blueprints (as the CLI path does).

## Scope Boundaries

**Included:**
- Discoverable install: a name-based registry and/or a `/packs` UI + install API + gallery nudges.

**Excluded:**
- The core-version resolution fix (`fix-pack-core-version-resolution`) — prerequisite.
- Paid/entitlement-gated pack + the license path (opportunity — no paid pack ships yet to exercise it).
- Full marketplace publishing/reviews (separate `marketplace-*` features).

## References

- Source: `_IDEAS/backlog.md` — JS1 blocker #9 + J2/J3 "general-only built-ins, no pack nudge" friction.
- Related features: `marketplace-local-first-discovery.md`, `marketplace-app-listing.md`,
  `curated-collections.md`, `primitive-bundle-plugin-kind-5.md`, `my-apps-lifecycle.md`.
