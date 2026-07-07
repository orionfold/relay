---
title: Publish preview UX hardening — embedded preview, target permission check, and final URL
status: planned
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [publish-preview-artifacts, generator-publisher-substrate]
---

# Publish Preview UX Hardening

## Description

The preview-first publish flow works, but the walkthrough exposed three UX gaps. Preview currently
navigates the entire tab away from Relay chrome; the target test proved repo reachability but not
Contents write permission; and the publisher returned the raw GitHub Pages URL even when the final
site resolved through the repo organization's custom domain.

This feature tightens the approval flow around the existing TDR-039 substrate. Preview should stay
inside the app detail page in an iframe, with a separate "View without chrome" action for the raw
artifact. Target setup should verify the permissions needed for publish, and deployment results
should distinguish the adapter URL from any final resolved/custom-domain URL.

## User Story

As a Web Designer operator, I want to preview, permission-check, and publish from one Relay screen
so that I know exactly what will be sent and where it will be visible after publish.

## Technical Approach

- Replace direct preview navigation with an embedded iframe panel in `AppPublishPanel`.
- Add a "View without chrome" action that opens the raw preview artifact in a new tab.
- Upgrade GitHub Pages target testing to validate required Contents write permission, ideally with
  a harmless write/delete probe or an explicit API permission check.
- Surface permission failures with actionable setup copy.
- Track both adapter-reported URL and final resolved/custom-domain URL when GitHub Pages redirects.
- Preserve preview artifact hash and stale-state affordances around the iframe.

## Acceptance Criteria

- [ ] Clicking Preview renders the artifact inside Relay chrome without losing app context.
- [ ] "View without chrome" opens the raw artifact in a separate tab.
- [ ] Target test fails visibly when the token lacks Contents write permission.
- [ ] Publish setup copy names the required GitHub token permission.
- [ ] Deployment results show the published URL and, when detectable, the final resolved custom
      domain URL or a clear custom-domain note.
- [ ] Iframe loading, stale previews, failed publishes, and double-click publish states are tested.

## Scope Boundaries

**Included:**
- App publish panel UX and target validation.
- URL resolution/copy improvements.

**Excluded:**
- GitHub Pages custom-domain management.
- Visual diffing of preview vs published page.
- Template selection controls.

## References

- `features/publish-preview-artifacts.md`
- `features/generator-publisher-substrate.md`
- `output/operator-walkthrough-feedback-2026-07-07.md`
