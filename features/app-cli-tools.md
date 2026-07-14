---
title: App CLI Tools
status: completed
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [app-package-format, app-seed-data-generation]
---

# App CLI Tools

## Description

Extend the ainative CLI with an `app` subcommand group that covers the full
app lifecycle for both creators and users. Creator commands help build,
validate, and publish apps. User commands help discover, install, manage,
and update apps. All commands operate on the `.sap` package format and
reuse the existing `service.ts` install lifecycle internally.

The CLI is the primary distribution interface — while the web UI provides
marketplace browsing, the CLI handles all operations that involve the local
filesystem (packing, validating, file-based installs) and is the canonical
tool for CI/CD pipelines and automation.

## User Story

As an app creator, I want CLI commands to scaffold, validate, generate seed
data, pack, and publish my app — so I can iterate quickly and distribute
without leaving my terminal.

As a ainative user, I want CLI commands to install apps from local files or
the marketplace, check for updates, and manage installed apps — so I have
full control over my app environment from the command line.

## Technical Approach

### 1. Command structure

All commands live under `ainative app <subcommand>`:

```
ainative app init [--template <name>]     # Scaffold new app
ainative app validate [<dir>]             # Validate manifest + files
ainative app seed [<dir>]                 # Generate sanitized seed data
ainative app pack [<dir>]                 # Create .sap tarball
ainative app publish [<file>]             # Upload to marketplace
ainative app extract-templates [<dir>]    # Table definitions → YAML
ainative app extract-profiles [<dir>]     # Code profiles → YAML

ainative app install <source>             # Install from file/URL/marketplace/git
ainative app list                         # List installed apps
ainative app browse [--category <cat>]    # Browse marketplace catalog
ainative app update [<app-id>]            # Update to latest version
ainative app outdated                     # Check for available updates
ainative app disable <app-id>             # Disable installed app
ainative app enable <app-id>              # Enable disabled app
ainative app uninstall <app-id> [--purge] # Remove app (--purge removes data)
```

### 2. Creator commands

#### `ainative app init`

Scaffolds a new `.sap` directory with starter files:

```
my-app.sap/
  manifest.yaml      # Pre-filled template with placeholders
  README.md           # Starter documentation
  profiles/           # Empty directory with .gitkeep
  blueprints/         # Empty directory with .gitkeep
  templates/          # Empty directory with .gitkeep
  schedules/          # Empty directory with .gitkeep
  seed-data/          # Empty directory with .gitkeep
```

The `--template` flag supports starter templates: `blank` (default),
`finance`, `content`, `automation`. Each template pre-populates appropriate
manifest fields, sample table definitions, and a starter profile.

Interactive prompts gather: app name, ID (auto-slugified from name),
description, category, author info. Non-interactive mode via `--yes` flag
uses defaults.

#### `ainative app validate`

Runs comprehensive validation on a `.sap` directory:

1. Parse `manifest.yaml` against Zod schema — report all validation errors
2. File reference check — every entry in `provides.*` has a matching file
3. Profile validation — each `.md` file in `profiles/` is valid SKILL.md
4. Table template validation — each `.yaml` in `templates/` has valid column
   definitions
5. Schedule validation — each `.yaml` in `schedules/` has valid cron/interval
6. Seed data check — CSV files match declared table schemas (column names,
   types)
7. Icon check — `icon.png` exists and is <=256x256

Exit code 0 on success, 1 on errors. Warnings (missing optional files) don't
fail validation.

#### `ainative app pack`

Creates a distributable `.sap` tarball from a validated directory:

1. Run `validate` first (fail if errors)
2. Security scan:
   - Reject if `.env`, `.env.*`, `*.db`, `.git/`, `node_modules/` present
   - Scan for API key patterns (`sk-`, `ANTHROPIC_API_KEY=`, etc.)
   - Reject if any secrets detected
3. Calculate SHA-256 checksum of each file
4. Create gzipped tarball: `{app-id}-{version}.sap.tar.gz`
5. Write checksum file: `{app-id}-{version}.sap.sha256`
6. Print size, file count, and checksum

#### `ainative app publish`

Uploads a packed `.sap` tarball to the marketplace:

1. Verify the file is a valid `.sap` tarball
2. Authenticate with marketplace (OAuth token)
3. Upload to Supabase Storage bucket
4. Register metadata in `app_packages` table
5. Print marketplace URL

Requires Operator tier or above.

#### `ainative app extract-templates`

Reads the live database tables for a project and generates YAML table
definition files in `templates/`. Useful for creators who built tables
through the UI and want to package them.

#### `ainative app extract-profiles`

Reads agent profiles from `src/lib/agents/profiles/` and converts them to
standalone SKILL.md files in `profiles/`. Extracts the profile's system
prompt, tools, and behavioral guidelines into portable markdown.

### 3. User commands

#### `ainative app install <source>`

Detects source type and delegates:

| Source pattern | Type | Handler |
|---|---|---|
| `./path/to/dir` or `./path.sap.tar.gz` | Local file | Extract + `sapToBundle()` + `installApp()` |
| `https://...` URL | Remote file | Download + extract + install |
| `github:owner/repo` | Git repo | Clone sparse + install |
| `marketplace:app-id` or bare `app-id` | Marketplace | Fetch from Supabase + install |
| `./my-app.md` | Single file | `mdToBundle()` + install |

All paths converge on `installApp()` from `service.ts` after converting to
an `AppBundle`.

#### `ainative app list`

Displays a table of installed apps:

```
ID                Status    Version  Installed
wealth-manager    ready     1.0.0    2026-04-10
growth-module     disabled  1.0.0    2026-04-08
```

#### `ainative app browse`

Queries the marketplace catalog and displays available apps:

```
ainative app browse --category finance

ID                Category   Rating  Installs  Price
wealth-manager    finance    4.8     1,234     Free
crypto-tracker    finance    4.5     892       Free
```

#### `ainative app update`

Checks for newer versions and applies updates:

1. Fetch latest manifest from source
2. Compare versions (semver)
3. Download new package
4. Run conflict check (see `app-conflict-resolution`)
5. Apply update (additive — new tables/columns, updated profiles/schedules)
6. Preserve user data in existing tables

#### `ainative app outdated`

Lists installed apps with available updates:

```
ID                Current  Latest   Source
wealth-manager    1.0.0    1.1.0    marketplace
```

#### `ainative app uninstall`

Removes an installed app. Without `--purge`, preserves user data in tables.
With `--purge`, drops app-created tables and their data.

1. Disable app first (if running)
2. Remove sidebar entries
3. Remove schedules
4. Remove profiles
5. If `--purge`: drop tables and delete project
6. Delete `app_instances` row

### 4. Security checks in `pack`

The packing step includes a security scanner to prevent accidental secret
leakage:

```ts
const FORBIDDEN_PATHS = [
  ".env", ".env.*",
  "*.db", "*.sqlite",
  ".git/", ".git",
  "node_modules/",
  ".DS_Store",
  "*.log",
];

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,           // Anthropic API keys
  /ANTHROPIC_API_KEY\s*=/,
  /OPENAI_API_KEY\s*=/,
  /ghp_[a-zA-Z0-9]{36}/,           // GitHub PATs
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
  /password\s*[:=]\s*["'][^"']+["']/i,
];
```

### 5. Implementation — CLI architecture

Extend `bin/cli.ts` with the `app` subcommand group. Command handlers live
in `src/lib/apps/cli/` with one file per command:

```
src/lib/apps/cli/
  index.ts        # registerAppCommands() — wires all subcommands
  init.ts         # ainative app init
  validate.ts     # ainative app validate
  seed.ts         # ainative app seed (delegates to seed-generator.ts)
  pack.ts         # ainative app pack
  publish.ts      # ainative app publish
  install.ts      # ainative app install (multi-source)
  list.ts         # ainative app list
  browse.ts       # ainative app browse
  update.ts       # ainative app update
  outdated.ts     # ainative app outdated
  manage.ts       # ainative app enable/disable/uninstall
  extract.ts      # ainative app extract-templates/extract-profiles
```

Each command handler exports a function matching the CLI framework's
command signature. The existing CLI uses a minimal command parser — extend
it with the `app` group following the same pattern.

## Acceptance Criteria

- [ ] `ainative app init` scaffolds a valid `.sap` directory that passes
      `ainative app validate`.
- [ ] `ainative app validate` catches all manifest errors, missing file
      references, and invalid YAML with actionable messages.
- [ ] `ainative app pack` creates a tarball and rejects packages containing
      secrets or forbidden paths.
- [ ] `ainative app install <path>` installs a local `.sap` directory or
      tarball via the standard `installApp()` lifecycle.
- [ ] `ainative app install <app-id>` installs from the marketplace catalog.
- [ ] `ainative app list` displays all installed apps with status and version.
- [ ] `ainative app uninstall` removes app resources; `--purge` additionally
      drops tables.
- [ ] `ainative app enable` and `ainative app disable` toggle app state
      correctly.
- [ ] `ainative app outdated` correctly identifies apps with newer versions
      available.
- [ ] All commands handle errors gracefully with non-zero exit codes and
      helpful messages.
- [ ] Security scanner in `pack` detects at least: `.env` files, API key
      patterns, private keys, `.git` directories.

## Scope Boundaries

**Included:**
- Full `app` subcommand group in CLI (creator + user commands)
- Security scanning in `pack` command
- Multi-source install detection (file, URL, marketplace, git, markdown)
- Interactive prompts for `init` with `--yes` non-interactive mode
- Table output formatting for `list`, `browse`, `outdated`

**Excluded:**
- Marketplace authentication flow (requires `marketplace-app-publishing`)
- Remote `publish` implementation (requires Supabase backend)
- Dependency resolution across apps (see `app-updates-dependencies`)
- Git repo cloning support (initial release supports local + marketplace)
- Automatic update checking on CLI startup

## References

- Source: `internal history record` section 10
- Related: `app-package-format` (defines what commands operate on),
  `app-seed-data-generation` (seed command delegates to), `bin/cli.ts`
  (existing CLI entry point)
- Files to create:
  - `src/lib/apps/cli/index.ts` — command group registration
  - `src/lib/apps/cli/init.ts`
  - `src/lib/apps/cli/validate.ts`
  - `src/lib/apps/cli/seed.ts`
  - `src/lib/apps/cli/pack.ts`
  - `src/lib/apps/cli/publish.ts`
  - `src/lib/apps/cli/install.ts`
  - `src/lib/apps/cli/list.ts`
  - `src/lib/apps/cli/browse.ts`
  - `src/lib/apps/cli/update.ts`
  - `src/lib/apps/cli/outdated.ts`
  - `src/lib/apps/cli/manage.ts`
  - `src/lib/apps/cli/extract.ts`
- Files to modify:
  - `bin/cli.ts` — add `app` subcommand group
