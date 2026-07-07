# Interaction Pattern Library

Reference catalog of interaction patterns organized by task type.

## Data Display
- **Table with inline editing** — For power users managing structured data
- **Card grid** — For visual/scannable content (use sparingly per `/taste` anti-card rule)
- **List with expandable detail** — For sequential review workflows
- **Dashboard with key metrics** — For monitoring and status overview

**ainative patterns:** DataTable component for tabular data, PageShell with DetailPane for master-detail, StatusChip for status rendering, bento grid for detail views.

## Data Input
- **Inline editing** — For frequent, small edits (click-to-edit)
- **Modal form** — For focused, multi-field creation
- **Wizard / stepper** — For complex, multi-stage input
- **Command palette** — For keyboard-first power users

**ainative patterns:** FormSectionCard with bento grid layouts, Slider for continuous values, TagInput for tag management, CommandPalette for global navigation.

## Navigation
- **Sidebar + content** — For deep hierarchies with frequent switching
- **Tab bar** — For 3-7 peer-level sections
- **Breadcrumb trail** — For deep, linear hierarchies
- **Search-first** — For large, flat content collections

**ainative patterns:** AppSidebar with 3 groups (Work / Manage / Configure), collapsible icon mode, PageShell back navigation.

## Feedback
- **Toast notification** — For non-blocking success/info messages
- **Inline validation** — For form fields (validate on blur, not on keystroke)
- **Progress indicator** — For multi-step or long-running operations
- **Optimistic update** — For low-risk actions where speed matters

**ainative patterns:** Notifications table with expandable bodies and click-through navigation, SSE log streaming for real-time feedback, skeleton loaders for loading states.
