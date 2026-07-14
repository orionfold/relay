---
title: Marketplace App Publishing
status: completed
priority: P1
milestone: post-mvp
source: internal history record, brainstorm 2026-04-11
dependencies: [app-package-format, app-cli-tools, marketplace-access-gate]
---

# Marketplace App Publishing

## Description

Creators need a way to publish their apps to the ainative marketplace so other
users can discover and install them. This feature implements the full publish
flow: pack the app locally, review the package contents, fill in listing
metadata (title, description, category, pricing, screenshots), and submit
to the Supabase-backed marketplace registry.

The publish flow is available both from the UI (a publish sheet in the
marketplace) and from the CLI (`ainative app publish`). Both paths converge on
the same API route that uploads the `.sap` archive to Supabase Storage and
registers metadata in the `app_packages` table.

Publishing is gated to the Operator tier and above, consistent with the
existing blueprint publishing gate in `marketplace-access-gate`.

## User Story

As an app creator on the Operator tier, I want to publish my locally-built
app to the ainative marketplace with screenshots, pricing, and a description,
so other users can discover, evaluate, and install it — and I can optionally
earn revenue from paid apps.

## Technical Approach

### 1. Publish Sheet UI

A `DetailPane` (sliding sheet) triggered from the marketplace page or from
the installed-apps manager. The sheet contains a multi-section form:

**Basic Info:**
- Title (text, required, max 60 chars)
- Description (textarea, required, max 2000 chars, markdown supported)
- Category (select: Finance | Sales | Content | Dev | Automation)
- Tags (multi-select or free-text chips, max 5)

**Media:**
- Screenshots upload (drag-drop zone, max 6 images, max 2MB each)
- App icon upload (square, min 128x128, max 512x512)

**Pricing:**
- Radio: Free | Paid
- If paid: price input ($1.00 – $25.00 range, $0.50 increments)
- Revenue split note: "ainative takes 20% platform fee" (from marketplace-access-gate)

**README:**
- Markdown editor for the full app README
- Preview toggle (rendered markdown)

**Review section:**
- Auto-populated from manifest: table count, profile count, schedule count,
  blueprint count, page count
- Package size estimate
- Platform compatibility (min/max version from manifest)

**Submit button:** "Publish to Marketplace" (disabled until required fields filled)

**Key file:** `src/components/marketplace/publish-app-sheet.tsx` — new

### 2. API Route

`POST /api/marketplace/publish-app`

Request: `multipart/form-data` containing:
- `sap` — the `.sap` archive file (tarball)
- `metadata` — JSON blob with title, description, category, tags, pricing
- `screenshots[]` — up to 6 image files
- `icon` — app icon image file
- `readme` — markdown string

Processing steps:
1. **Auth check** — verify user is Operator+ tier
2. **Validate `.sap`** — extract and validate manifest using existing
   `validation.ts` schema
3. **Compute checksum** — SHA-256 hash of the `.sap` file for integrity
   verification on download
4. **Upload to Supabase Storage** — upload `.sap` to `ainative-marketplace`
   bucket under `apps/{app-id}/{version}/app.sap`
5. **Upload screenshots** — to `ainative-marketplace` bucket under
   `apps/{app-id}/screenshots/`
6. **Upload icon** — to `ainative-marketplace` bucket under
   `apps/{app-id}/icon.{ext}`
7. **Register metadata** — insert row into Supabase `app_packages` table:
   - `app_id`, `version`, `title`, `description`, `category`, `tags`
   - `pricing_type` (free/paid), `price_cents`
   - `checksum_sha256`
   - `storage_url` (Supabase Storage path)
   - `screenshot_urls` (JSON array)
   - `icon_url`
   - `readme`
   - `manifest_json` (serialized manifest for quick access)
   - `trust_level` (defaults to `community`)
   - `status` (defaults to `published`)
   - `creator_id`, `created_at`, `updated_at`
8. **Return** — 201 with the created package metadata

**Key file:** `src/app/api/marketplace/publish-app/route.ts` — new

### 3. Marketplace Client Extension

Extend `src/lib/marketplace/marketplace-client.ts` with:

```ts
async publishApp(params: PublishAppParams): Promise<AppPackage>
async uploadAppArchive(appId: string, version: string, file: File): Promise<string>
async uploadScreenshots(appId: string, files: File[]): Promise<string[]>
async updateAppListing(appId: string, updates: Partial<AppPackage>): Promise<AppPackage>
async unpublishApp(appId: string): Promise<void>
```

All methods use the existing Supabase client configuration from the
marketplace module.

### 4. Storage Configuration

Supabase Storage bucket: `ainative-marketplace`

Directory structure:
```
ainative-marketplace/
  apps/
    {app-id}/
      {version}/
        app.sap          # The archive
      screenshots/
        1.png, 2.png...  # Up to 6
      icon.png           # App icon
```

Public read access for screenshots and icons. Authenticated write access
for uploads. Archive downloads require authenticated requests with checksum
verification.

### 5. SHA-256 Integrity

Checksum computed on upload and stored in `app_packages.checksum_sha256`.
On download (during install), the marketplace client computes the SHA-256
of the received file and compares against the stored checksum. Mismatch
rejects the install with a clear error.

Uses Node.js built-in `crypto.createHash('sha256')`.

### 6. Alternative Storage: GitHub Releases

Creators can optionally provide a GitHub Release URL instead of uploading
to Supabase Storage. The `app_packages` row stores:
- `storage_type`: `supabase` (default) or `github`
- `storage_url`: Supabase path or GitHub release asset URL

The install flow detects the storage type and fetches accordingly. GitHub
release downloads still verify the SHA-256 checksum.

### 7. CLI Integration

`ainative app publish` — reads the current directory as a `.sap` package,
validates, prompts for metadata (or reads from `manifest.yaml` fields),
and calls the same API route.

This is implemented in the `app-cli-tools` feature; the API route created
here is the shared backend.

## Acceptance Criteria

- [ ] Publish sheet opens from marketplace page with all required fields.
- [ ] Form validates: title required, description required, category required,
      price in valid range if paid.
- [ ] Screenshots upload with drag-drop, preview thumbnails, max 6 files.
- [ ] `POST /api/marketplace/publish-app` uploads `.sap` to Supabase Storage,
      registers metadata in `app_packages`.
- [ ] SHA-256 checksum computed and stored; verified on download.
- [ ] Non-Operator users see a gate dialog instead of the publish form.
- [ ] Published app appears in marketplace listing within 5 minutes (cache TTL).
- [ ] Creator can update listing metadata after publish (title, description,
      screenshots).
- [ ] GitHub Release URL accepted as alternative storage source.
- [ ] `npx tsc --noEmit` clean; no regressions in existing tests.

## Scope Boundaries

**Included:**
- Publish sheet UI with metadata form
- API route for publishing (upload + register)
- Supabase Storage integration for archives and media
- SHA-256 checksum on upload/download
- GitHub Release URL alternative
- Marketplace client extension

**Excluded:**
- Version management / update flow (see `app-updates-dependencies`)
- Trust level promotion (see `marketplace-trust-ladder`)
- Revenue collection / Stripe integration (see `marketplace-access-gate`)
- CLI publish command implementation (see `app-cli-tools`)
- Review/rating system (see `marketplace-reviews`)

## References

- Source: internal history record §4.5, §10.1
- Related: `marketplace-access-gate` (tier gating), `app-package-format`
  (.sap structure), `app-cli-tools` (CLI publish command)
- Files to modify:
  - `src/lib/marketplace/marketplace-client.ts` — add publish methods
- Files to create:
  - `src/app/api/marketplace/publish-app/route.ts`
  - `src/components/marketplace/publish-app-sheet.tsx`
