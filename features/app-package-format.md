---
title: ainative App Package Format
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P1
milestone: post-mvp
source: .archive/handoff/ainative-app-marketplace-spec.md
dependencies: [marketplace-install-hardening]
---

# ainative App Package Format

## Description

Define the `.sap` (ainative App Package) file format — the portable,
distributable representation of an `AppBundle`. Today, apps exist only as
TypeScript objects in `builtins.ts`. This feature introduces a YAML-based
directory structure that any developer or power user can author, validate,
and share without writing TypeScript.

The `.sap` directory layout mirrors the `AppBundle` type: a `manifest.yaml`
root file declares metadata and references to artifact files organized in
conventional subdirectories. Bidirectional conversion functions (`bundleToSap`
and `sapToBundle`) bridge the runtime `AppBundle` type and the on-disk
package format, ensuring the same grammar powers all three authoring tiers
(code, YAML, chat).

Namespace isolation rules prevent installed apps from colliding — every
artifact (URL routes, component directories, profile IDs, blueprint IDs,
table template IDs) is prefixed with `{app-id}--` or scoped under
`/app/{app-id}/`.

## User Story

As an app creator, I want to author a ainative app as a folder of YAML and
markdown files with a well-defined structure, so I can version-control it,
validate it locally, and distribute it to other ainative users without them
needing to understand TypeScript internals.

## Technical Approach

### 1. Directory structure

A `.sap` package is a directory (or tarball of a directory) with this layout:

```
my-app.sap/
  manifest.yaml          # Required: app metadata + declarations
  README.md              # Optional: user-facing description
  icon.png               # Optional: 256x256 app icon
  screenshots/           # Optional: marketplace listing images
    dashboard.png
    settings.png
  profiles/              # Agent profile SKILL.md files
    wealth-manager.md
    risk-analyst.md
  blueprints/            # Workflow blueprint YAML definitions
    onboarding.yaml
    daily-review.yaml
  templates/             # Table definition YAML files
    positions.yaml
    transactions.yaml
  schedules/             # Schedule template YAML files
    daily-review.yaml
    weekly-report.yaml
  triggers/              # Event trigger definitions (future)
    position-change.yaml
  src/                   # Optional: custom widget components (future)
  hooks/                 # Optional: lifecycle hooks (future)
    post-install.yaml
    pre-uninstall.yaml
  seed-data/             # Sanitized sample data CSVs
    positions.csv
    transactions.csv
```

### 2. Manifest YAML schema

The `manifest.yaml` file is the package's single source of truth. It declares
all metadata and references every artifact the package provides.

```yaml
id: wealth-manager
name: Wealth Manager
version: 1.0.0
description: Portfolio tracking and investment analysis
author:
  name: ainative Team
  email: apps@ainative.io
  url: https://ainative.io
license: MIT

platform:
  minVersion: "0.9.0"
  maxVersion: "2.0.0"

marketplace:
  category: finance
  tags: [portfolio, investing, wealth]
  difficulty: beginner
  pricing: free

sidebar:
  label: Wealth Manager
  icon: wallet
  route: /app/wealth-manager

provides:
  profiles:
    - wealth-manager
    - risk-analyst
  blueprints:
    - onboarding
    - daily-review
  tables:
    - positions
    - transactions
  schedules:
    - daily-review
    - weekly-report
  triggers: []
  pages:
    - dashboard
    - positions
    - analysis

dependencies:
  apps: []
  platform:
    - tables
    - schedules
    - profiles

ui:
  pages:
    - id: dashboard
      title: Dashboard
      route: /
      widgets:
        - type: hero
          config:
            title: "Wealth Manager"
            subtitle: "Track your portfolio"
        - type: stats
          config:
            metrics: [totalValue, dayChange, positions]
        - type: table
          config:
            tableId: positions
            columns: [symbol, shares, price, value, change]
```

### 3. Zod validation schema

Extend `src/lib/apps/validation.ts` with a comprehensive Zod schema for
`manifest.yaml` parsing and validation:

```ts
const manifestYamlSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(10).max(500),
  author: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  }),
  license: z.string().optional(),
  platform: z.object({
    minVersion: z.string(),
    maxVersion: z.string().optional(),
  }),
  marketplace: z.object({
    category: z.enum(["finance", "sales", "content", "dev", "automation", "general"]),
    tags: z.array(z.string()).max(10),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    pricing: z.enum(["free", "paid"]).default("free"),
  }),
  sidebar: z.object({
    label: z.string(),
    icon: z.string(),
    route: z.string().startsWith("/app/"),
  }),
  provides: z.object({
    profiles: z.array(z.string()).default([]),
    blueprints: z.array(z.string()).default([]),
    tables: z.array(z.string()).default([]),
    schedules: z.array(z.string()).default([]),
    triggers: z.array(z.string()).default([]),
    pages: z.array(z.string()).default([]),
  }),
  dependencies: z.object({
    apps: z.array(z.string()).default([]),
    platform: z.array(z.string()).default([]),
  }).optional(),
  ui: appUiSchema.optional(),
});
```

Validation runs at two points: `ainative app validate` (CLI) and `sapToBundle()`
(runtime). Errors include file path, line number (when possible), and
actionable fix suggestions.

### 4. Namespace isolation rules

Every artifact an app creates is prefixed to avoid collisions:

| Artifact | Namespace pattern | Example |
|---|---|---|
| URL routes | `/app/{app-id}/` | `/app/wealth-manager/dashboard` |
| Component dir | `/components/{app-id}/` | `/components/wealth-manager/` |
| Profile IDs | `{app-id}--{profile}` | `wealth-manager--risk-analyst` |
| Blueprint IDs | `{app-id}--{blueprint}` | `wealth-manager--daily-review` |
| Table template IDs | `{app-id}--{table}` | `wealth-manager--positions` |
| Schedule IDs | `{app-id}--{schedule}` | `wealth-manager--daily-review` |
| Sidebar routes | `/app/{app-id}/...` | `/app/wealth-manager/positions` |

The `sapToBundle()` converter automatically applies namespace prefixes.
The `bundleToSap()` converter strips them to produce clean, portable YAML.

### 5. Bidirectional conversion — `sap-converter.ts`

New file `src/lib/apps/sap-converter.ts` with two main functions:

**`sapToBundle(dir: string): Promise<AppBundle>`**
1. Read and parse `manifest.yaml` with Zod validation
2. For each entry in `provides.profiles`, read `profiles/{id}.md` and parse
   as AgentProfile (SKILL.md format)
3. For each entry in `provides.blueprints`, read `blueprints/{id}.yaml` and
   parse as WorkflowBlueprint
4. For each entry in `provides.tables`, read `templates/{id}.yaml` and parse
   as TableDefinition
5. For each entry in `provides.schedules`, read `schedules/{id}.yaml` and
   parse as ScheduleTemplate
6. Load `seed-data/*.csv` files as sample data
7. Assemble and return typed `AppBundle`

**`bundleToSap(bundle: AppBundle, outDir: string): Promise<void>`**
1. Generate `manifest.yaml` from bundle manifest (strip namespace prefixes)
2. Write each profile as `profiles/{name}.md`
3. Write each blueprint as `blueprints/{name}.yaml`
4. Write each table as `templates/{name}.yaml`
5. Write each schedule as `schedules/{name}.yaml`
6. Copy icon and screenshots if present

### 6. Platform version compatibility

The `platform.minVersion` and `platform.maxVersion` fields in manifest.yaml
declare the range of ainative versions the app supports. The install flow
reads the running platform version from `package.json` and rejects installs
that fall outside the declared range using semver comparison.

```ts
import { satisfies } from "semver";

function checkPlatformCompat(manifest: AppManifest): boolean {
  const platformVersion = getPlatformVersion();
  const range = `>=${manifest.platform.minVersion}` +
    (manifest.platform.maxVersion ? ` <=${manifest.platform.maxVersion}` : "");
  return satisfies(platformVersion, range);
}
```

## Acceptance Criteria

- [ ] `manifest.yaml` Zod schema validates all required and optional fields
      with clear error messages.
- [ ] `sapToBundle()` correctly parses a `.sap` directory into a typed
      `AppBundle` matching the same structure as code-defined builtins.
- [ ] `bundleToSap()` serializes an `AppBundle` to a `.sap` directory that
      round-trips: `sapToBundle(bundleToSap(bundle))` equals the original.
- [ ] Namespace prefixes are applied on `sapToBundle()` and stripped on
      `bundleToSap()` so packages are portable.
- [ ] Platform version compatibility check rejects manifests outside the
      declared range.
- [ ] The two builtin apps can be exported to `.sap` format via
      `bundleToSap()` and re-imported cleanly.
- [ ] File reference validation: every entry in `provides.*` has a
      corresponding file in the package directory.
- [ ] `npm test` passes with unit tests for both conversion directions and
      validation edge cases.

## Scope Boundaries

**Included:**
- `.sap` directory structure definition and conventions
- `manifest.yaml` Zod validation schema
- `sapToBundle()` and `bundleToSap()` conversion functions
- Namespace isolation rules and automatic prefix handling
- Platform version compatibility checking
- File reference validation (provides entries match actual files)

**Excluded:**
- Tarball creation / `.sap` archive format (see `app-cli-tools` pack command)
- Seed data generation and sanitization (see `app-seed-data-generation`)
- CLI commands for init, validate, pack (see `app-cli-tools`)
- Single-file `.md` format (see `app-single-file-format`)
- Remote distribution or marketplace publishing
- Extended primitives beyond the initial 7 (see `app-extended-primitives-tier1`)

## References

- Source: `.archive/handoff/ainative-app-marketplace-spec.md` section 3
- Related: `app-runtime-bundle-foundation` (defines the `AppBundle` type
  this format serializes)
- Files to modify:
  - `src/lib/apps/types.ts` — add YAML-specific type annotations
  - `src/lib/apps/validation.ts` — add manifest.yaml Zod schema
- Files to create:
  - `src/lib/apps/sap-converter.ts` — bidirectional conversion
  - `src/lib/apps/__tests__/sap-converter.test.ts` — round-trip tests
  - `src/lib/apps/__tests__/fixtures/wealth-manager.sap/` — reference
    package for testing
