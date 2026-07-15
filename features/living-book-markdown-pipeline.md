---
title: Living Book Markdown Pipeline
status: completed
priority: P2
milestone: post-mvp
source: conversation/2026-03-24-living-book-synthesis
dependencies:
  - living-book-content-merge
  - playbook-documentation
---

# Living Book Markdown Pipeline

## Description

Migrate Book chapter content from the hardcoded `content.ts` TypeScript module to file-based markdown with frontmatter, adopting the same manifest-driven architecture already proven by the Playbook system (`src/lib/docs/reader.ts`). This decouples content from code, enables non-developer content editing, and — critically — unlocks the ability for ainative agents to auto-generate and update chapters via task execution.

The Playbook's `reader.ts` + `manifest.json` system becomes the unified content backend for both the Book and the Playbook. Book chapters are stored as `docs/book/ch-{N}.md` files with frontmatter specifying part, order, reading time, and related Playbook docs.

## User Story

As a content author, I want to edit Book chapters as markdown files, so I don't need to modify TypeScript code to update narrative content.

As a ainative power user, I want to create a workflow that regenerates a Book chapter when its corresponding feature ships a new update, so the Book stays current automatically.

## Technical Approach

### File Structure

```
docs/
  book/
    ch-1-project-management.md
    ch-2-task-execution.md
    ch-3-document-processing.md
    ch-4-workflow-orchestration.md
    ch-5-scheduled-intelligence.md
    ch-6-agent-self-improvement.md
    ch-7-multi-agent-swarms.md
    ch-8-human-in-the-loop.md
    ch-9-autonomous-organization.md
  features/        # existing Playbook feature docs
  journeys/        # existing Playbook journey docs
  manifest.json    # extended to include book chapters
```

### Frontmatter Schema

```yaml
---
title: "Project Management"
subtitle: "From Manual Planning to Autonomous Sprint Planning"
chapter: 1
part: 1
readingTime: 12
relatedDocs: [projects, task-board]
relatedJourney: personal-use
lastGeneratedBy: null  # or task ID if auto-generated
---
```

### Implementation Files

| File | Action | Purpose |
|------|--------|---------|
| `docs/book/ch-{1-9}.md` | Create | 9 markdown chapter files migrated from content.ts |
| `src/lib/docs/reader.ts` | Modify | Extend to read `docs/book/` directory and parse book-specific frontmatter |
| `src/lib/docs/types.ts` | Modify | Add `BookDoc` type extending `ParsedDoc` with chapter/part fields |
| `src/lib/book/content.ts` | Modify | Replace hardcoded content with calls to `reader.ts`; keep as fallback |
| `src/lib/book/markdown-parser.ts` | Create | Parse markdown chapter body into `ContentBlock[]` array (text, code, callout, image blocks) |
| Retired generated guide manifest | Modify | Historical book section; no longer a live source |

### Markdown-to-ContentBlock Parsing

The Book reader expects `ContentBlock[]` arrays. The parser converts markdown conventions to blocks:

| Markdown Pattern | ContentBlock Type |
|-----------------|------------------|
| Regular paragraphs | `TextBlock` |
| Fenced code blocks (```lang) | `CodeBlock` with language, optional filename in comment |
| `> [!tip]` / `> [!warning]` / `> [!info]` / `> [!lesson]` | `CalloutBlock` |
| `> [!authors-note]` | `CalloutBlock` (authors-note variant) |
| `![alt](src "caption")` | `ImageBlock` |
| `[Try: label](href)` | `InteractiveLinkBlock` |
| `<details>` / `<summary>` | `InteractiveCollapsibleBlock` |

### Migration Script

One-time script to extract content from `content.ts` into markdown files:

| File | Action | Purpose |
|------|--------|---------|
| `scripts/migrate-book-content.ts` | Create | Extract chapters from content.ts → docs/book/*.md |

### UX Considerations

- **Zero visual change**: The Book reader renders identically whether content comes from TS or markdown
- **Fallback safety**: If a markdown file is missing or unparseable, fall back to the original content.ts chapter
- **Hot reload**: Next.js file watching picks up markdown changes in dev mode
- **Cache invalidation**: manifest.json includes a `lastModified` timestamp per chapter for client-side cache busting

## Acceptance Criteria

- [ ] 9 markdown chapter files exist in `docs/book/` with correct frontmatter
- [ ] Historical reader unified book chapters with the then-current generated feature and journey guides
- [ ] `markdown-parser.ts` correctly converts markdown to `ContentBlock[]` for all 6 block types
- [ ] Book reader renders markdown-sourced chapters identically to the original TS-sourced content
- [ ] Fallback: if a markdown file is missing, the original content.ts chapter content is used
- [ ] `manifest.json` includes book chapter entries with metadata
- [ ] Migration script successfully converts all content.ts chapters to markdown
- [ ] Editing a markdown file and reloading shows updated content (dev mode hot reload)

## Scope Boundaries

**Included:**
- Markdown chapter files with frontmatter
- Markdown-to-ContentBlock parser
- Reader.ts extension for book directory
- Migration script from content.ts
- Manifest.json book section

**Excluded:**
- Auto-generation workflows (see living-book-self-updating)
- CMS or admin UI for content editing
- Versioning or change history for chapters
- Multi-language / i18n support

## References

- Source: `conversation/2026-03-24-living-book-synthesis` — "Migrate content.ts → markdown files with manifest"
- Existing system: `src/lib/docs/reader.ts` — Playbook's proven markdown + manifest architecture
- Related features: [living-book-content-merge](living-book-content-merge.md), [living-book-self-updating](living-book-self-updating.md)
