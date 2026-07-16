---
title: Semantic Table Render and Row Views
status: completed
priority: P1
milestone: workshop-enablement
source: _IDEAS/backlog.md G-061
dependencies:
  - tables-spreadsheet-editor
  - composed-app-view-shell
---

# Semantic Table Render and Row Views

## Outcome

Every generic table-data surface offers labeled `Render` and `Row` modes.
Render turns a record into a responsive semantic item; Row remains the dense
spreadsheet and canonical inline-editing surface. `/tables/[id]` defaults to
Row. Generic table heroes in app shells default to Render.

## Display metadata

`ColumnConfig` gains optional additive metadata:

- `displayRole`: `title`, `description`, `image`, `category`, `metric`,
  `date`, `link`, `boolean`, or `meta`;
- `numberPolarity`: `higher`, `lower`, `neutral`;
- `numberDomain`: optional `{ min, max }`.

Pack manifests, DB column config and export/install round trips preserve these
fields because they remain within the existing typed column-definition
contract.

## Resolver

Resolution is explicit-role-first, then deterministic fallback:

- first short text-like column → title;
- first long text/description/notes-like column → description;
- safe image-looking URL column → image;
- select/status/stage/category-like column → category;
- number → metric;
- date, URL/email and boolean keep their native roles;
- remaining supported values become metadata.

At most one title, description and image are chosen. Unsupported or malformed
values render as truthful metadata or an explicit unavailable value; nothing
is silently discarded.

## Render item anatomy

- optional bounded 96×72 lazy thumbnail with fallback;
- title and description abstract;
- deterministic category pills derived from stable category text;
- number value plus labeled low/mid/high intensity;
- dates, booleans, links and remaining metadata;
- activation opens the existing row detail sheet;
- nested links do not activate the parent;
- selection remains separate and Row-only editing is preserved.

Only `https:`, `http:` on localhost, and `data:image/` URLs are accepted for
thumbnails. Other schemes and credential-bearing URLs are refused.

Numeric intensity uses an explicit domain where supplied, otherwise the finite
values in the current result set. Empty, single-value and equal-range sets
render `No range`, not a fabricated intensity. Polarity changes only the
descriptive direction label; color never implies good/bad and is never the
only signal.

## State contract

Mode changes preserve the current rows, sorts and selection state. A pending
row detail edit stays in the existing sheet. The switcher is a labeled
two-button group with `aria-pressed`; mode is local to the mounted surface.

## Acceptance criteria

- [x] Display metadata round-trips through DB, API, manifest install and app
      export without breaking older definitions.
- [x] The shared resolver is deterministic across all column types and
      explicit roles win.
- [x] Render handles safe/unsafe/broken images, stable category pills and
      numeric empty/single/equal/min-mid-max/negative/NaN cases.
- [x] `/tables/[id]` defaults Row and table-backed app heroes default Render.
- [x] Mode switching does not mutate data or lose sorts, selection or row
      detail state.
- [x] Keyboard activation, nested links, visible focus, system cursor and
      responsive light/dark layouts are preserved.
- [x] Specialized Inbox, Ledger, chart, funnel and gallery surfaces are not
      replaced.

## Regression disposition

- Unit tests protect role resolution, URL safety, category stability and
  numeric normalization/polarity.
- Component tests protect switcher state, mode defaults, row activation,
  nested links and empty values.
- Existing table/API/export/install tests protect additive config round trips.
- Browser verification covers `/tables/[id]` and two table-backed app shells.

## Completion evidence

- Resolver and component regressions pass.
- The isolated workshop table verified Row as the table-detail default and
  Render as a semantic two-card presentation with explicit title,
  description, category, metric and metadata treatment.
- The rendered surface passed desktop light browser checks for interaction,
  overflow and authored system-cursor conformance.
