---
title: App Forking & Remix
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P2
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [marketplace-app-publishing, app-remix]
---

# App Forking & Remix

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

Remixing is the social engine of the ainative marketplace. Every installed app
and every marketplace listing gets a "Remix" button that deep-copies the app
bundle, assigns a new ID with lineage tracking, and gives the remixer a private
draft to customize. This turns every published app into a starting point —
not a finished product.

Lineage tracking makes the ecosystem transparent: users can see where an app
came from, how many times it has been forked, and optionally contribute
improvements back to the original creator via a structured diff flow.

## User Story

As a ainative user, I want to remix any installed or marketplace app into my
own private copy that I can customize, so I don't have to build from scratch
when an existing app is 80% of what I need.

As an app creator, I want to see how many times my app has been remixed and
receive structured contributions from remixers, so I can improve the original
based on real usage patterns.

## Technical Approach

### 1. forkApp() Service Function

New function in `src/lib/apps/service.ts`:

```ts
async function forkApp(
  sourceAppId: string,
  options?: { newName?: string }
): Promise<AppInstance> {
  // 1. Load source app instance (or fetch from marketplace if not installed)
  const source = await getAppInstance(sourceAppId)
    ?? await fetchMarketplaceBundle(sourceAppId);

  // 2. Deep-copy the bundle
  const forkedBundle = structuredClone(source.manifest);

  // 3. Assign new identity
  const timestamp = Date.now();
  forkedBundle.id = `${source.manifest.id}-remix-${timestamp}`;
  forkedBundle.name = options?.newName
    ?? `${source.manifest.name} (Remix)`;

  // 4. Set lineage
  forkedBundle.forkedFrom = {
    appId: source.manifest.id,
    version: source.manifest.version,
    creator: source.manifest.creator,
    forkedAt: new Date().toISOString(),
  };

  // 5. Install as private draft
  const instance = await installApp(forkedBundle, {
    trustLevel: 'private',
    status: 'draft',
  });

  // 6. Increment remix count on source (if marketplace)
  await incrementRemixCount(source.manifest.id);

  return instance;
}
```

### 2. Lineage Data Model

Add to `AppBundle` / `AppManifest` types:

```ts
interface AppLineage {
  appId: string;         // original app ID
  version: string;       // version that was forked
  creator: string;       // original creator
  forkedAt: string;      // ISO timestamp
}

// In AppManifest:
forkedFrom?: AppLineage;
```

Add to Supabase `app_packages`:
- `forked_from_app_id` — nullable reference to source app
- `remix_count` — integer, incremented on each fork

Add to local `app_instances`:
- `forked_from` — JSON blob with AppLineage data

### 3. Lineage Tree Display

On the marketplace detail page, if `forkedFrom` is set:

```
🔗 Forked from Wealth Manager by example-author
```

Clicking the link navigates to the original app's marketplace listing.

On the original app's detail page, show:
```
🔄 12 remixes
```

Clicking shows a list of public remixes (those published to marketplace).

### 4. Remix Button Placement

The "Remix" button appears in two places:

**Installed apps manager:**
- Each app card gets a secondary action "Remix" alongside existing
  Enable/Disable/Uninstall buttons
- Opens a confirmation dialog: "Create a remix of {app name}? You'll get
  a private copy you can customize."
- Optional: rename field in the dialog

**Marketplace detail page:**
- Secondary button next to "Install": "Remix"
- Same confirmation dialog
- If the app is not installed, fetches the bundle from marketplace first

**Key files:**
- `src/components/apps/app-action-buttons.tsx` — add Remix button
- `src/components/marketplace/app-detail-hero.tsx` — add Remix button

### 5. Remix Count on Marketplace Cards

The app card (from `marketplace-app-listing`) adds remix count alongside
install count:

```
⬇ 1.2k  🔄 45  ★ 4.3
```

Remix count fetched from `app_packages.remix_count`.

### 6. Upstream Contribution Flow

When a remixer wants to contribute changes back to the original:

1. **Generate diff manifest** — compare remixed bundle against the original
   version that was forked. Output a structured diff showing:
   - New tables added
   - Columns added to existing tables
   - New schedules
   - Modified profiles
   - New pages

2. **Submit contribution** — store in Supabase `app_contributions` table:
   - `source_app_id` — original app
   - `remix_app_id` — the remix
   - `diff_manifest` — JSON diff
   - `message` — contributor's description
   - `status` — pending / accepted / rejected

3. **Creator review** — original creator sees pending contributions in their
   creator portal. They can review the diff, accept (manually merge), or
   reject with a note.

V1 scope: the diff is informational — the creator manually applies accepted
changes. Automated merge is a future enhancement.

### 7. Draft State

Remixed apps start in `draft` status:
- Not visible in marketplace
- Fully functional locally
- Creator can edit, test, and eventually publish to marketplace
- Publishing changes trust level from `private` to `community`

## Acceptance Criteria

- [ ] "Remix" button appears on installed app cards and marketplace detail page.
- [ ] `forkApp()` creates a deep copy with new ID format `{original}-remix-{timestamp}`.
- [ ] Forked bundle has `forkedFrom` lineage field with source app/version/creator.
- [ ] Remixed app installs as `private` trust level, `draft` status.
- [ ] Remix count incremented on source app in marketplace.
- [ ] Lineage link shown on remixed app's detail page ("Forked from X by Y").
- [ ] Remix count shown on marketplace cards alongside install count.
- [ ] Contribution flow: generate diff → submit → creator sees in portal.
- [ ] Cannot remix an app that is already a draft (prevent remix chains in V1).
- [ ] `npm test` passes; `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- `forkApp()` service function with deep copy and lineage
- Remix button on installed apps and marketplace
- Lineage display on marketplace listings
- Remix count tracking
- Upstream contribution flow (diff generation + submission)
- Draft state for remixed apps

**Excluded:**
- Automated merge of contributions (V1 is manual review)
- Remix chains (remix of a remix) — blocked in V1 for simplicity
- Schema migration between original and remix versions
- Chat-driven remix (see `app-remix` for the chat tool)
- Revenue sharing between original creator and remixer

## References

- Source: brainstorm session 2026-04-11, plan §6a
- Related: `app-remix` (chat tool for LLM-driven remixing),
  `marketplace-app-publishing` (publish remixed apps),
  `creator-portal` (review contributions)
- Files to modify:
  - `src/lib/apps/service.ts` — add `forkApp()`
  - `src/lib/apps/types.ts` — add `AppLineage` interface, extend `AppManifest`
  - `src/components/apps/app-action-buttons.tsx` — add Remix button
- Files to create:
  - `src/lib/apps/diff.ts` — diff manifest generation
  - `src/components/marketplace/remix-confirmation-dialog.tsx`
