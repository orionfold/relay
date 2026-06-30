---
title: Marketplace Install Hardening
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P1
milestone: post-mvp
source: code-review of commit 56e2839 (runtime bundle marketplace foundation)
dependencies: [instance-bootstrap]
---

# Marketplace Install Hardening

## Description

Commit `56e2839` ("Add runtime bundle marketplace foundation") introduced the
new `app_instances` table, `src/lib/apps/service.ts`, install/uninstall API
routes, a marketplace browser UI, and the installed-apps settings manager.
The scaffolding is architecturally sound and correctly syncs with
`clear.ts` and the DB bootstrap, but a code review surfaced three concrete
gaps that will bite once real users start installing bundles:

1. **Unguarded `JSON.parse` in `hydrateInstance`** (`src/lib/apps/service.ts:38-56`).
   The function calls `JSON.parse(row.manifestJson)` with no try-catch. A
   single corrupt row — from a crashed install, a manual SQL edit, or a
   migration bug — will throw uncaught and crash the `/api/apps/installed`
   route and every downstream page that lists installed apps.
2. **Check-then-insert race in `installApp`**. Two concurrent install
   requests for the same app can both pass the "already installed?" check
   and both insert rows. No UNIQUE constraint exists on `app_instances(app_id)`
   to catch it at the DB level.
3. **No end-to-end install test**. The service, API, migration, and UI are
   all implemented but no test proves that installing (for example) the
   wealth-manager bundle actually creates the project, sidebar entries,
   schedules, and tables the bundle describes. This is the "code islands"
   pattern that burned Sprint 6 document preprocessing (see MEMORY.md
   lesson).

Fixing all three before the marketplace ships live is cheap and uncovers
whether the wiring is actually end-to-end.

## User Story

As a maintainer, I want marketplace installs to be crash-safe, race-safe, and
end-to-end verified, so that the first time a real user clicks "Install" on
a bundle, it does exactly what the manifest promises or fails with a clear
error — never leaving a half-installed orphan behind.

## Technical Approach

### 1. Guard JSON.parse with a safe hydration helper

In `src/lib/apps/service.ts`, wrap the manifest parse in a try-catch:

```ts
function hydrateInstance(row: AppInstanceRow): AppInstance {
  let manifest: AppManifest;
  try {
    manifest = JSON.parse(row.manifestJson) as AppManifest;
  } catch (err) {
    // Log once per corrupt row; return a minimal failed-state manifest so
    // the UI can still render the row and offer uninstall.
    console.error(`[apps] corrupt manifest for app ${row.appId}:`, err);
    manifest = { id: row.appId, name: row.appId, status: "corrupt" } as AppManifest;
  }
  return { ...row, manifest };
}
```

Downstream consumers (marketplace browser, installed-apps manager) already
handle `failed`/`disabled` states; extending to `corrupt` is a 1-line UI
addition.

### 2. Add UNIQUE constraint on `app_instances(app_id)`

Either:

- **Preferred**: New migration `00XX_add_app_instances_unique.sql` adding
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_app_instances_app_id_unique ON
  app_instances(app_id);`, and matching update to `src/lib/db/bootstrap.ts`
  so the index is created idempotently on fresh DBs. Handle the migration's
  collision case (`INSERT OR IGNORE` sweep of existing dupes before index
  creation).
- **Alternative**: Wrap `installApp` in a SQLite `IMMEDIATE` transaction
  so the check-and-insert is serialized per DB writer. Simpler if the
  UNIQUE migration has collision risk, but doesn't defend against concurrent
  writers from other processes.

Go with the UNIQUE migration + bootstrap sync. `installApp` then treats the
INSERT-conflict path as "already installed, return existing instance" so
the caller sees the same semantics as before.

### 3. End-to-end install test

Create `src/lib/apps/__tests__/install-e2e.test.ts` that:

1. Seeds a known registry with a fixture bundle (e.g., a tiny "test-bundle"
   manifest declaring a project, one table, and one schedule)
2. Calls `installApp("test-bundle")`
3. Asserts:
   - `app_instances` row exists with `status="installed"`
   - `projects` row exists with the manifest-declared name and working dir
   - Declared tables exist in `table_definitions`
   - Declared schedules exist in `schedules`
   - Sidebar navigation includes the new project (check via the same helper
     `AppSidebar` uses)
4. Calls `uninstallApp("test-bundle")` and asserts all of the above are
   cleaned up (or explicitly left behind per the manifest's cleanup policy).

This test will immediately surface any "code island" — a declared bundle
field that the install path does not actually provision — and becomes a
regression gate for future bundle format changes.

## Acceptance Criteria

- [ ] `hydrateInstance` wraps `JSON.parse` in try-catch and logs without
      throwing on corrupt rows.
- [ ] UI renders corrupt rows with an explicit "manifest corrupt" state and
      an uninstall action.
- [ ] `app_instances(app_id)` has a UNIQUE index, created by both the new
      migration and `src/lib/db/bootstrap.ts`.
- [ ] Concurrent `installApp("same-app")` calls return the same instance
      row; exactly one INSERT wins, no duplicates persist.
- [ ] `src/lib/apps/__tests__/install-e2e.test.ts` exists and covers the
      full install→provision→uninstall roundtrip for a fixture bundle.
- [ ] `npm test` passes with all new tests; `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- JSON.parse guard in `hydrateInstance`
- UNIQUE index migration + bootstrap sync for `app_instances(app_id)`
- End-to-end install test using a fixture bundle
- Minimal UI affordance for `corrupt` manifest state

**Excluded:**
- Changing the bundle manifest schema
- Remote bundle registry / network installs (still local registry only)
- Rollback-on-partial-failure (separate concern — filed as follow-up if the
  e2e test surfaces partial-install scenarios)
- Marketplace browsing UX polish — this feature is correctness-focused

## References

- Source: code review of commit `56e2839`
- Related: `instance-bootstrap`, `worktree-production`
- Files to modify:
  - `src/lib/apps/service.ts` — guard JSON.parse, treat UNIQUE conflict as
    no-op
  - `src/lib/db/bootstrap.ts` — add unique index DDL
  - `src/components/apps/installed-apps-manager.tsx` — render `corrupt`
    state (1-line addition)
- Files to create:
  - `src/lib/db/migrations/00XX_add_app_instances_unique.sql`
  - `src/lib/apps/__tests__/install-e2e.test.ts`
  - Fixture bundle under `src/lib/apps/__tests__/fixtures/test-bundle/`
