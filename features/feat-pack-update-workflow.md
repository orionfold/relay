---
title: Pack update workflow + Agency Pro v0.2.0 (nonprofit deep chapter)
status: planned
priority: P0
milestone: mvp
source: _SPECS/plg-refine.md §4 D4 + feat-agency-pro-pack.md (excluded scope: "the update *workflow* is future work tied to the first paid update") + S6 operator gate (2026-07-01)
dependencies: [feat-agency-pro-pack]
---

# Pack update workflow + Agency Pro v0.2.0

## Description

The D4 pitch — "renewal gets you the year's new and updated packs" — is public
(README, orionfold.com/promise/, the Pro locked card literally says "Nonprofit
deep chapter arrives in v0.2.0 as your first included update") but the update
path does not exist: `relay pack update` is a stub (`src/lib/packs/cli.ts:188-200`),
no installed pack records its version anywhere, and `/packs` has no update
affordance. This feature ships the update workflow as FREE engine work (D5:
capabilities free for everyone) and Agency Pro v0.2.0 (nonprofit deep chapter)
as the first PAID update exercising it.

**D4 invariant (load-bearing, public promise):** installed packs NEVER re-lock;
license expiry gates new premium installs AND updates only. Today this holds by
accident (the gate only runs inside `installPack`). The update verb makes it a
commitment: a failed/expired license refuses the UPDATE with a renewal-voiced
error and leaves every installed artifact untouched and working. No online
re-validation, no store re-verification that disables anything (anti-patterns
fence, plg-refine §7).

## Technical Approach

### 1. Record install state (fixes the version gap)

`installPack` writes a sidecar `<appsDir>/<id>/install-state.json` after a
successful install/update:

```json
{ "packVersion": "0.1.0", "installedAt": "...", "files": { "<dest relpath>": "<sha256>" } }
```

- `files` covers every dropped artifact (profiles, blueprints) at its
  DESTINATION path, hashed at write time. The machine-written manifest.yaml is
  not hashed (it is regenerated every install).
- Zod-validated on read; missing/corrupt sidecar is fail-open: version =
  unknown (treated as older than any template), all files treated as
  potentially user-modified (backup-everything on update). Pre-0.21 installs
  therefore update safely.
- `deleteAppCascade` already removes the app dir → state is swept on remove
  for free.

### 2. `relay pack update <id> [source]` (replaces the stub)

1. Resolve installed app; not installed → named `PackNotInstalledError`
   pointing at `pack add`.
2. Resolve source (same `resolvePackSource`: explicit path/git arg wins, else
   bundled template), parse strict, `relayCore` compat check.
3. `semver.compare(available, installed)`; not newer → "already up to date"
   (exit 0, no gate run, no writes). Unknown installed version → proceed.
4. **License gate — the renewal chokepoint.** Entitlement packs re-run the
   exact install gate (store-consult + optional `--license-url`, `assertEntitled`).
   Refusal message is customer-voice and states the promise: "Your installed
   relay-agency-pro keeps working. Updating to v0.2.0 needs an active license —
   renew at <purchaseUrl>." Free packs skip (gate already no-ops).
5. Apply = the existing idempotent `installPack` path (gate-before-writes,
   table reuse without re-seed `install.ts:209-225`, state-preserving schedule
   upsert), plus:
   - **User-edit protection:** current file hash ≠ sidecar hash → copy to
     `<appsDir>/<id>/backup/<oldVersion>/<relpath>` BEFORE overwrite; list
     every backup in the report. (Recommended over preserve-and-skip: a paid
     update's value is the new content; silently keeping stale files reads as
     "update did nothing." Operator-review open item below.)
   - Rewrite the sidecar with the new version + hashes.
6. Report: `id vOLD → vNEW`, artifacts added/updated/backed-up, tables and
   schedules added.

**Additive-only invariant** (prior art: `features/app-updates-dependencies.md`):
update never deletes files, tables, rows, or customers. Artifacts the new
version no longer ships stay in place (orphan sweep = future work, note in
report only if detected). Column additions to existing tables are NOT
supported yet — a v-next manifest changing existing table columns is a
documented ceiling, not silent breakage.

### 3. Surfaces

- `pack list`: show `installed vX.Y.Z` and `[update available → vA.B.C]` from
  sidecar vs catalog.
- `/packs` card: installed + template-newer → "Update to vA.B.C" button →
  new POST `/api/packs/update` (mirrors install route incl. **402
  license_required**, same soft-gate copy pointing at Settings → License).
- CLI/API/UI all derive from one comparison helper (D7 discipline: one source).

### 4. Agency Pro v0.2.0 — nonprofit deep chapter (the paid content)

- `pack.yaml`: `version: "0.2.0"`; description line flips to "…nonprofit deep
  chapter INCLUDED (added in v0.2.0)".
- Chapter scale mirrors the CRE deep chapter (1 deep profile + 1 deep
  blueprint + table): `nonprofit-grants-analyst` profile (SKILL.md carries the
  methodology depth — grant lifecycle: LOI → application → award → restricted
  funds compliance → report deadlines; hardened tool policy like all Pro
  profiles) + `grant-pipeline-deep` blueprint (row-triggered off a new
  `grants` table: deadline extraction → fit scoring → application drafting →
  compliance calendar) + the `grants` table decl. Exact content authored
  against the free pack's light grant verbs (what Pro deepens, never
  regresses).

## Acceptance Criteria

- [ ] Unit: fixture pack v1 installed from a local path, then `pack update`
      against a v2 source — version recorded, new artifacts land, existing
      table NOT re-seeded, scheduler state preserved, sidecar rewritten.
- [ ] Unit: user-modified dropped file → backed up to `backup/<oldVersion>/`
      and overwritten; report lists it. Missing sidecar (pre-0.21 install) →
      backup-everything path.
- [ ] Unit: same-version update → "already up to date", zero writes, gate not
      invoked.
- [ ] **D4 proof:** entitled pack + NO valid license → `pack update` refuses
      with the renewal-voiced message; every installed artifact byte-identical
      after; blueprints still run. With the real prod fixture in the store →
      update succeeds store-consult (no flag).
- [ ] `relay pack update relay-agency-pro` on a 0.1.0 install lands the
      nonprofit chapter: profile + blueprint + `grants` table materialize;
      dropping a `grants` row fires the deep blueprint (trigger rewrite 0a
      machinery re-proven on update).
- [ ] `pack list` + `/packs` show the update-available state; API returns 402
      without entitlement.
- [ ] **Real-launch smoke** (CLAUDE.md budget — schedules-installer chain is
      runtime-adjacent): update applied under `npm run dev`, first request
      clean, no module-load cycle.
- [ ] Publish smoke (Case L) still green; agency-pro template suite
      schema-validates all v0.2.0 content.

## Scope Boundaries

**Included:** install-state sidecar, update verb + gate + backup, list/UI/API
update surfaces, nonprofit deep chapter, unit tests, dev smoke.

**Excluded:** orphan-artifact sweep on update; additive column migration for
existing tables; rollback verb (backups make it manual-possible; verb is
future); auto-update / update notifications; dependency resolution between
packs; any change to license verification semantics (gate is reused verbatim).

**Resolved (operator, 2026-07-01):** user-modified files → **backup-then-overwrite**
as specced above (backup to `apps/<id>/backup/<oldVersion>/`, loud report).

## References

- Machinery map (2026-07-01 exploration): install flow `src/lib/packs/install.ts:104-359`,
  overrides precedence `format.ts:187-212`, gate `src/lib/licensing/gate.ts:46-83`,
  stub `cli.ts:188-200`, /packs card `src/app/packs/page.tsx:39-139`.
- D4 text: `_SPECS/plg-refine.md:116-119`; public copies README.md:140,
  `docs/trust/license-terms.md:35`, orionfold.com/promise/.
- Prior art: `features/app-updates-dependencies.md` (dropped marketplace-era
  spec; additive-only invariant + backup/rollback shape reused).
- Managed-base intent: `_SPECS/relay-pack-format.md:97,131,175-177`.
