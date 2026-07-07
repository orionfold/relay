---
title: Fix Codex in-app preview sheet visibility
status: completed
priority: P2
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [composed-app-view-shell]
---

# Fix Codex In-App Preview Sheet Visibility

## Description

The walkthrough confirmed that side sheets did not visibly appear in the Codex in-app web preview
when clicking table rows or `Enrich`, while the same route worked in the operator's normal Google
Chrome browser. The root cause was Relay's shared sheet primitive using Tailwind `z-50` while the
boot veil uses the project overlay token `--z-overlay` (`100`). On fresh route/deep-link loads, a
sheet could open underneath the boot veil and look invisible during evaluation.

This is not currently a customer Chrome defect, but it affects Codex desktop evaluation and can
produce false app-level bug reports unless isolated and fixed or documented.

## User Story

As an operator evaluating Relay in Codex desktop, I want side sheets to appear in the in-app
preview when they work in Chrome so that browser review findings are trustworthy.

## Technical Approach

- Verified row-click and `Enrich` sheets in the Codex in-app preview.
- Inspected portal root, z-index tokens, fixed positioning, focus trap, and parent overflow in the
  in-app container.
- Raised the shared sheet overlay/content layers from `z-50` to `z-[var(--z-overlay)]`, matching
  the project overlay scale while preserving the existing sheet layout and animation.
- Chrome extension control was unavailable in this Codex session; the comparison path used
  Playwright Chromium and the prior operator Chrome evidence from the walkthrough.

## Acceptance Criteria

- [x] Row-click and `Enrich` sheets are verified in a Chromium browser-engine smoke; the
      walkthrough already verified `Enrich` in the operator's normal Chrome. Chrome extension
      control was unavailable for live normal-Chrome row-click verification in this session.
- [x] The same sheets are visible and usable in Codex in-app preview.
- [x] The fix preserves browser sheet behavior in the Chromium comparison smoke.
- [x] Browser verification captures the Codex in-app preview and Chromium comparison paths.

## Verification

- Codex in-app Browser: `/apps/relay-web-designer` `Enrich` opens a visible sheet; row deep link
  `/tables/529a23e9-d55d-4524-954b-d6d4206a1975?row=76c05f40-fe20-4426-b3dd-c5496df714bf`
  opens a visible `Edit Row` sheet. Both report `zIndex: "100"`.
- Playwright Chromium fallback: `output/sheet-visibility/chromium-enrich-sheet-settled.png` and
  `output/sheet-visibility/chromium-row-sheet-settled.png` capture settled visible sheets with
  Enrich at `x=720/w=560` and row edit at `x=800/w=480`.

## Scope Boundaries

**Included:**
- Side-sheet visibility in Codex in-app preview.

**Excluded:**
- Treating Codex in-app preview as the default Relay verification browser.
- Broad shell redesign.

## References

- `output/operator-walkthrough-feedback-2026-07-07.md`
- `AGENTS.md` Codex desktop browser caveat
