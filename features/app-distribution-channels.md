---
title: App Distribution Channels
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P2
milestone: post-mvp
source: internal history record
dependencies: [app-cli-tools, marketplace-app-publishing]
---

# App Distribution Channels

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

ainative apps can be distributed through four channels, each serving a different
use case. The marketplace (cloud) is the primary discovery surface, but power
users and developers also need local file import, git repo cloning, and
official org distribution. This feature implements source-type detection,
channel-specific download logic, and unified checksum verification across
all four channels.

A single `ainative app install <source>` command (and the corresponding API)
handles all channels — the system detects the source type from the argument
and dispatches to the appropriate handler.

## User Story

As a developer, I want to install ainative apps from any source — the
marketplace, a local file, a GitHub repo, or the official ainative org — using
a single install command, so I can work with apps regardless of how they are
distributed.

## Technical Approach

### 1. Four Distribution Channels

| Channel | Source Pattern | Example |
|---------|--------------|---------|
| **Marketplace** | Bare app ID or `marketplace:{id}` | `ainative app install wealth-manager` |
| **Local file** | File path ending in `.sap` or `.md` | `ainative app install ./my-app.sap` |
| **Git repo** | HTTPS/SSH URL ending in `.git` or GitHub URL | `ainative app install https://github.com/user/ainative-wealth-manager` |
| **Official** | `@ainative/{name}` or auto-detected from ainative org | `ainative app install @ainative/wealth-manager` |

### 2. Source Type Detection

```ts
// src/lib/apps/channels/detect.ts — new
type SourceType = 'marketplace' | 'local-file' | 'git-repo' | 'official';

function detectSourceType(source: string): SourceType {
  // 1. Explicit prefix
  if (source.startsWith('marketplace:')) return 'marketplace';
  if (source.startsWith('@ainative/')) return 'official';

  // 2. File extension
  if (source.endsWith('.sap') || source.endsWith('.md')) return 'local-file';

  // 3. URL patterns
  if (source.startsWith('https://') || source.startsWith('git@') ||
      source.includes('github.com/')) return 'git-repo';

  // 4. Default: marketplace ID
  return 'marketplace';
}
```

### 3. Channel Handlers

Each channel has a handler that returns a normalized `AppBundle`:

**Marketplace handler:**
1. Query Supabase `app_packages` for the app ID
2. Download `.sap` from Supabase Storage (or GitHub Release URL if
   `storage_type = 'github'`)
3. Verify SHA-256 checksum against stored value
4. Extract bundle from `.sap` archive
5. Record `sourceType: 'marketplace'`, `sourceUrl: supabase-path`

**Local file handler:**
1. Read file from local filesystem
2. If `.sap`: extract tarball, validate manifest
3. If `.md`: parse MDX single-file format (see `app-single-file-format`)
4. Compute SHA-256 of source file
5. Record `sourceType: 'local-file'`, `sourceUrl: absolute-path`

**Git repo handler:**
1. Clone repo to temp directory (`~/.ainative/tmp/clone-{timestamp}`)
2. Look for `manifest.yaml` at repo root
3. If found: treat as `.sap` directory format
4. If not found: look for `app.md` at root
5. Validate manifest, compute SHA-256 of manifest file
6. Record `sourceType: 'git-repo'`, `sourceUrl: clone-url`
7. Clean up temp directory after extraction

**Official handler:**
1. Map `@ainative/{name}` to `https://github.com/ainative-ai/ainative-{name}`
2. Check GitHub releases for latest version
3. Download release asset (`.sap` tarball)
4. Verify SHA-256 from release notes or `.sha256` sidecar file
5. Record `sourceType: 'official'`, `sourceUrl: github-release-url`

**Key directory:** `src/lib/apps/channels/` — new directory with:
- `detect.ts` — source type detection
- `marketplace.ts` — marketplace channel handler
- `local-file.ts` — local file channel handler
- `git-repo.ts` — git repo channel handler
- `official.ts` — official channel handler
- `index.ts` — unified `resolveBundle(source)` that dispatches

### 4. Checksum Verification

All channels compute and verify SHA-256 checksums:

```ts
// src/lib/apps/channels/checksum.ts — new
import { createHash } from 'crypto';

function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function verifyChecksum(buffer: Buffer, expected: string): void {
  const actual = computeSha256(buffer);
  if (actual !== expected) {
    throw new AppInstallError(
      `Checksum mismatch: expected ${expected}, got ${actual}. ` +
      `The package may have been tampered with or corrupted during download.`
    );
  }
}
```

For marketplace and official channels, the expected checksum comes from the
registry. For local file and git repo channels, the checksum is computed and
stored in `app_instances` for future update comparison.

### 5. GitHub Release Asset Integration

For both the git-repo and official channels, support downloading from GitHub
Releases:

1. Use GitHub API: `GET /repos/{owner}/{repo}/releases/latest`
2. Find asset matching `*.sap` or `app.sap`
3. Download via `asset.browser_download_url`
4. If a `.sha256` file exists as a release asset, download and verify

No GitHub token required for public repos. For private repos, the user
provides a token via `GITHUB_TOKEN` env var or `ainative` settings.

### 6. Instance Tracking

Each installed app records its source in `app_instances`:

| Column | Purpose |
|--------|---------|
| `source_type` | marketplace / local-file / git-repo / official |
| `source_url` | URL or path for update checking |
| `source_checksum` | SHA-256 at install time |
| `installed_version` | Version string from manifest |

This data enables the `app-updates-dependencies` feature to check for
newer versions across all channels.

## Acceptance Criteria

- [ ] `detectSourceType()` correctly classifies all four channel patterns.
- [ ] `ainative app install ./my-app.sap` installs from local file.
- [ ] `ainative app install https://github.com/user/repo` clones and installs.
- [ ] `ainative app install @ainative/wealth-manager` installs from official org.
- [ ] `ainative app install wealth-manager` installs from marketplace.
- [ ] SHA-256 checksum verified on all channels; mismatch throws clear error.
- [ ] `app_instances` records `source_type` and `source_url` for all installs.
- [ ] Git clone temp directory cleaned up after extraction.
- [ ] GitHub release asset download works for public repos.
- [ ] Invalid source patterns produce a helpful error message.

## Scope Boundaries

**Included:**
- Source type detection from install argument
- Four channel handlers (marketplace, local-file, git-repo, official)
- SHA-256 checksum verification on all channels
- GitHub release asset download
- Source tracking in `app_instances`

**Excluded:**
- Automatic update checking (see `app-updates-dependencies`)
- Private GitHub repo authentication UX
- P2P distribution / IPFS
- `.md` single-file parsing (see `app-single-file-format`)
- CLI command implementation (see `app-cli-tools`)

## References

- Source: internal history record §4.4-4.5
- Related: `app-cli-tools` (CLI install command), `marketplace-app-publishing`
  (Supabase storage), `app-updates-dependencies` (uses source tracking)
- Files to create:
  - `src/lib/apps/channels/detect.ts`
  - `src/lib/apps/channels/marketplace.ts`
  - `src/lib/apps/channels/local-file.ts`
  - `src/lib/apps/channels/git-repo.ts`
  - `src/lib/apps/channels/official.ts`
  - `src/lib/apps/channels/checksum.ts`
  - `src/lib/apps/channels/index.ts`
- Files to modify:
  - `src/lib/apps/service.ts` — use `resolveBundle()` in `installApp()`
  - `src/lib/db/schema.ts` — add source columns to `appInstances`
