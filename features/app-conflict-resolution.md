---
title: App Conflict Resolution
status: deferred
priority: P2
milestone: post-mvp
source: internal history record
dependencies: [app-package-format, marketplace-install-hardening]
---

# App Conflict Resolution

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

As the app marketplace grows beyond the two builtin apps, the platform needs
systematic conflict detection and resolution to prevent apps from stepping on
each other or corrupting user data. This feature adds pre-install validation
that catches namespace collisions (duplicate app IDs, overlapping URL routes,
clashing profile/blueprint/table IDs) before any database writes happen, and
enforces data safety invariants that protect users throughout the
install/update/uninstall lifecycle.

The core principle: **installs are safe by default.** An install never
silently overwrites existing tables, an uninstall never silently drops user
data, and an update only adds (new tables, new columns) — never removes.
When conflicts are detected, the user sees a clear explanation and explicit
choices rather than a silent failure or data loss.

## User Story

As a ainative user installing a new app, I want the platform to detect
conflicts with my existing apps before installation starts, so I never end
up with broken sidebar links, overwritten data, or mysterious errors from
namespace collisions.

## Technical Approach

### 1. Conflict types and detection

Five conflict categories, each with a dedicated detector:

#### App ID collision

Two apps with the same `id` field in their manifests. Already partially
guarded by the UNIQUE constraint from `marketplace-install-hardening`, but
the pre-install check provides a better UX than a raw DB constraint error.

```ts
async function checkAppIdCollision(manifest: AppManifest): Promise<Conflict | null> {
  const existing = await getAppInstance(manifest.id);
  if (existing) {
    return {
      type: "app-id",
      severity: "error",
      message: `App "${manifest.id}" is already installed (status: ${existing.status})`,
      resolution: existing.status === "disabled"
        ? "Enable the existing app or uninstall it first"
        : "Uninstall the existing app first",
    };
  }
  return null;
}
```

#### URL route overlap

Two apps declaring sidebar routes that overlap. For example, if app A uses
`/app/finance/` and app B tries to claim `/app/finance/dashboard`, the
nested route would create routing ambiguity.

```ts
async function checkRouteOverlap(manifest: AppManifest): Promise<Conflict[]> {
  const installedApps = await getInstalledApps();
  const conflicts: Conflict[] = [];

  for (const app of installedApps) {
    if (app.status === "disabled") continue;
    const appRoutes = extractRoutes(app.manifest);
    const newRoutes = extractRoutes(manifest);

    for (const newRoute of newRoutes) {
      for (const existingRoute of appRoutes) {
        if (routesOverlap(newRoute, existingRoute)) {
          conflicts.push({
            type: "route-overlap",
            severity: "error",
            message: `Route "${newRoute}" overlaps with "${existingRoute}" from app "${app.appId}"`,
            resolution: "Change the sidebar route in the new app's manifest",
          });
        }
      }
    }
  }
  return conflicts;
}
```

#### Profile ID collision

Two apps declaring profiles with the same namespaced ID. The namespace
prefix (`{app-id}--{profile}`) should prevent this between different apps,
but the check catches cases where namespace prefixing failed or two versions
of the same app are installed.

#### Blueprint ID collision

Same pattern as profile IDs — detect duplicate blueprint identifiers across
installed apps.

#### Table template ID collision

Two apps declaring tables with the same namespaced ID. This is the most
dangerous collision because it could lead to data corruption if both apps
write to the same table with different schemas.

### 2. Pre-install validation pipeline

New file `src/lib/apps/conflict-checker.ts` implements the full validation
pipeline that runs before `installApp()` touches the database:

```ts
interface ConflictReport {
  canProceed: boolean;
  conflicts: Conflict[];
  warnings: Warning[];
  impact: InstallImpact;
}

interface Conflict {
  type: "app-id" | "route-overlap" | "profile-id" | "blueprint-id" | "table-id";
  severity: "error" | "warning";
  message: string;
  resolution: string;
}

interface Warning {
  type: "platform-version" | "dependency-missing" | "large-seed-data";
  message: string;
}

interface InstallImpact {
  tablesCreated: number;
  schedulesCreated: number;
  profilesRegistered: number;
  estimatedDiskMb: number;
  projectCreated: boolean;
}

async function runPreInstallChecks(bundle: AppBundle): Promise<ConflictReport> {
  const conflicts: Conflict[] = [];
  const warnings: Warning[] = [];

  // 1. Namespace collision checks
  const appIdConflict = await checkAppIdCollision(bundle.manifest);
  if (appIdConflict) conflicts.push(appIdConflict);

  const routeConflicts = await checkRouteOverlap(bundle.manifest);
  conflicts.push(...routeConflicts);

  const profileConflicts = await checkProfileIdCollisions(bundle);
  conflicts.push(...profileConflicts);

  const blueprintConflicts = await checkBlueprintIdCollisions(bundle);
  conflicts.push(...blueprintConflicts);

  const tableConflicts = await checkTableIdCollisions(bundle);
  conflicts.push(...tableConflicts);

  // 2. Platform version compatibility
  if (!checkPlatformCompat(bundle.manifest)) {
    warnings.push({
      type: "platform-version",
      message: `App requires platform ${bundle.manifest.platform.minVersion}+, ` +
        `current is ${getPlatformVersion()}`,
    });
  }

  // 3. Dependency satisfaction
  for (const dep of bundle.manifest.dependencies?.apps ?? []) {
    const depApp = await getAppInstance(dep);
    if (!depApp || depApp.status !== "ready") {
      warnings.push({
        type: "dependency-missing",
        message: `Required app "${dep}" is not installed or not ready`,
      });
    }
  }

  // 4. Impact estimate
  const impact = estimateInstallImpact(bundle);

  return {
    canProceed: conflicts.filter(c => c.severity === "error").length === 0,
    conflicts,
    warnings,
    impact,
  };
}
```

### 3. Data safety invariants

Three invariants enforced throughout the app lifecycle:

#### Install never overwrites existing tables

Before creating a table during bootstrap, check if a table with the same
ID already exists. If it does, skip creation and log a warning rather than
dropping and recreating.

```ts
async function safeCreateTable(tableDef: TableDefinition): Promise<void> {
  const existing = await getTableDefinition(tableDef.id);
  if (existing) {
    console.warn(`[apps] table "${tableDef.id}" already exists, skipping creation`);
    return;
  }
  await createTableDefinition(tableDef);
}
```

#### Uninstall preserves user data

The default `uninstallApp()` behavior removes the app instance, sidebar
entries, schedules, and profiles — but leaves tables and their data intact.
The user must explicitly pass `--purge` (CLI) or confirm a "Delete all data"
dialog (UI) to drop tables.

After uninstall without purge, orphaned tables remain accessible through
the generic tables UI. A `previousAppId` marker on the table lets the UI
show "This table was created by [app name] (uninstalled)".

#### Update is additive only

When updating an installed app to a new version:
- New tables are created
- New columns are added to existing tables
- Existing columns are never removed or renamed
- Existing data is never modified
- Removed schedules are disabled, not deleted
- Removed profiles are deregistered but their config is preserved

### 4. Git safety

App source files (the `.sap` directory or extracted package files) are
stored under `~/.ainative/apps/{app-id}/` and are gitignored by default.
This prevents accidentally committing marketplace-downloaded apps to the
user's repo.

When a user modifies an installed app's files locally (editing a profile,
changing a schedule), the platform detects the modification on next boot
by comparing file checksums against the installed manifest's recorded
checksums.

```ts
interface ModificationCheck {
  modified: boolean;
  changedFiles: string[];
  message: string;
}

async function checkLocalModifications(appId: string): Promise<ModificationCheck> {
  const instance = await getAppInstance(appId);
  const appDir = getAppDir(appId);
  const checksums = instance.manifest.fileChecksums ?? {};

  const changedFiles: string[] = [];
  for (const [file, expectedHash] of Object.entries(checksums)) {
    const filePath = path.join(appDir, file);
    if (!existsSync(filePath)) {
      changedFiles.push(file);
      continue;
    }
    const actualHash = await hashFile(filePath);
    if (actualHash !== expectedHash) {
      changedFiles.push(file);
    }
  }

  return {
    modified: changedFiles.length > 0,
    changedFiles,
    message: changedFiles.length > 0
      ? `${changedFiles.length} file(s) modified locally. Update will overwrite these changes.`
      : "No local modifications detected.",
  };
}
```

Before an update overwrites files, the platform warns about local
modifications and offers to back up the modified files.

### 5. Integration with install flow

The conflict checker integrates into the install flow at two points:

**CLI** — `ainative app install` runs `runPreInstallChecks()` before calling
`installApp()`. If conflicts exist, display them and prompt for confirmation.
If errors exist, block unless `--force` is passed.

**API** — `POST /api/apps/install` includes a `dryRun` option that returns
the `ConflictReport` without proceeding. The UI shows the report in the
install confirmation dialog, letting users review conflicts and impact
before confirming.

```ts
// In the install API route
if (body.dryRun) {
  const report = await runPreInstallChecks(bundle);
  return NextResponse.json(report);
}

const report = await runPreInstallChecks(bundle);
if (!report.canProceed && !body.force) {
  return NextResponse.json(report, { status: 409 });
}
```

## Acceptance Criteria

- [ ] Pre-install check detects app ID collision with already-installed app.
- [ ] Pre-install check detects URL route overlap between new and existing
      apps.
- [ ] Pre-install check detects profile, blueprint, and table ID collisions.
- [ ] Platform version compatibility is checked against manifest's
      `minVersion`/`maxVersion`.
- [ ] Dependency satisfaction is verified (required apps are installed and
      ready).
- [ ] Install impact estimate includes table count, schedule count, and
      disk estimate.
- [ ] `installApp()` never overwrites existing tables — skips with warning.
- [ ] `uninstallApp()` preserves tables by default; only `--purge` drops
      them.
- [ ] App update only adds tables/columns, never removes existing ones.
- [ ] Local file modification detection works via checksum comparison.
- [ ] CLI shows conflict report before proceeding; blocks on errors.
- [ ] API `dryRun` mode returns `ConflictReport` without side effects.
- [ ] All conflict types include actionable resolution suggestions.

## Scope Boundaries

**Included:**
- Pre-install conflict detection (5 conflict types)
- Platform version compatibility check
- Dependency satisfaction check
- Install impact estimation
- Data safety invariants (no-overwrite, preserve-on-uninstall, additive-update)
- Local modification detection via checksums
- `dryRun` mode in install API
- CLI integration with conflict display and confirmation prompt

**Excluded:**
- Automatic conflict resolution (user must choose — this is detection only)
- Cross-app dependency resolution and install ordering (see
  `app-updates-dependencies`)
- Migration hooks for complex schema transforms during updates
- Rollback support for failed updates
- Conflict resolution UI in the web marketplace (CLI-first)

## References

- Source: `internal history record` section 8
- Related: `marketplace-install-hardening` (UNIQUE constraint is the DB-level
  fallback), `app-package-format` (defines namespace isolation rules),
  `app-updates-dependencies` (builds on conflict detection for update flow)
- Files to create:
  - `src/lib/apps/conflict-checker.ts` — pre-install validation pipeline
  - `src/lib/apps/__tests__/conflict-checker.test.ts` — tests for each
    conflict type
- Files to modify:
  - `src/lib/apps/service.ts` — integrate conflict checker into
    `installApp()` and `updateApp()`, enforce data safety invariants in
    `bootstrapApp()` and `uninstallApp()`
  - `src/app/api/apps/install/route.ts` — add `dryRun` support
  - `src/lib/apps/cli/install.ts` — display conflict report before install
