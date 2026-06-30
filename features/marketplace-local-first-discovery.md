---
title: Marketplace Local-First Discovery
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P3
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [marketplace-app-listing]
---

# Marketplace Local-First Discovery

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

ainative is a local-first platform, but the marketplace currently requires an
internet connection to browse. This feature adds a cached marketplace catalog
for offline browsing, an install queue that resolves when connectivity returns,
and periodic background sync to keep the local cache fresh.

Users can discover, evaluate, and queue apps for installation even when
offline — the actual download happens on reconnect.

## User Story

As a ainative user working offline (on a plane, in a coffee shop with flaky
wifi, or by choice), I want to browse the marketplace catalog and queue apps
for installation, so connectivity gaps don't interrupt my workflow.

## Technical Approach

### 1. Local Catalog Cache

Store a snapshot of the marketplace catalog in the local SQLite database:

```sql
CREATE TABLE IF NOT EXISTS marketplace_cache (
  app_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT,                    -- JSON array
  trust_level TEXT NOT NULL,
  install_count INTEGER DEFAULT 0,
  average_rating REAL,
  difficulty INTEGER,
  icon_url TEXT,
  version TEXT NOT NULL,
  manifest_summary TEXT,       -- JSON: table/schedule/profile counts
  creator_name TEXT,
  last_synced_at TEXT NOT NULL
);
```

This table stores enough metadata to render marketplace cards and the
"What's Included" summary without network access. It does **not** cache
screenshots or the full README (those require online access).

### 2. Periodic Catalog Sync

Background sync runs on a configurable interval (default: daily):

1. Fetch full catalog from `GET /api/marketplace/apps?format=catalog`
2. Upsert all rows into `marketplace_cache`
3. Delete rows for apps no longer in the remote catalog
4. Update `last_synced_at` timestamps

Sync is triggered by:
- App startup (if last sync > 24 hours ago)
- Manual "Refresh Catalog" button in marketplace UI
- When connectivity is restored after an offline period

Implementation uses the existing scheduler infrastructure from
`src/lib/schedules/scheduler.ts` with a system-level schedule that
runs the sync function.

### 3. Offline Detection

Check connectivity status using a lightweight ping:

```ts
async function isOnline(): Promise<boolean> {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

The marketplace page adapts its UI based on connectivity:
- **Online**: fetch live data, update cache in background
- **Offline**: read from `marketplace_cache`, show "Offline — showing cached
  catalog from {date}" banner

### 4. Install Queue

When a user clicks "Install" while offline:

1. Store the install intent in a local `install_queue` table:
   ```sql
   CREATE TABLE IF NOT EXISTS install_queue (
     id TEXT PRIMARY KEY,
     app_id TEXT NOT NULL,
     queued_at TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'queued'
       CHECK (status IN ('queued', 'installing', 'installed', 'failed'))
   );
   ```
2. Show confirmation: "Queued for install. Will download when you're back
   online."
3. On connectivity restore, process the queue sequentially:
   - Download `.sap` from source channel
   - Install via `installApp()`
   - Update queue status
   - Send notification on completion

The install queue is visible in a small badge on the marketplace tab:
"2 queued" with a dropdown showing queued apps and their status.

### 5. Cache Staleness Indicator

Marketplace cards from the cache show a subtle indicator of freshness:

- Last synced < 1 day: no indicator
- Last synced 1-7 days: "Updated {N} days ago" in muted text
- Last synced > 7 days: amber warning "Catalog may be outdated — connect
  to refresh"

## Acceptance Criteria

- [ ] Marketplace catalog cached in local SQLite `marketplace_cache` table.
- [ ] Background sync runs daily and on app startup (if stale).
- [ ] Marketplace page renders from cache when offline.
- [ ] "Offline" banner shown with last sync date when disconnected.
- [ ] Install queue stores pending installs for offline resolution.
- [ ] Queued installs process automatically on connectivity restore.
- [ ] Manual "Refresh Catalog" button triggers immediate sync.
- [ ] Cache staleness indicator shown when catalog is > 1 day old.
- [ ] `marketplace_cache` and `install_queue` tables added to `clear.ts`.

## Scope Boundaries

**Included:**
- Local SQLite catalog cache
- Periodic background sync (daily default)
- Offline detection and UI adaptation
- Install queue with auto-resolution on reconnect
- Cache staleness indicators

**Excluded:**
- Offline screenshot/README caching (requires significant storage)
- Offline search within cached catalog (V1 is browse-only)
- Peer-to-peer catalog sharing
- Offline app updates (only new installs are queued)

## References

- Source: brainstorm session 2026-04-11, plan §6e
- Related: `marketplace-app-listing` (online catalog display),
  `app-distribution-channels` (download resolution)
- Files to create:
  - `src/lib/marketplace/cache.ts` — catalog cache sync logic
  - `src/lib/marketplace/install-queue.ts` — offline install queue
  - `src/lib/marketplace/connectivity.ts` — online/offline detection
- Files to modify:
  - `src/lib/db/schema.ts` — add `marketplace_cache` and `install_queue` tables
  - `src/lib/db/index.ts` — bootstrap CREATE for new tables
  - `src/lib/data/clear.ts` — add new tables to clear list
  - `src/app/marketplace/page.tsx` — offline mode UI
