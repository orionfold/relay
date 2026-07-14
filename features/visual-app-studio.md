---
title: Visual App Studio
status: deferred
priority: P2
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [app-extended-primitives-tier2, app-package-format]
---

# Visual App Studio

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

The Visual App Studio is a split-pane editor UI for visual app building
and editing. It provides a structured, visual alternative to the chat-based
app authoring tools — serving power users who prefer direct manipulation
over conversation, and complementing the chat tools by providing a visual
editor for fine-tuning apps created via `/build-app` or remix.

The studio is organized as a three-pane layout:

- **Left pane: Bundle tree** — a navigable tree showing the app's full
  structure: manifest, tables (with columns), schedules, profiles, pages
  (with widgets), triggers, and environment variables. Click any node to
  edit it in the center pane.

- **Center pane: Form editor** — contextual forms that change based on the
  selected tree node. A table node shows the schema designer; a schedule
  node shows the cron picker; a profile node shows the SKILL.md editor; a
  page node shows the widget composer.

- **Right pane: Live preview** — the app rendered in an iframe with
  hot-reload. As the user edits schemas, pages, or widgets in the center
  pane, the preview updates in real-time.

The studio supports both editing installed apps (`/apps/[appId]/studio`)
and creating new apps from scratch (`/apps/new/studio`). For first-time
creators, a 5-step wizard guides them through the creation process:
purpose, users, data model, automation, and branding.

The key design principle is **YAML-visual roundtrip**: either side can
drive. Edit the YAML directly and the visual form updates; modify the form
and the YAML updates. This is inspired by Storybook's controls pattern —
structured data has both a visual representation and a serialized one, and
they stay in sync.

## User Story

As a power user who prefers visual editing, I want a structured studio
interface where I can see my app's full structure, edit any part with
specialized forms, and see live previews of my changes, so that I can
build and refine apps with precision and speed.

## Technical Approach

### 1. Route structure

Two new routes serve the studio:

- **`/apps/[appId]/studio`** — edit an installed app. Loads the app's
  manifest from `app_instances` and renders it in the studio.
- **`/apps/new/studio`** — create a new app from scratch. Starts with an
  empty manifest and the 5-step wizard.

Both routes use the same studio layout component with the three-pane split.

**Key files:**
- `src/app/apps/[appId]/studio/page.tsx` — Server Component that loads
  the installed app's manifest and passes it to the studio client component
- `src/app/apps/new/studio/page.tsx` — Server Component that initializes
  an empty manifest and passes it to the studio

### 2. Studio layout component

The core studio component manages the three-pane layout and state
synchronization:

```ts
// src/components/apps/studio/AppStudio.tsx
interface AppStudioProps {
  initialBundle: AppBundle | null;  // null for new apps
  appId?: string;                    // undefined for new apps
}

export function AppStudio({ initialBundle, appId }: AppStudioProps) {
  const [bundle, setBundle] = useState(initialBundle || emptyBundle());
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  // YAML ↔ visual sync
  const [yamlSource, setYamlSource] = useState(() => bundleToYaml(bundle));

  // When bundle changes, update YAML
  useEffect(() => setYamlSource(bundleToYaml(bundle)), [bundle]);

  // When YAML is edited directly, parse and update bundle
  const handleYamlEdit = (yaml: string) => {
    try {
      const parsed = yamlToBundle(yaml);
      setBundle(parsed);
      setYamlSource(yaml);
    } catch { /* show parse error in editor gutter */ }
  };

  return (
    <div className="flex h-screen">
      <BundleTree bundle={bundle} selected={selectedNode}
        onSelect={setSelectedNode} className="w-64 border-r" />
      <FormEditor bundle={bundle} node={selectedNode}
        onChange={setBundle} className="flex-1" />
      <LivePreview bundle={bundle} key={previewKey}
        className="w-96 border-l" />
    </div>
  );
}
```

### 3. Bundle tree component

The left pane renders a collapsible tree reflecting the bundle structure:

```
📦 My App (v1.0.0)
├── 📋 Manifest
├── 🗃️ Tables
│   ├── positions (5 columns)
│   ├── transactions (7 columns)
│   └── watchlist (4 columns)
├── ⏰ Schedules
│   ├── daily-review (0 9 * * *)
│   └── weekly-report (0 9 * * 1)
├── 🤖 Profiles
│   └── wealth-analyst
├── 📄 Pages
│   ├── dashboard (3 widgets)
│   ├── positions (2 widgets)
│   └── transactions (1 widget)
├── ⚡ Triggers
│   └── on-position-change
└── 🔧 Environment
    └── OPENAI_API_KEY (optional)
```

Each node type has an icon, a label, and a count or summary. Nodes are
clickable and support keyboard navigation. Right-click context menus
offer Add, Delete, Duplicate, and Move actions.

**Key file:** `src/components/apps/studio/BundleTree.tsx`

### 4. Form editors (center pane)

The center pane renders a contextual form based on the selected tree node.
Each node type has a dedicated editor component:

#### Schema Designer (`SchemaDesigner.tsx`)

Visual column editor for table definitions:

- Column list with name, type (dropdown), nullable, default value, and
  description fields
- Drag-and-drop column reordering
- Inline sample data table showing seed rows for the table
- "Generate synthetic data with AI" button — calls LLM to generate
  realistic sample rows based on column names and types
- Foreign key picker — dropdown showing other tables/columns for FK
  relationships
- Column type presets: id (auto-increment), name (text), email (text),
  amount (real), date (text ISO), boolean (integer), enum (text)

#### Schedule Calendar (`ScheduleCalendar.tsx`)

Visual schedule editor:

- Cron expression input with human-readable preview ("Every weekday at
  9:00 AM")
- Calendar view showing when the schedule fires over the next 30 days
- Prompt template editor with syntax highlighting
- Timezone selector
- Enable/disable toggle

#### Profile Tuner (`ProfileTuner.tsx`)

Agent profile editor:

- Markdown editor for SKILL.md content (with live preview)
- Tool checklist — checkboxes for which tools the profile can use
- "Try it" chat sandbox — inline chat interface that uses the profile
  for a test conversation
- Temperature and token limit sliders
- System prompt preview

#### Widget Palette and Page Composer (`WidgetPalette.tsx`, `PageComposer.tsx`)

Page layout editor:

- **Widget palette** — draggable widget cards:
  - `hero` — large stat display with label and trend arrow
  - `stats` — grid of 2-4 key metrics
  - `table` — data table with configurable columns and data source
  - `text` — rich text block (markdown)
  - `actions` — button group for common actions
  - `linkedAssets` — card grid linking to related entities
  - `scheduleList` — upcoming schedule runs with status

- **Page grid** — 12-column responsive grid where widgets are placed.
  Drag widgets from the palette onto the grid. Resize by dragging edges.
  Each widget cell shows a miniature preview.

- **Widget configurator** — when a widget is selected, a property panel
  shows its configurable props (data source, columns, filters, display
  options).

**Key files:**
- `src/components/apps/studio/SchemaDesigner.tsx`
- `src/components/apps/studio/ScheduleCalendar.tsx`
- `src/components/apps/studio/ProfileTuner.tsx`
- `src/components/apps/studio/WidgetPalette.tsx`
- `src/components/apps/studio/PageComposer.tsx`

### 5. Live preview (right pane)

The right pane renders the app in an iframe using the same app shell
renderer used for installed apps:

```ts
// src/components/apps/studio/LivePreview.tsx
export function LivePreview({ bundle }: { bundle: AppBundle }) {
  const previewUrl = useMemo(() => {
    // Serialize bundle to a temporary preview endpoint
    // that renders the app without installing it
    const encoded = encodeURIComponent(JSON.stringify(bundle));
    return `/api/apps/preview?bundle=${encoded}`;
  }, [bundle]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b">
        <span className="text-sm font-medium">Live Preview</span>
        <select className="text-xs">
          <option>Desktop (1280px)</option>
          <option>Tablet (768px)</option>
          <option>Mobile (375px)</option>
        </select>
      </div>
      <iframe src={previewUrl} className="flex-1 w-full" />
    </div>
  );
}
```

The preview API endpoint renders the bundle using the same page/widget
renderer as installed apps but from an in-memory bundle rather than the
database. Changes in the center pane trigger a debounced re-render (300ms)
for a hot-reload experience.

Viewport presets (desktop, tablet, mobile) resize the iframe to test
responsive behavior.

### 6. YAML-visual roundtrip

A toggle button in the center pane switches between visual form mode and
raw YAML editor mode. Both modes read from and write to the same
`AppBundle` state:

- **Visual → YAML**: `bundleToYaml(bundle)` serializes the bundle to
  `manifest.yaml` format. Changes to form fields update the bundle state,
  which triggers YAML re-serialization.
- **YAML → Visual**: `yamlToBundle(yaml)` parses YAML back to an
  `AppBundle`. Edits in the YAML editor are validated on each keystroke
  (debounced) and parse errors are shown as inline annotations.

This roundtrip ensures power users can drop into raw YAML when the visual
forms don't cover an edge case, and return to visual mode with their
changes intact.

### 7. Five-step creation wizard

For new apps (`/apps/new/studio`), an overlay wizard guides the user
through initial setup before opening the full studio:

1. **Purpose** — App name, description, target domain. Pre-fills manifest
   metadata.
2. **Users** — Primary persona, usage frequency, skill level. Informs
   default complexity.
3. **Data** — Quick table builder: name each table, add columns from
   presets. Pre-fills the schema designer.
4. **Automation** — Schedule picker: choose from common patterns (daily
   review, weekly report, on-demand). Pre-fills schedule definitions.
5. **Branding** — Icon picker, accent color, sidebar group. Pre-fills
   manifest display settings.

Each step pre-fills the corresponding bundle section. After the wizard,
the full studio opens with the pre-filled bundle ready for refinement.

### 8. Save and install flow

The studio toolbar has three actions:

- **Save Draft** — persists the current bundle state to localStorage
  (keyed by appId or a temp ID for new apps). Auto-save every 30 seconds.
- **Export .sap** — calls `saveSapDirectory()` to write the bundle as a
  `.sap` directory.
- **Install** — calls `installApp()` + `bootstrapApp()` to install the
  app (or `applyAppChanges()` for existing apps to apply modifications).

For existing apps being edited, a diff view shows what changed since the
last save before the user confirms installation.

## Acceptance Criteria

- [ ] `/apps/[appId]/studio` route loads an installed app's manifest and
      renders the three-pane studio layout.
- [ ] `/apps/new/studio` route presents the 5-step creation wizard and
      then opens the studio with pre-filled bundle.
- [ ] Bundle tree accurately reflects all primitives (tables, schedules,
      profiles, pages, triggers, env vars) with navigation and context
      menus.
- [ ] Schema designer supports adding, removing, reordering columns with
      type selection and default values.
- [ ] "Generate synthetic data with AI" button produces realistic sample
      rows for the selected table.
- [ ] Schedule calendar shows a visual calendar of when schedules fire
      with correct cron parsing.
- [ ] Profile tuner provides SKILL.md editor with live preview and tool
      checklist.
- [ ] Widget palette allows drag-drop of 7 widget types onto page grid.
- [ ] Live preview renders the current bundle state with hot-reload on
      changes (< 500ms latency).
- [ ] YAML-visual roundtrip works in both directions without data loss.
- [ ] Save draft persists to localStorage; export writes `.sap` directory;
      install creates a working app.
- [ ] `npm test` passes; `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- Three-pane studio layout (tree, form editor, live preview)
- Two routes: edit installed app, create new app
- Schema designer with inline sample data and AI generation
- Schedule calendar with cron visualization
- Profile tuner with SKILL.md editor and tool checklist
- Widget palette with 7 widget types and page grid composer
- Live preview with viewport presets
- YAML-visual roundtrip synchronization
- 5-step creation wizard for new apps
- Save draft, export .sap, and install actions

**Excluded:**
- Chat integration within the studio (chat-based editing is
  `conversational-app-editing`)
- Marketplace publishing from studio (separate: `marketplace-app-publishing`)
- Collaborative editing / multi-user (future iteration)
- Custom widget creation / plugin system (future iteration)
- Version control / git integration within studio (future iteration)
- Mobile-optimized studio layout (desktop-only for initial release)

## References

- Source: brainstorm session 2026-04-11 (EXPAND scope)
- Plan: `internal implementation plan` §4e
- Related features: `chat-app-builder` (chat alternative),
  `conversational-app-editing` (chat editing alternative),
  `app-package-format` (defines .sap structure),
  `app-extended-primitives-tier2` (provides all primitives to edit)
- Files to create:
  - `src/app/apps/[appId]/studio/page.tsx` — edit studio route
  - `src/app/apps/new/studio/page.tsx` — create studio route
  - `src/components/apps/studio/AppStudio.tsx` — main layout
  - `src/components/apps/studio/BundleTree.tsx` — left pane tree
  - `src/components/apps/studio/FormEditor.tsx` — center pane router
  - `src/components/apps/studio/SchemaDesigner.tsx` — table editor
  - `src/components/apps/studio/ScheduleCalendar.tsx` — schedule editor
  - `src/components/apps/studio/ProfileTuner.tsx` — profile editor
  - `src/components/apps/studio/WidgetPalette.tsx` — widget drag source
  - `src/components/apps/studio/PageComposer.tsx` — page grid editor
  - `src/components/apps/studio/LivePreview.tsx` — right pane iframe
  - `src/app/api/apps/preview/route.ts` — preview renderer endpoint
- Files to modify:
  - `src/components/shared/app-sidebar.tsx` — add Studio link for
    installed apps
  - `src/lib/apps/service.ts` — add `bundleToYaml()` and
    `yamlToBundle()` helpers
