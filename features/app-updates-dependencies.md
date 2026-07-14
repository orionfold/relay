---
title: App Updates & Dependencies
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P2
milestone: post-mvp
source: internal history record
dependencies: [app-conflict-resolution, app-cli-tools]
---

# App Updates & Dependencies

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

Installed apps need a safe update path. This feature implements the full update
lifecycle: checking for outdated versions, downloading new releases, applying
additive-only schema migrations, running post-update hooks, and providing
rollback if something goes wrong. It also adds dependency resolution so apps
can declare requirements on other apps.

The core safety invariant is **additive-only migration**: updates can add new
tables and columns but never drop or rename existing ones. This guarantees that
user data survives any update, and rollback is always possible by restoring the
previous bundle without data loss.

## User Story

As a ainative user, I want to update my installed apps to get new features and
fixes without losing my data, and I want clear visibility into what changed
and the ability to roll back if an update breaks something.

As an app creator, I want to declare dependencies on other apps so users are
prompted to install prerequisites, and I want post-update hooks to run data
migrations safely.

## Technical Approach

### 1. Update Flow

`ainative app update <app-id>` (CLI) or "Update" button (UI):

```
1. Check registry for newer version
2. Download new .sap from source channel
3. Verify SHA-256 checksum
4. Back up current bundle → ~/.ainative/apps/{app-id}/backup/{version}/
5. Detect local modifications (see §5)
6. Apply additive schema migrations
7. Update manifest in app_instances
8. Run post-update hooks
9. Report what changed
```

### 2. Outdated Check

`ainative app outdated` — checks all installed apps against their source:

| App | Installed | Latest | Source |
|-----|-----------|--------|--------|
| wealth-manager | 1.2.0 | 1.3.0 | marketplace |
| crypto-tracker | 2.0.1 | 2.0.1 | (up to date) |
| content-planner | 1.0.0 | 1.1.0 | github |

Implementation:
- For marketplace apps: query Supabase `app_packages` for latest version
- For git-repo apps: check latest GitHub release or HEAD of default branch
- For local-file apps: skip (no remote to check)
- For official apps: check `@ainative/{name}` latest release

Compare semver strings. Report only apps with available updates.

**API route:** `GET /api/apps/outdated` — returns array of apps with
`installedVersion`, `latestVersion`, `sourceType`, `sourceUrl`.

### 3. Additive-Only Schema Migration

The update process compares the old and new manifests' table definitions:

```ts
function computeSchemaDiff(
  oldTables: AppTableDef[],
  newTables: AppTableDef[]
): SchemaDiff {
  const diff: SchemaDiff = { addedTables: [], addedColumns: [], violations: [] };

  for (const newTable of newTables) {
    const oldTable = oldTables.find(t => t.name === newTable.name);
    if (!oldTable) {
      diff.addedTables.push(newTable);
      continue;
    }
    for (const col of newTable.columns) {
      if (!oldTable.columns.find(c => c.name === col.name)) {
        diff.addedColumns.push({ table: newTable.name, column: col });
      }
    }
  }

  // Check for violations: dropped tables or columns
  for (const oldTable of oldTables) {
    if (!newTables.find(t => t.name === oldTable.name)) {
      diff.violations.push(`Table "${oldTable.name}" would be dropped`);
    }
    const newTable = newTables.find(t => t.name === oldTable.name);
    if (newTable) {
      for (const col of oldTable.columns) {
        if (!newTable.columns.find(c => c.name === col.name)) {
          diff.violations.push(
            `Column "${oldTable.name}.${col.name}" would be dropped`
          );
        }
      }
    }
  }

  return diff;
}
```

If violations are found, the update is **rejected** with a clear error listing
each violation. The creator must fix their manifest to be backward-compatible.

For valid diffs:
- `CREATE TABLE IF NOT EXISTS` for new tables
- `ALTER TABLE ... ADD COLUMN` for new columns (SQLite supports this)

### 4. Dependency Resolution

Apps declare dependencies in their manifest:

```yaml
dependencies:
  - appId: core-tables
    minVersion: "1.0.0"
  - appId: notification-templates
    minVersion: "2.1.0"
    optional: true
```

On install or update, the dependency resolver:

1. Check if each required dependency is installed
2. If not installed, prompt the user: "This app requires {dep}. Install it now?"
3. If installed but below `minVersion`, prompt: "This app requires {dep} v{min}+.
   You have v{current}. Update now?"
4. Optional dependencies: inform but don't block if missing
5. Circular dependency detection: reject manifests with cycles

```ts
// src/lib/apps/dependencies.ts — new
async function resolveDependencies(
  manifest: AppManifest
): Promise<DependencyResult> {
  const missing: DependencyInfo[] = [];
  const outdated: DependencyInfo[] = [];
  const satisfied: DependencyInfo[] = [];

  for (const dep of manifest.dependencies ?? []) {
    const installed = await getAppInstance(dep.appId);
    if (!installed) {
      if (dep.optional) continue;
      missing.push(dep);
    } else if (dep.minVersion && semverLt(installed.version, dep.minVersion)) {
      outdated.push({ ...dep, currentVersion: installed.version });
    } else {
      satisfied.push(dep);
    }
  }

  return { missing, outdated, satisfied };
}
```

### 5. Local Modification Detection

Before overwriting app files during an update, check if the user has modified
the installed version:

1. Compare current manifest JSON against the backup manifest from install time
2. If they differ, the user has customized the app
3. Present options:
   - **Merge** — apply update to a copy, let user review diff (future)
   - **Overwrite** — discard local changes, apply update
   - **Cancel** — keep current version

V1: simple detection + overwrite-or-cancel choice. Merge is a future
enhancement.

### 6. Post-Update Hooks

Apps can declare a post-update hook in their manifest:

```yaml
hooks:
  postUpdate: hooks/post-update.ts
```

The hook receives context about the update:

```ts
interface PostUpdateContext {
  previousVersion: string;
  newVersion: string;
  addedTables: string[];
  addedColumns: { table: string; column: string }[];
}
```

Hook execution:
- Runs in a sandboxed context (no filesystem access outside app directory)
- Has 30-second timeout
- Failures are logged but don't roll back the update (warning to user)
- Audit log entry created for every hook execution

### 7. Rollback

`ainative app rollback <app-id>`:

1. Check that a backup exists at `~/.ainative/apps/{app-id}/backup/{version}/`
2. Restore the previous manifest to `app_instances`
3. **Do not drop tables or columns** (additive-only invariant applies to
   rollback too — new tables/columns remain, they're just unused)
4. Re-bootstrap with the old manifest
5. Delete the failed update's backup

The rollback preserves all data. Schema additions from the failed update
remain in the database as orphaned tables/columns — they don't cause harm
and may be picked up by a future successful update.

### 8. UI Integration

**Installed apps manager:**
- "Update Available" badge on apps with newer versions
- "Update" button triggers the update flow
- "Rollback" button appears after a recent update (within 7 days)

**Notification:**
- When `ainative app outdated` detects updates, create a notification:
  "2 app updates available: Wealth Manager 1.3.0, Content Planner 1.1.0"

## Acceptance Criteria

- [ ] `ainative app update <app-id>` downloads and applies a newer version.
- [ ] `ainative app outdated` lists all apps with available updates.
- [ ] Schema migration is additive-only: new tables and columns only.
- [ ] Dropped tables/columns in a new version cause the update to be rejected.
- [ ] Backup created before every update at predictable path.
- [ ] `ainative app rollback <app-id>` restores previous manifest without
      dropping data.
- [ ] Dependencies declared in manifest are checked before install/update.
- [ ] Missing required dependencies prompt user to install them.
- [ ] Post-update hooks run with correct context and 30s timeout.
- [ ] Local modification detection warns before overwriting customized apps.
- [ ] "Update Available" badge shown in installed apps manager.
- [ ] Circular dependency detection rejects invalid manifests.

## Scope Boundaries

**Included:**
- Update flow (download, migrate, hook, report)
- Outdated version checking across all channels
- Additive-only schema migration with violation detection
- Dependency resolution with install prompts
- Post-update hooks with sandboxed execution
- Rollback to previous version
- Local modification detection (detect + warn)
- Backup management

**Excluded:**
- Automatic updates (always user-initiated)
- Three-way merge for local modifications (V1 is overwrite or cancel)
- Dependency auto-installation without prompt
- Breaking schema migrations (intentionally forbidden)
- Hook marketplace (hooks are per-app only)

## References

- Source: internal history record §11 Phase 3
- Related: `app-conflict-resolution` (namespace + version compat checks),
  `app-cli-tools` (CLI commands), `app-distribution-channels` (source
  channel resolution for update checks)
- Files to create:
  - `src/lib/apps/updater.ts` — update flow orchestration
  - `src/lib/apps/dependencies.ts` — dependency resolution
  - `src/lib/apps/schema-diff.ts` — additive migration logic
  - `src/lib/apps/hooks.ts` — post-update hook runner
  - `src/app/api/apps/outdated/route.ts`
- Files to modify:
  - `src/lib/apps/service.ts` — add `updateApp()`, `rollbackApp()`
  - `src/lib/apps/types.ts` — add dependency and hook types to manifest
  - `src/components/apps/installed-apps-manager.tsx` — update badge + buttons
