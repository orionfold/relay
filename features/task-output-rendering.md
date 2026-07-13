---
title: Readable and navigable task outputs
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md G-042
dependencies: [task-run-history, document-output-generation]
---

# Readable and navigable task outputs

## Outcome

Task detail, task-summary, and Inbox completion previews present generated results as embedded
documents rather than unscoped markdown. Insight callouts, heading hierarchy, long-result expansion,
and generated-document navigation behave consistently across those surfaces and the rendered
document destination.

## Shipped contract

- `EmbeddedMarkdown` is the shared safe renderer. Task content maps source H1/H2/H3 to H3/H4/H5;
  compact Inbox content maps beneath the notification title; document content maps beneath the
  document page H1. Raw HTML is not enabled and `react-markdown`'s safe URL transform remains active.
- A closed `★ Insight ─…` block becomes a semantic `role="note"` callout. Malformed/unclosed syntax
  remains ordinary markdown rather than consuming the rest of the result.
- Long output collapses to the existing short preview and expands to `max-h-[48rem]`, twice the
  former `max-h-96` cap.
- Output-document rows provide a primary document link plus explicit View and Download icons.
  Delete remains a separate task-surface action. Nested actions and active text selection do not
  trigger row navigation; mobile keeps primary actions visible.
- Inbox uses one batched completion-context read for a bounded 4,000-character task-result preview
  and current output documents. It does not issue one document request per notification.

## Verification

- Fixtures cover H1/H2/H3, GFM, Insight syntax, malformed Insight syntax, safe and unsafe links,
  long expansion, output/input/zero-document states, multiple completion-context documents,
  row/action isolation, text selection, delete success, and Inbox display.
- 17 focused tests, TypeScript, `git diff --check`, and the production build passed. Fresh review
  found no SQL, trust-boundary, XSS, or interaction blocker.
- Real browser checks replayed both G-006 research outputs at desktop and 390px. Task detail,
  task-summary, Inbox, and rendered document routes had zero horizontal overflow; Insight callouts,
  one-H1 hierarchy, View/Download actions, and the 672px expanded reading area were verified.
- Evidence: `output/g042-task-result-desktop.png`, `output/g042-task-result-390.png`,
  `output/g042-research-task-desktop.png`, and `output/g042-document-render-390.png`.
