---
title: Fix Codex in-app preview sheet visibility
status: planned
priority: P2
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [composed-app-view-shell]
---

# Fix Codex In-App Preview Sheet Visibility

## Description

The walkthrough confirmed that side sheets do not visibly appear in the Codex in-app web preview
when clicking table rows or `Enrich`, while the same route works in the operator's normal Google
Chrome browser. This is likely a container-specific issue involving sheet portals, z-index,
viewport height, clipping, or focus handling.

This is not currently a customer Chrome defect, but it affects Codex desktop evaluation and can
produce false app-level bug reports unless isolated and fixed or documented.

## User Story

As an operator evaluating Relay in Codex desktop, I want side sheets to appear in the in-app
preview when they work in Chrome so that browser review findings are trustworthy.

## Technical Approach

- Verify row-click sheets in Google Chrome and in the Codex in-app preview.
- Inspect portal root, z-index tokens, fixed positioning, focus trap, and parent overflow in the
  in-app container.
- Apply the smallest sheet/layout fix that preserves Chrome behavior.
- If the issue is external to Relay, document the limitation and keep Chrome as the verification
  default per `AGENTS.md`.

## Acceptance Criteria

- [ ] Row-click and `Enrich` sheets are verified in Chrome.
- [ ] The same sheets are visible and usable in Codex in-app preview, or the root external
      limitation is documented with evidence.
- [ ] Any fix preserves sheet behavior in normal Chrome.
- [ ] Browser verification captures both environments when this feature is implemented.

## Scope Boundaries

**Included:**
- Side-sheet visibility in Codex in-app preview.

**Excluded:**
- Treating Codex in-app preview as the default Relay verification browser.
- Broad shell redesign.

## References

- `output/operator-walkthrough-feedback-2026-07-07.md`
- `AGENTS.md` Codex desktop browser caveat
