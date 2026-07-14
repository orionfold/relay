---
title: Marketplace App Listing
status: completed
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [marketplace-access-gate, app-runtime-bundle-foundation]
---

# Marketplace App Listing

## Description

The existing marketplace supports blueprints only. This feature extends it to
full apps — the primary unit of distribution in ainative's app ecosystem. An
"Apps" tab is added alongside the existing "Blueprints" tab, with a card-grid
listing page, a rich detail page per app, and an install confirmation dialog
that clearly communicates what the app will create on the user's instance.

The listing page is read-only and pulls from the Supabase `app_packages` registry.
Each card surfaces enough signal (category, install count, rating, difficulty,
trust badge) for a user to decide whether to tap through to the detail page
without information overload.

The detail page is the conversion surface: screenshots, a "What's Included"
manifest summary, platform compatibility, setup time, and a single Install
button that opens the confirmation dialog.

## User Story

As a ainative user, I want to browse available apps in a familiar card-grid
marketplace, drill into a detail page to understand what an app installs,
and confirm the install with a clear summary of permissions and artifacts —
so I can confidently add new capabilities to my instance without surprises.

## Technical Approach

### 1. Marketplace Tab Navigation

Extend the existing marketplace page to support multiple tabs:

- **Apps** — full app bundles (this feature)
- **Blueprints** — existing functionality
- **Profiles** — agent profile templates
- **Templates** — project/workflow templates

Tab state managed via URL search param `?tab=apps` (default). Each tab lazy-loads
its own data. The existing blueprint listing moves under `?tab=blueprints`.

**Key file:** `src/app/marketplace/page.tsx` — add tab navigation, default to Apps.

### 2. App Listing Page (`/marketplace/apps`)

Card grid layout matching the existing blueprint card pattern but with
app-specific metadata:

```
┌─────────────────────────────┐
│  [Icon]  Title              │
│  Category Badge             │
│                             │
│  Description (2-line clamp) │
│                             │
│  ⬇ 1.2k  ★ 4.3  ●●●○○     │
│  [Trust Badge]              │
└─────────────────────────────┘
```

Card fields:
- **Icon** — app icon (default: category-specific fallback)
- **Title** — app name
- **Category badge** — colored StatusChip (Finance, Sales, Content, Dev, Automation)
- **Description** — 2-line clamped text
- **Install count** — download icon + formatted number
- **Rating** — star icon + average (hidden if < 5 ratings)
- **Difficulty dots** — 1-5 filled circles (beginner to advanced)
- **Trust badge** — shield icon colored by trust level (gray/blue/green/gold)

Category filter bar above the grid:
- All | Finance | Sales | Content | Dev | Automation
- Implemented as `FilterBar` component with toggle buttons
- URL param: `?category=finance`

Data source: `GET /api/marketplace/apps` — proxies to Supabase `app_packages`
table filtered by `status = 'published'`.

**Key files:**
- `src/app/marketplace/apps/page.tsx` — new listing page (or inline in marketplace tabs)
- `src/components/marketplace/app-card.tsx` — new card component
- `src/components/marketplace/app-category-filter.tsx` — new filter bar
- `src/app/api/marketplace/apps/route.ts` — new API route

### 3. App Detail Page (`/marketplace/apps/[id]`)

Full-width detail page with:

**Hero section:**
- App icon (large), title, creator name, category badge, trust badge
- Install button (primary CTA)
- Rating summary (stars + count)

**Screenshot carousel:**
- Horizontal scroll of up to 6 screenshots
- Click to expand in lightbox modal
- Lazy-loaded images from Supabase Storage

**Description section:**
- Full markdown-rendered description
- Collapsible "Read more" if > 300 chars

**"What's Included" section:**
- Table showing artifact counts:
  | Type | Count |
  |------|-------|
  | Tables | 3 |
  | Profiles | 1 |
  | Blueprints | 2 |
  | Schedules | 1 |
  | Pages | 2 |
- Parsed from the app's manifest

**Metadata sidebar (or inline on mobile):**
- Platform compatibility (min/max version)
- Setup time estimate
- Difficulty level (dots)
- Category
- Last updated date
- Version number
- License

**Key files:**
- `src/app/marketplace/apps/[id]/page.tsx` — new detail page
- `src/components/marketplace/app-detail-hero.tsx` — new
- `src/components/marketplace/app-screenshot-carousel.tsx` — new
- `src/components/marketplace/app-whats-included.tsx` — new
- `src/app/api/marketplace/apps/[id]/route.ts` — new API route

### 4. Install Confirmation Dialog

Triggered by the Install button on the detail page. Shows:

- **App name + version**
- **Permissions required** — grouped by tier (Tier A declarative, Tier B integration)
- **What will be created** — itemized list:
  - "1 project: Wealth Manager"
  - "3 tables: positions, transactions, watchlist"
  - "1 schedule: daily-portfolio-review (runs daily at 9am)"
- **Estimated setup time** — from manifest metadata
- **Confirm / Cancel** buttons

Uses the existing dialog pattern (AlertDialog from shadcn). On confirm, calls
`POST /api/apps/install` with the app package ID, which downloads the `.sap`
from Supabase Storage, extracts the bundle, and runs `installApp()`.

**Key files:**
- `src/components/marketplace/install-confirmation-dialog.tsx` — new
- Reuses existing `src/app/api/apps/install/route.ts`

### 5. API Layer

New routes:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/marketplace/apps` | GET | List published apps with filters |
| `/api/marketplace/apps/[id]` | GET | Single app detail with manifest |

Both routes proxy to Supabase via `marketplace-client.ts`. Responses cached
with `Cache-Control: public, max-age=300` (5-minute TTL) since marketplace
data changes infrequently.

## Acceptance Criteria

- [ ] Marketplace page has tabbed navigation: Apps (default) | Blueprints |
      Profiles | Templates.
- [ ] App listing shows card grid with: title, icon, category badge,
      description (2-line clamp), install count, rating, difficulty dots,
      trust badge.
- [ ] Category filter works: All | Finance | Sales | Content | Dev | Automation.
- [ ] Clicking a card navigates to `/marketplace/apps/[id]` detail page.
- [ ] Detail page shows: screenshot carousel, full description, "What's
      Included" manifest summary, metadata sidebar, Install button.
- [ ] Install button opens confirmation dialog showing permissions and
      artifact list.
- [ ] Confirming install triggers the existing install flow and navigates
      to the installed app.
- [ ] Empty state shown when no apps match the selected category.
- [ ] Pages are responsive (card grid reflows, detail page stacks on mobile).

## Scope Boundaries

**Included:**
- Tab navigation on marketplace page
- App card grid with category filters
- App detail page with screenshots, manifest summary, metadata
- Install confirmation dialog
- API routes for listing and detail

**Excluded:**
- Publishing flow (separate feature: `marketplace-app-publishing`)
- Trust verification logic (separate feature: `marketplace-trust-ladder`)
- Search / full-text search (future enhancement)
- Reviews and ratings submission (separate feature: `marketplace-reviews`)
- Offline browsing (separate feature: `marketplace-local-first-discovery`)

## References

- Source: internal history record §4, §9
- Related: `marketplace-access-gate` (tier gating), `app-runtime-bundle-foundation`
  (install machinery), `marketplace-trust-ladder` (trust badges)
- Files to modify:
  - `src/app/marketplace/page.tsx` — add tab navigation
  - `src/lib/marketplace/marketplace-client.ts` — add app listing/detail methods
- Files to create:
  - `src/app/marketplace/apps/page.tsx`
  - `src/app/marketplace/apps/[id]/page.tsx`
  - `src/app/api/marketplace/apps/route.ts`
  - `src/app/api/marketplace/apps/[id]/route.ts`
  - `src/components/marketplace/app-card.tsx`
  - `src/components/marketplace/app-category-filter.tsx`
  - `src/components/marketplace/app-detail-hero.tsx`
  - `src/components/marketplace/app-screenshot-carousel.tsx`
  - `src/components/marketplace/app-whats-included.tsx`
  - `src/components/marketplace/install-confirmation-dialog.tsx`
