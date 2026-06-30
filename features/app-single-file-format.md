---
title: App Single-File Format
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P2
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [app-package-format]
---

# App Single-File Format

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

The `.sap` directory format is powerful but heavy for simple apps. This
feature introduces a single-file `app.md` format that encodes an entire
ainative app in one markdown file — frontmatter for the manifest, fenced
code blocks for each primitive (tables, schedules, profiles, pages). The
file is copy-pasteable via GitHub Gist, shareable in chat, and installable
directly with `ainative app install ./my-app.md`.

This targets power users and hobbyists who want to create and share simple
apps without managing a directory of YAML files. The single-file format
is a strict subset of what `.sap` supports — apps that need custom icons,
screenshots, seed data CSVs, or multiple pages per profile should use the
full package format.

The format uses standard markdown conventions (YAML frontmatter + fenced
code blocks with language/label annotations) so it renders readably on
GitHub, in any markdown viewer, and in documentation.

## User Story

As a power user, I want to create a simple ainative app in a single markdown
file that I can share via Gist or paste in a README, so that anyone can
install it with one command without downloading a package.

## Technical Approach

### 1. File format specification

An `app.md` file has this structure:

```markdown
---
id: crypto-tracker
name: Crypto Tracker
version: 1.0.0
description: Track cryptocurrency portfolio and daily price changes
category: finance
tags: [crypto, portfolio, trading]
difficulty: beginner
sidebar:
  label: Crypto Tracker
  icon: bitcoin
  route: /app/crypto-tracker
---

# Crypto Tracker

A simple app to track your cryptocurrency holdings and monitor daily price
movements.

## Tables

~~~table positions
columns:
  - name: symbol
    type: text
    required: true
  - name: name
    type: text
  - name: quantity
    type: number
    required: true
  - name: avgCost
    type: number
  - name: currentPrice
    type: number
  - name: value
    type: number
  - name: change24h
    type: number
  - name: notes
    type: text
~~~

~~~table watchlist
columns:
  - name: symbol
    type: text
    required: true
  - name: targetPrice
    type: number
  - name: alertType
    type: text
  - name: notes
    type: text
~~~

## Schedules

~~~schedule daily-price-check
interval: every day at 9am
prompt: >
  Check current prices for all positions in the crypto-tracker positions
  table. Update currentPrice and change24h columns. Flag any positions
  with >5% daily change. Summarize the portfolio performance.
~~~

## Profiles

~~~profile crypto-analyst
You are a cryptocurrency portfolio analyst. You help track holdings,
analyze price movements, and identify risks in a crypto portfolio.

## Core responsibilities
- Monitor portfolio positions and daily price changes
- Alert on significant price movements (>5% daily)
- Provide market context for price changes
- Suggest rebalancing when positions drift from targets

## Tools
- readTable: Read portfolio positions and watchlist
- updateTable: Update prices and calculated fields
- createNotification: Alert on significant changes

## Guidelines
- Always cite specific data points, never speculate on prices
- Use conservative risk language
- Distinguish between realized and unrealized gains
~~~

## Pages

~~~page dashboard
title: Dashboard
widgets:
  - type: stats
    config:
      metrics: [totalValue, dayChange, positions, watchlistAlerts]
  - type: table
    config:
      tableId: positions
      columns: [symbol, quantity, currentPrice, value, change24h]
  - type: table
    config:
      tableId: watchlist
      columns: [symbol, targetPrice, alertType]
~~~
```

### 2. Parsing rules

The `mdToBundle()` parser extracts an `AppBundle` from the markdown file
using these rules:

1. **Frontmatter** (between `---` delimiters) — parsed as YAML, mapped to
   `AppManifest` fields. Same Zod schema as `manifest.yaml` but with
   optional fields that have sensible defaults (platform version defaults
   to current, author defaults to empty).

2. **Prose content** (markdown text outside fenced blocks) — stored as the
   app's `README.md` content. The first `# Heading` becomes the display
   name if not set in frontmatter.

3. **Fenced code blocks** with typed labels — each block declares one
   primitive:

   | Block syntax | Primitive type | Content format |
   |---|---|---|
   | `` ```table <id> `` | TableDefinition | YAML (columns array) |
   | `` ```schedule <id> `` | ScheduleTemplate | YAML (interval + prompt) |
   | `` ```profile <id> `` | AgentProfile | SKILL.md markdown |
   | `` ```page <id> `` | AppPage | YAML (title + widgets) |
   | `` ```blueprint <id> `` | WorkflowBlueprint | YAML (steps array) |

   The tildes (`~~~`) syntax is also supported as an alternative fence
   to avoid escaping issues when the app.md itself is inside a code block.

4. **Section headings** (`## Tables`, `## Schedules`, etc.) are cosmetic
   and ignored by the parser. Only the fenced blocks carry semantic meaning.

### 3. `mdToBundle()` implementation

New file `src/lib/apps/md-converter.ts`:

```ts
import matter from "gray-matter";

export async function mdToBundle(content: string): Promise<AppBundle> {
  // 1. Extract frontmatter
  const { data: manifest, content: body } = matter(content);

  // 2. Validate manifest against schema
  const validatedManifest = manifestYamlSchema.parse({
    ...manifestDefaults,
    ...manifest,
  });

  // 3. Extract fenced blocks
  const blocks = extractFencedBlocks(body);

  // 4. Parse each block by type
  const tables = blocks
    .filter(b => b.type === "table")
    .map(b => parseTableBlock(b));

  const schedules = blocks
    .filter(b => b.type === "schedule")
    .map(b => parseScheduleBlock(b));

  const profiles = blocks
    .filter(b => b.type === "profile")
    .map(b => parseProfileBlock(b));

  const pages = blocks
    .filter(b => b.type === "page")
    .map(b => parsePageBlock(b));

  const blueprints = blocks
    .filter(b => b.type === "blueprint")
    .map(b => parseBlueprintBlock(b));

  // 5. Extract prose as README
  const readme = extractProse(body, blocks);

  // 6. Assemble AppBundle
  return {
    manifest: validatedManifest,
    tables,
    schedules,
    profiles,
    ui: { pages },
    blueprints,
    readme,
  };
}
```

The `extractFencedBlocks()` function uses a regex to find all fenced code
blocks with typed labels:

```ts
const BLOCK_REGEX = /^(?:```|~~~)(\w+)\s+([a-z0-9-]+)\s*\n([\s\S]*?)^(?:```|~~~)\s*$/gm;

interface FencedBlock {
  type: string;   // "table", "schedule", "profile", "page", "blueprint"
  id: string;     // block label
  content: string; // raw content between fences
}
```

### 4. `bundleToMd()` implementation

The reverse conversion serializes an `AppBundle` back to a single markdown
file:

```ts
export function bundleToMd(bundle: AppBundle): string {
  // 1. Serialize manifest as YAML frontmatter
  const frontmatter = yaml.dump(bundle.manifest);

  // 2. Add README prose
  const prose = bundle.readme || `# ${bundle.manifest.name}\n\n${bundle.manifest.description}`;

  // 3. Serialize each primitive as fenced blocks grouped by section
  const sections: string[] = [];

  if (bundle.tables.length > 0) {
    sections.push("## Tables\n");
    for (const table of bundle.tables) {
      sections.push(`\`\`\`table ${stripNamespace(table.id)}\n${yaml.dump(table)}\`\`\`\n`);
    }
  }

  // ... repeat for schedules, profiles, pages, blueprints

  return `---\n${frontmatter}---\n\n${prose}\n\n${sections.join("\n")}`;
}
```

### 5. Install support

`ainative app install ./my-app.md` detects the `.md` extension and routes
to the single-file handler:

```ts
// In src/lib/apps/cli/install.ts
if (source.endsWith(".md")) {
  const content = await readFile(source, "utf-8");
  const bundle = await mdToBundle(content);
  return installApp(bundle);
}
```

The same detection works for URL sources — if the URL ends in `.md`, fetch
the content and parse it as a single-file app.

### 6. Gist support

Since GitHub Gist URLs serve raw content at `https://gist.githubusercontent.com/...`,
the install command can accept Gist URLs directly:

```
ainative app install https://gist.githubusercontent.com/user/abc123/raw/my-app.md
```

The URL handler fetches the raw content, detects the `.md` extension, and
routes to `mdToBundle()`.

## Acceptance Criteria

- [ ] `mdToBundle()` correctly parses a single-file app with frontmatter,
      tables, schedules, profiles, and pages into a valid `AppBundle`.
- [ ] `bundleToMd()` serializes an `AppBundle` to a single markdown file
      that round-trips: `mdToBundle(bundleToMd(bundle))` produces an
      equivalent bundle.
- [ ] Both `` ``` `` and `~~~` fence syntaxes are supported.
- [ ] Fenced blocks without recognized types are ignored (future-proofing).
- [ ] Prose content outside fenced blocks is preserved as README text.
- [ ] `ainative app install ./my-app.md` installs from a local file.
- [ ] The rendered markdown is human-readable on GitHub without ainative
      (tables of columns, schedule descriptions, profile text).
- [ ] Validation errors include line numbers pointing to the problematic
      block in the source file.
- [ ] The two builtin apps can be exported to single-file format via
      `bundleToMd()` and re-imported cleanly.

## Scope Boundaries

**Included:**
- `mdToBundle()` parser for single-file app format
- `bundleToMd()` serializer for single-file output
- Fenced block extraction with type + label parsing
- CLI install support for `.md` files (local and URL)
- Round-trip tests between bundle and markdown representations

**Excluded:**
- MDX component rendering (blocks are parsed as YAML/markdown, not executed)
- Inline seed data in the markdown file (use `.sap` for seed data)
- Multi-file markdown (one file = one app)
- Custom widget types beyond the standard 7
- Visual editor for the markdown format (see `visual-app-studio`)
- Icon or screenshot embedding (text-only format)

## References

- Source: brainstorm session 2026-04-11 (all-three-tiers authoring decision)
- Related: `app-package-format` (the full `.sap` format this simplifies),
  `app-cli-tools` (provides install command this plugs into)
- Files to create:
  - `src/lib/apps/md-converter.ts` — `mdToBundle()` and `bundleToMd()`
  - `src/lib/apps/__tests__/md-converter.test.ts` — parsing and round-trip
    tests
  - `src/lib/apps/__tests__/fixtures/sample-app.md` — reference single-file
    app for testing
- Files to modify:
  - `src/lib/apps/cli/install.ts` — add `.md` source detection
- Dependencies (npm):
  - `gray-matter` — YAML frontmatter parsing (already in project)
