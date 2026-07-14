---
title: "Fix: Exported Bundle Not Registered in Sidebar"
status: deferred
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [app-runtime-bundle-foundation]
---

# Fix: Exported Bundle Not Registered in Sidebar

## Description

When a user creates an app bundle via the `export_app_bundle` chat tool, the bundle is saved to `~/.ainative/apps/<app-id>/` on disk but never inserted into the `app_instances` database table. Since the sidebar only renders apps that have a DB record with `status: "ready"`, the exported app never appears — even though the bundle files exist on disk.

Built-in apps (Wealth, Growth) work correctly because they go through `installApp()` which inserts the DB record. Exported apps skip this step entirely.

## User Story

As a user who exports a project as an app bundle, I want the app to immediately appear in the sidebar so that I can access it without a workaround.

## Technical Approach

- In `src/lib/chat/tools/app-tools.ts`, after `saveSapDirectory()` succeeds (~line 351), call `installApp(appId, projectName, bundle)` using the `providedBundle` parameter (3rd arg) to bypass registry lookup
- The `providedBundle` path already exists in `src/lib/apps/service.ts:210` — no registry changes needed
- Link the bundle to the originating project via the `projectId` from the export context
- Wrap in try/catch so export still succeeds even if install fails (warn, don't block)

## Acceptance Criteria

- [ ] After `export_app_bundle` succeeds, an `app_instances` DB record exists with `status: "ready"`
- [ ] The exported app appears in the sidebar without a page refresh
- [ ] Built-in app installation is unaffected
- [ ] If `installApp()` fails, the export still reports success with a warning

## Scope Boundaries

**Included:**
- Registering exported bundles in the DB after save

**Excluded:**
- Discovering orphaned bundles from disk on startup (separate enhancement)
- Modifying the bundle registry's in-memory cache

## References

- Source: `internal history record`
- Related features: app-runtime-bundle-foundation, fix-sidebar-reactive-update
