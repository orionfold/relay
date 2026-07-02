---
title: Graduation surface — /packs gallery, Settings → License, name-based install (PLG-2a)
status: completed
priority: P1
milestone: mvp
source: _SPECS/plg-refine.md §5 PLG-2 (D6/D7) + features/fix-pack-install-discoverability.md (absorbed)
dependencies: [feat-license-lifecycle, fix-pack-core-version-resolution]
---

# Graduation surface (PLG-2a): `/packs` gallery, Settings → License, name-based install

## Description

PLG-1 shipped the license lifecycle (store, verb, banner, ceremony) but the entire
premium surface is CLI-only and pack install requires a filesystem path buried in
`node_modules`. A UI-first user can never discover packs, never sees a premium pack
exists (the worst-converting configuration in the PLG literature — soft-gate
discovery converts 3–5x over hidden premium, D6), and has no way to see or activate
a license without a terminal.

This feature builds the graduation surface: a `/packs` gallery listing bundled +
premium packs (premium visible-but-locked with what-you-get preview, price, and a
Get-license CTA), a Settings → License section reading the same D7 store as the CLI
(licensed-to, entitlements, seats, renewal, paste/upload activation), and name-based
install (`relay pack add relay-agency`) shared by CLI and a new install API.

**Grooming decisions (2026-07-01, final):**
- Ships as **0.18.0** (new routes + API + manifest schema fields = minor; PLG-1 precedent).
- Settings → License is a **section component** on the existing single settings page
  (`src/app/settings/page.tsx` renders `*Section` components in JSX order) — not a sub-route.
- The install API accepts **bundled template ids only** — never paths or git URLs from
  the browser (a `--hostname 0.0.0.0` instance must not clone attacker-supplied repos).
- No premium pack exists yet (authored in S4/PLG-2b). This feature ships the *capability*:
  schema fields + locked-card rendering, exercised by a test fixture, rendered live from S4.

## User Story

As a solo founder who lives in the UI, I want to browse packs, install free ones in one
click, see exactly what a premium pack would give me and what it costs, and activate my
license by pasting it — so that I graduate from community to licensed without ever
touching a terminal or a filesystem path.

## Technical Approach

### 1. Bundled-pack catalog (new `src/lib/packs/catalog.ts`)
- `listPackTemplates()`: enumerate `src/lib/packs/templates/*` (resolve via the
  bundle-aware `getAppRoot` — `src/` ships in the npm tarball, so templates exist at
  runtime), `parsePack()` each, return `{ meta, primitivesSummary, dir }` per pack.
  Reuse `buildPrimitivesSummary` from `@/lib/apps/registry` (pack.manifest IS an
  AppManifest). A corrupt template is LISTED with its reason, never silently skipped
  (Principle #1).
- Installed status is the caller's job: join against `listApps()` by pack id.

### 2. Manifest schema additions (`src/lib/packs/format.ts`)
- `PackManifestSchema` is `.strict()` — add two optional fields:
  `price` (display string, e.g. `"$499/year"`) and `purchaseUrl` (https URL for the
  Get-license CTA). Rendered only on entitlement-gated packs; S4's premium pack
  declares them. Website still owns actual pricing; these are offline display copy.

### 3. Name-based install (`src/lib/packs/install.ts`)
- In `acquirePack`: a bare-name source (matches `/^[a-z0-9][a-z0-9-]*$/` AND is not an
  existing local path) resolves to the bundled template dir. **Precedence: an existing
  local path always wins** (explicit path beats registry). Unknown bare name → error
  naming the available bundled ids.
- Update the `pack add` USAGE line in `src/lib/packs/cli.ts` to `<name|path|git-url>`.

### 4. `/packs` gallery route (new `src/app/packs/page.tsx`)
- Server Component, `dynamic = "force-dynamic"`, direct `listPackTemplates()` +
  `listApps()` reads — mirror `src/app/apps/page.tsx` (grid of `Card`s, absolute-Link
  overlay, `EmptyHero` pattern).
- Card states: **installed** (badge, link to `/apps/<id>`); **free available**
  (Install button — small client component POSTing to the install API, disabled
  double-click, error surfaced inline per Principle #4); **premium locked** (lock
  glyph, what-you-get preview from description + primitives summary, `price`,
  Get-license CTA → `purchaseUrl`, plus "already licensed? it installs directly" —
  the API consults the store, D2).
- Nudge: add a "Browse packs" link to the Apps gallery empty-state hero
  (`src/app/apps/page.tsx` EmptyHero) — the J2/J3 "fresh install ships only general
  built-ins" friction from the absorbed spec.
- Nav: register `{ title: "Packs", href: "/packs", icon: Package, alsoMatches: ["/packs/"] }`
  in the `compose` group (`src/components/shell/nav-items.ts:57-62`). Compose is at the
  4-child width cap noted at `nav-items.ts:19-23` — **flag placement to
  `/frontend-designer`** (recommendation: accept 5; alternative: swap Profiles → Data).
  Update `src/components/shell/__tests__/nav-items.test.ts`.

### 5. Pack-install API (new `src/app/api/packs/install/route.ts`)
- `POST { id }` — Zod `safeParse`, `{ error, code }` shape per
  `src/app/api/plugins/scaffold/route.ts` conventions.
- Resolve id via the catalog (bundled ids only); call `installPack(templateDir)`.
- Error mapping: bad body → 400 `bad_request`; unknown id → 404 `not_found`;
  entitlement refusal (the gate's named missing-license error) → 402 `license_required`
  (the UI turns this into the Get-license CTA); `PackValidationError` → 422
  `pack_invalid`; fallback → 500 `install_failed`. Success returns the `InstallReport`.
- NOT gated on `RELAY_STAGING` — this is a product surface, same trust model as other
  mutation routes on a single-instance app.

### 6. License API + Settings section (D7 — same store as the CLI)
- New `src/app/api/license/route.ts`: `GET` → `listLicenses()` summaries
  (id, valid, reason, issuedTo, term, seats, entitlements — never the signature);
  `POST { envelope }` → `saveLicense()` (paste/upload activation; file read happens
  client-side, JSON travels in the body) → returns `StoredLicenseInfo` for the
  activation-ceremony rendering. `LicenseStoreError` → 422 `license_rejected`.
- New `src/app/api/license/[id]/route.ts`: `DELETE` → `removeLicense()`.
- New `src/components/settings/license-section.tsx` (client, self-fetching per the
  settings-section convention), wired into `src/app/settings/page.tsx`: licensed-to
  identity (org → name → email, same precedence as the banner), entitlements, seats
  (display/self-audit only — no enforcement), issued/expires dates with the ≤30-day
  renewal warning (parity with `relay license status`), paste/upload activation with
  ceremony state on success, remove with the D4 copy ("Installed packs stay installed —
  removing a license only affects future premium installs.").
- **Flag the section + locked-card + ceremony UI to `/frontend-designer`.**

## Acceptance Criteria

- [x] `relay pack add relay-agency` installs the bundled pack by bare name (no
      node_modules path); an existing local dir of the same name still wins; an unknown
      name errors listing available ids.
- [x] `/packs` renders from the app nav: installed, free-available, and premium-locked
      states (premium exercised via a test-fixture pack until S4 ships a real one).
- [x] One-click install of a free pack from `/packs` materializes the same
      project/tables/customers/profiles/blueprints as the CLI path, and the card flips
      to installed.
- [x] A premium-locked card shows preview, price, and a Get-license CTA; the install
      API refuses it with `license_required` when no entitled license is persisted, and
      installs it when one is (store-consult, no proof re-supplied).
- [x] Settings → License shows identity, entitlements, seats, and term from the D7
      store; pasting a valid envelope activates it (ceremony rendered) and the CLI
      banner reflects it on next launch — one identity model, zero drift.
- [x] Removing a license from Settings shows the D4 copy and leaves installed packs
      untouched.
- [x] Mode B browser-walkthrough capture of the new surface (screenshots + console +
      network per screen) lands in `output/staging/<date>/`.

## Verification

- TDD unit tests: catalog enumeration (incl. corrupt-template listing), bare-name
  resolver precedence, both API routes (error-code table above), schema additions.
- Real-launch smoke (`npm run dev`): the API route statically imports
  `installPack` — its internals keep the TDR-032 dynamic-import discipline, but the
  new static edge from a Next route into `src/lib/packs/` warrants the CLAUDE.md
  smoke budget. CLI smoke: `pack add relay-agency` by name against the built CLI.
- Mode B capture is the acceptance run (PLG-S §5, S3 slice).

## Scope Boundaries

**Included:** catalog, schema fields, name-based install, `/packs` gallery + nav +
apps-gallery nudge, install API, license API, Settings → License section, Mode B capture.

**Excluded:**
- Authoring the first real premium pack + full Naya-path Mode C run (S4 / PLG-2b).
- Website items — pricing copy, fulfilment email rewrite, gating-philosophy page
  (S4 relay via `strategy/relay/_RELAY.md`).
- Marketplace publishing/reviews/third-party packs (feature-cut-freeze fence — this is
  a local-first bundled-pack browser, not a marketplace).
- Seat *enforcement* (display/self-audit only, per program spec §9).
- Reverse trials, registration keys, founding-supporter identity (PLG-4, operator-gated).
- Gallery search/filter/sort — pointless at current pack count (Principle #6).

## References

- Program decision record: `_SPECS/plg-refine.md` §4 (D2, D4, D6, D7), §5 PLG-2, §9.
- Absorbed: `features/fix-pack-install-discoverability.md` (its ACs live on here as the
  free-pack slice).
- Store API: `src/lib/licensing/store.ts` (`listLicenses`, `saveLicense`,
  `findEntitledLicense`, `removeLicense`, `getLicensedIdentity`).
- Identity capture reality: memory `fulfilment-identity-capture` (email always, name
  usually, org never) — the Settings identity line must tolerate email-only licenses.
