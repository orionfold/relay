---
title: App Runtime Bundle Foundation
status: completed
priority: P0
milestone: post-mvp
source: internal history record
dependencies: [database-schema]
---

# App Runtime Bundle Foundation

## Description

This feature established the core runtime infrastructure for the ainative app
marketplace. Shipped in commit `56e2839`, it introduced the `app_instances`
database table, a builtin app registry with two reference apps (wealth-manager
and growth-module), a full install/bootstrap/enable/disable/uninstall lifecycle
managed by `service.ts`, comprehensive API routes, a marketplace browser UI, an
installed-apps settings manager, and dynamic sidebar rendering driven by
installed app manifests.

The implementation defines the `AppBundle` type as the single grammar that all
app authoring tiers (code, YAML, chat) target. A bundle contains a manifest,
setup checklist, agent profiles, workflow blueprints, table definitions,
schedule templates, and UI declarations spanning 7 widget types (hero, stats,
table, text, actions, linkedAssets, scheduleList).

The install lifecycle progresses through discrete states: `installing` (row
created, manifest persisted) -> `bootstrapping` (provisioning project, tables,
schedules, sidebar entries) -> `ready` (fully operational). Failure at any
stage transitions to `failed`. Running apps can be `disabled` without data
loss and later re-enabled. `uninstall` tears down provisioned resources.

Trust levels (`official`, `verified`, `community`, `private`) and source types
(`builtin`, `marketplace`, `file`) are declared in the type system, laying
groundwork for the marketplace trust ladder and distribution channels.

## User Story

As a ainative user, I want to browse a marketplace of pre-built apps, install
them with one click, and have them appear in my sidebar as fully functional
workspaces with tables, schedules, and agent profiles — so I can get
productive in a new domain without manual setup.

## Technical Approach

### 1. Database schema — `app_instances` table

Added to `src/lib/db/schema.ts` via migration. Columns: `id` (UUID primary
key), `appId` (string identifier), `name`, `description`, `status` (enum:
installing, bootstrapping, ready, failed, disabled), `trustLevel`, `sourceType`,
`manifestJson` (serialized `AppManifest`), `projectId` (FK to projects),
`sidebarConfig` (JSON), `installedAt`, `updatedAt`, `disabledAt`.

Bootstrap in `src/lib/db/index.ts` ensures the table exists on fresh databases
via `CREATE TABLE IF NOT EXISTS`.

### 2. Type system — `AppBundle` and related types

`src/lib/apps/types.ts` defines the core type hierarchy:

- `AppManifest` — id, name, version, description, author, category, trustLevel,
  sourceType, sidebar declaration, icon
- `AppBundle` — extends manifest with: `setupChecklist`, `profiles`
  (AgentProfile[]), `blueprints` (WorkflowBlueprint[]), `tables`
  (TableDefinition[]), `schedules` (ScheduleTemplate[]), `ui`
  (AppUIDeclaration)
- `AppUIDeclaration` — pages array, each containing widgets of 7 types
- `AppInstance` — runtime state combining DB row with hydrated manifest
- `AppInstallStatus` — union type for lifecycle states

### 3. Builtin app registry

`src/lib/apps/builtins.ts` defines two reference apps as code-defined
`AppBundle` objects:

- **wealth-manager** — Portfolio tracking with positions table, daily-review
  schedule, wealth-manager agent profile, dashboard with hero/stats/table
  widgets
- **growth-module** — Growth metrics tracking with experiments table, weekly
  review schedule, growth-analyst profile, dashboard with stats/table/actions
  widgets

These builtins serve as both functional apps and reference implementations for
the package format.

### 4. App service — install lifecycle

`src/lib/apps/service.ts` implements the full lifecycle:

- `installApp(appId)` — resolve bundle from registry, insert `app_instances`
  row with status `installing`, return instance
- `bootstrapApp(instanceId)` — transition to `bootstrapping`, provision
  project (with workingDirectory), create declared tables, register schedules,
  configure sidebar entries, transition to `ready` (or `failed` on error)
- `enableApp(instanceId)` / `disableApp(instanceId)` — toggle without data
  loss
- `uninstallApp(instanceId)` — remove provisioned resources, delete instance
  row
- `getInstalledApps()` — list all instances with hydrated manifests
- `getAppInstance(instanceId)` — single instance lookup

### 5. API routes

Eight API routes under `src/app/api/apps/`:

- `POST /api/apps/install` — trigger install
- `POST /api/apps/[id]/bootstrap` — trigger bootstrap
- `GET /api/apps/catalog` — list available apps from registry
- `GET /api/apps/instances` — list installed instances
- `GET /api/apps/sidebar` — sidebar entries for all ready apps
- `POST /api/apps/[id]/enable` — enable disabled app
- `POST /api/apps/[id]/disable` — disable running app
- `DELETE /api/apps/[id]/uninstall` — uninstall app

### 6. Marketplace browser UI

`src/app/marketplace/page.tsx` renders a card grid of available apps from
the catalog endpoint. Each card shows name, description, category, trust
badge, and install/open action buttons. Category filtering and search are
supported.

`src/components/apps/app-marketplace-browser.tsx` handles the browsing
experience with loading states, empty states, and error handling.

### 7. Installed apps settings manager

`src/components/apps/installed-apps-manager.tsx` in the settings area lists
all installed apps with their status, provides enable/disable toggles, and
uninstall actions. Status chips reflect the lifecycle state.

### 8. Dynamic sidebar rendering

`src/components/shared/app-sidebar.tsx` queries the `/api/apps/sidebar`
endpoint and renders app-declared navigation items dynamically. Each installed
app can declare sidebar items with icon, label, and route. Items appear in
the sidebar's "Apps" group and disappear when the app is disabled or
uninstalled.

### 9. App detail pages with widget rendering

`src/app/apps/[appId]/[[...slug]]/page.tsx` renders app pages using the
UI declarations from the bundle. Seven widget types are supported:

- **hero** — large banner with title, subtitle, background
- **stats** — metric cards with label, value, trend indicator
- **table** — data table connected to app-declared table definitions
- **text** — rich text content blocks
- **actions** — button groups for common operations
- **linkedAssets** — links to related documents, projects, or external URLs
- **scheduleList** — displays app schedules with status and next-run time

### 10. Validation

`src/lib/apps/validation.ts` provides Zod schemas for manifest validation,
ensuring bundles meet structural requirements before install. The registry
(`src/lib/apps/registry.ts`) manages the mapping from app IDs to bundle
resolvers.

## Acceptance Criteria

- [x] `app_instances` table exists in DB schema with all lifecycle columns.
- [x] `AppBundle` type defines manifest, profiles, blueprints, tables,
      schedules, and UI declarations.
- [x] Two builtin apps (wealth-manager, growth-module) are defined and
      installable.
- [x] Install lifecycle transitions correctly through installing ->
      bootstrapping -> ready states.
- [x] Bootstrap provisions project, tables, schedules, and sidebar entries
      from bundle declarations.
- [x] Enable/disable toggles app without data loss.
- [x] Uninstall removes provisioned resources and instance row.
- [x] Eight API routes handle all lifecycle operations.
- [x] Marketplace browser UI displays available apps with filtering.
- [x] Installed apps manager shows status and provides lifecycle actions.
- [x] Sidebar dynamically renders navigation items from installed apps.
- [x] App detail pages render all 7 widget types from bundle UI
      declarations.
- [x] Zod validation enforces manifest structure before install.

## Scope Boundaries

**Included:**
- `app_instances` table and DB bootstrap
- `AppBundle` type system with 7 widget types
- Two builtin reference apps
- Full install/bootstrap/enable/disable/uninstall lifecycle
- 8 API routes for lifecycle management
- Marketplace browser UI with category filtering
- Installed apps settings manager
- Dynamic sidebar rendering
- App detail pages with widget rendering
- Manifest validation via Zod schemas

**Excluded:**
- `.sap` package format (see `app-package-format`)
- JSON.parse crash safety and UNIQUE constraint (see `marketplace-install-hardening`)
- Namespace collision detection (see `app-conflict-resolution`)
- CLI tools for app management (see `app-cli-tools`)
- Remote marketplace distribution (local registry only)
- Extended primitives beyond the initial 7 widget types

## References

- Source: `internal history record` sections 3-6
- Shipped: commit `56e2839`
- Key files:
  - `src/lib/apps/types.ts` — AppBundle, AppManifest, AppInstance types
  - `src/lib/apps/builtins.ts` — wealth-manager, growth-module definitions
  - `src/lib/apps/service.ts` — install/bootstrap/enable/disable/uninstall
  - `src/lib/apps/registry.ts` — app ID to bundle resolver mapping
  - `src/lib/apps/validation.ts` — Zod manifest schemas
  - `src/lib/db/schema.ts` — appInstances table definition
  - `src/app/api/apps/` — 8 API route handlers
  - `src/app/marketplace/page.tsx` — marketplace browser page
  - `src/app/apps/[appId]/[[...slug]]/page.tsx` — app detail pages
  - `src/components/apps/` — marketplace browser, installed apps manager,
    action buttons
  - `src/components/shared/app-sidebar.tsx` — dynamic sidebar rendering
- Related features: `marketplace-install-hardening`, `app-package-format`,
  `marketplace-access-gate`
