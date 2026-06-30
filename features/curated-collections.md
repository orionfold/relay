---
title: Curated Collections
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P3
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [marketplace-trust-ladder]
---

# Curated Collections

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

Individual apps are powerful, but many users need a coordinated set of apps
to accomplish a goal. Curated collections are themed app bundles — like
"Solo Consultant Pack" or "Content Creator Suite" — that group related apps
into a one-click install experience. Collections can be editorially curated
by the platform team or algorithmically generated from "frequently installed
together" patterns.

Collections reduce the cognitive load of marketplace browsing: instead of
evaluating 20 individual apps, a new user picks one collection that matches
their role and gets a complete, pre-vetted setup.

## User Story

As a new ainative user, I want to install a curated collection of apps that
match my role (consultant, content creator, developer), so I can get a
complete setup in one click instead of evaluating and installing apps one
by one.

As a platform curator, I want to create themed collections that showcase
the best app combinations, so users discover high-quality apps and creators
get more exposure.

## Technical Approach

### 1. Collection Data Model

Supabase `app_collections` table:

```sql
CREATE TABLE app_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  curator_id TEXT NOT NULL,           -- platform team or featured creator
  curator_name TEXT NOT NULL,
  featured_image_url TEXT,
  app_ids TEXT NOT NULL,              -- JSON array of app_id strings
  category TEXT,                      -- optional: Finance, Productivity, etc.
  is_editorial BOOLEAN DEFAULT true,  -- editorial vs algorithmic
  display_order INTEGER DEFAULT 0,    -- for editorial sorting
  install_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2. Collections Listing Page

New route: `/marketplace/collections`

Accessible from the marketplace tab navigation (alongside Apps, Blueprints,
Profiles, Templates).

**Collection card layout:**
```
┌─────────────────────────────────────┐
│  [Featured Image]                   │
│                                     │
│  Solo Consultant Pack               │
│  by ainative Team                    │
│                                     │
│  Everything you need to run a solo  │
│  consulting practice: client CRM,   │
│  invoicing, project tracking, and   │
│  automated follow-ups.              │
│                                     │
│  5 apps  ·  ⬇ 340 installs         │
│                                     │
│  [Install Collection]               │
└─────────────────────────────────────┘
```

Cards arranged in a responsive grid (1 col mobile, 2 col tablet, 3 col desktop).
Editorial collections sorted by `display_order`; algorithmic collections
appended after.

### 3. Collection Detail Page

Route: `/marketplace/collections/[id]`

Sections:
- **Header**: collection name, curator, description, featured image, install
  count, "Install All" button
- **Included Apps**: list of all apps in the collection, each rendered as a
  compact app card showing: title, category badge, rating, trust badge,
  individual install status (installed / not installed / update available)
- **Individual actions**: each app has its own "Install" button so users can
  pick and choose

The "Install All" button installs every app in the collection that is not
already installed, in sequence.

### 4. Sequential Install with Progress

When "Install All" is clicked:

1. Filter out already-installed apps
2. Resolve dependencies across the collection (some apps may depend on others
   in the same collection — install those first)
3. Install sequentially with a progress indicator:

```
Installing Solo Consultant Pack (3 of 5)

✓ Client CRM               installed
✓ Invoice Tracker           installed
◐ Project Planner           installing...
○ Follow-Up Automator       queued
○ Consultant Dashboard      queued

[Cancel Remaining]
```

Progress stored in component state. If the user navigates away and returns,
any partially-completed install is resumed from where it left off (queued
apps in `install_queue` from `marketplace-local-first-discovery`, or a
local state if that feature isn't available).

Failures on individual apps don't block the rest: failed apps are marked
with an error and a "Retry" button.

### 5. Editorial Curation

Platform team creates collections via:
- V1: direct Supabase inserts (admin tooling)
- Future: admin UI in creator portal

Curation guidelines:
- Each collection has 3-8 apps (not too few to be trivial, not too many
  to overwhelm)
- Apps in a collection should be from `verified` or `official` trust levels
- Collections are versioned: updating the app list creates a new version
  (old installs unaffected)

### 6. Algorithmic "Frequently Installed Together"

After sufficient install data accumulates (500+ total installs), compute
co-installation patterns:

```ts
// Pseudo-algorithm
function computeFrequentPairs(): AppPair[] {
  // For each pair of apps (A, B):
  //   count users who installed both
  //   compute lift = P(A and B) / (P(A) * P(B))
  //   pairs with lift > 2.0 and count > 10 are significant
  return significantPairs.sort((a, b) => b.lift - a.lift);
}
```

Algorithmic collections are auto-generated weekly:
- "Frequently installed with {popular-app}" — top 3 co-installed apps
- "Popular in {category}" — top 5 apps per category by recent installs

These appear below editorial collections with an "Auto-curated" badge.

V1 may ship with editorial collections only and add algorithmic suggestions
later when install volume supports it.

### 7. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/marketplace/collections` | GET | List published collections |
| `/api/marketplace/collections/[id]` | GET | Collection detail with app list |
| `/api/marketplace/collections/[id]/install` | POST | Install all apps in collection |

## Acceptance Criteria

- [ ] `/marketplace/collections` page shows collection cards in responsive grid.
- [ ] Collection detail page lists all included apps with individual install
      status.
- [ ] "Install All" button installs un-installed apps sequentially with
      progress indicator.
- [ ] Individual app "Install" buttons work within collection detail page.
- [ ] Failed installs don't block remaining apps; show error + retry.
- [ ] Editorial collections sorted by `display_order`.
- [ ] Collection cards show: name, curator, description, app count, install count.
- [ ] At least 2 seed collections created for launch ("Solo Consultant Pack",
      "Content Creator Suite").
- [ ] Collections tab appears in marketplace navigation.
- [ ] `app_collections` table exists in Supabase with correct schema.

## Scope Boundaries

**Included:**
- Collection data model in Supabase
- Collections listing and detail pages
- Sequential install with progress indicator
- Editorial curation (direct DB inserts for V1)
- Collection cards and marketplace tab

**Excluded:**
- Algorithmic co-installation suggestions (requires install volume data)
- Admin UI for collection management (V1 uses Supabase directly)
- Collection versioning / changelog
- User-created collections (only platform/featured creators)
- Collection ratings or reviews (apps have individual reviews)

## References

- Source: brainstorm session 2026-04-11, plan §6c
- Related: `marketplace-trust-ladder` (apps should be verified+),
  `marketplace-app-listing` (app cards reused),
  `marketplace-local-first-discovery` (install queue for offline)
- Files to create:
  - `src/app/marketplace/collections/page.tsx`
  - `src/app/marketplace/collections/[id]/page.tsx`
  - `src/components/marketplace/collection-card.tsx`
  - `src/components/marketplace/collection-install-progress.tsx`
  - `src/app/api/marketplace/collections/route.ts`
  - `src/app/api/marketplace/collections/[id]/route.ts`
  - `src/app/api/marketplace/collections/[id]/install/route.ts`
- Files to modify:
  - `src/app/marketplace/page.tsx` — add Collections tab
  - `src/lib/marketplace/marketplace-client.ts` — add collection methods
