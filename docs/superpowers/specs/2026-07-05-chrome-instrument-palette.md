---
title: Chrome Instrument Palette + Settings-at-a-Glance (FEAT-14)
date: 2026-07-05
status: APPROVED 2026-07-05 — ready to implement (all 4 workstreams one pass; restrained glow)
supersedes-partially: 2026-07-04-top-chrome-visual-system-design.md (reverses its "opaque chrome /
  no see-through grid" rejection per operator; keeps all its STRUCTURAL work)
blast_radius: medium-high — globals.css tokens, layout.tsx critical-CSS, 3 shell components, a NEW
  settings-glance component + its data read, one edit-only strategy-repo freeze note. No DB.
reference: ~/orionfold/website/src/styles/global.css (the of-* design system, verbatim values below)
---

# Chrome Instrument Palette + Settings-at-a-Glance

Fold the **relay website's dark-theme technique** — a two-tier teal blueprint grid, ambient teal
glows, and translucent teal washes over neutral surfaces — into the Relay app's chrome, and build the
deferred **FEAT-14** settings-at-a-glance rail. The website already shares the app's teal accent and
near-identical neutral-blue surfaces, so this is a *technique* port (grid + glow + wash + translucency),
NOT a hue change. Operator ruling: **adopt the technique, keep the hue.**

## Goal & the four workstreams

1. **Rollback** the rail-off-menu move — the rail rejoins the chrome/menu panel (it is chrome, not
   content).
2. **Translucent instrument rail** — the blueprint grid shows THROUGH the rail so the sparkline
   "graphs" stand out on a drafting surface. (This deliberately reverses the S47 spec's "opaque
   chrome" rejection — operator override.)
3. **Instrument palette** — port the website's two-tier teal grid + ambient glow + translucent-wash
   elevation into the app's dark AND light tokens.
4. **FEAT-14 settings-at-a-glance** — a two-level progressive-disclosure expand/collapse rail BELOW
   the telemetry rail, summarizing key settings, with distinct zone backgrounds.

**Non-goals.** No hue change (teal stays). No surface over-saturation (surfaces stay neutral-blue; the
green/teal lives in the grid/glow/wash LAYERS, per the website). No new telemetry cells. No DB.

---

## Reference values (verbatim from the website, to port)

From `~/orionfold/website/src/styles/global.css` + `relay.astro`:

```
accent (dark):  #14c8c0   accent (light):  #0e9e98        ← already ≈ Relay --primary (oklch .78/.62 .13 192)
primary-glow (dark):  color-mix(in oklch, #14c8c0 26%, transparent)   (light 22%)
two-tier blueprint grid (relay.astro:738-749):
  --bp-line:  color-mix(in oklch, PRIMARY 12%, transparent)   fine  24px cells
  --bp-major: color-mix(in oklch, PRIMARY 20%, transparent)   major 120px cells
  mask: radial-gradient(ellipse 80% 70% at 50% 45%, black 40%, transparent 100%)
ambient bloom (LicenseBand:69):  a PRIMARY/[0.12] circle, blur-[130px], bled off-edge
teal-tinted card shadow:  shadow-lg shadow-primary/5   (elevation = teal shadow, not neutral)
elevation washes:  bg-primary/[0.04] → /[0.06] → /[0.07] → /10 → /15   (increasing teal opacity)
```

Relay's current teal accent (dark `--primary: oklch(0.78 0.13 192)`) IS the port target — the grid/glow
derive from `--primary`, exactly as the website derives from its `--color-primary`.

---

## Workstream 1 — Rollback (surgical, not a range revert)

Three commits landed after the S47 redesign; treat them individually:

| Commit | What | Action |
|--------|------|--------|
| `34467e3a` | dark-tier legibility widen + **critical-CSS-drift fix** | **KEEP** the critical-CSS fix (real bug, memory `critical-css-shadows-surface-tokens`); the tier values get superseded by WS3 |
| `700fd4bd` | rail → `--background` (broke rail off the menu) | **REVERT this behavior** — rail rejoins chrome (WS2 decides its exact surface) |
| `e6ab5ea0` | grid onto the rail | **KEEP** — the grid-through-rail is wanted (WS2) |

So: the rail stops sharing `--background`; it becomes a translucent chrome surface (WS2). The grid-on-rail
`::before` selector stays. The critical-CSS sync stays.

## Workstream 2 — Translucent instrument rail

The rail is **chrome that sits over the gridded canvas**, reading as a drafting/instrument surface:

- Rail background = a **translucent tint of the chrome surface** over the grid, NOT opaque. Concretely:
  `background: color-mix(in oklch, var(--surface-2) 82%, transparent)` (dark) so the `#main-content`
  canvas grid *and* the rail's own `::before` grid read through faintly, but cell values stay legible.
  (Tune the % in QA for legibility over the grid — 78–88% range.)
- The rail keeps `z-[var(--z-rail)]` (30) BELOW the header (40) and sits at `top:var(--chrome-header)`
  so the S47 sticky-fix holds. It rejoins the two-tier bar visually via the shared surface family
  (header s-1 → tier-2 s-2 → rail = translucent-s-2-over-grid), so the three tiers still descend.
- A faint **teal top-glow** on the rail's top edge (a 1px inset `box-shadow` in `--primary` at ~10%)
  ties it to the accent system and marks the chrome↔canvas seam better than a flat border did.

## Workstream 3 — Instrument palette (the technique port)

All additive; surfaces stay neutral (no hue shift). New tokens in `globals.css` `:root` + `.dark`:

```
--grid-line:   color-mix(in oklch, var(--primary) 12%, transparent);   /* fine 24px */
--grid-major:  color-mix(in oklch, var(--primary) 20%, transparent);   /* major 120px */
--glow-accent: color-mix(in oklch, var(--primary) 26%, transparent);   /* dark; 22% light */
--wash-1: color-mix(in oklch, var(--primary) 4%,  transparent);
--wash-2: color-mix(in oklch, var(--primary) 6%,  transparent);
--wash-3: color-mix(in oklch, var(--primary) 10%, transparent);
```

- **Upgrade the blueprint grid** (`#main-content::before` + rail `::before`) from the current single-tier
  neutral 24px grid to the website's **two-tier teal grid**: fine 24px `--grid-line` + major 120px
  `--grid-major`, with the `radial-gradient` edge mask so it fades at the margins (drafting feel, not a
  hard tiled sheet). Theme-aware via `--primary` (dark teal vs light teal — no `.dark` override needed
  since it derives from the theme's `--primary`).
- **Elevation = teal wash + teal-tinted shadow**, per the website: accented/nested tiles use `--wash-*`
  instead of a darker neutral surface; cards get `shadow-[…] shadow-primary/5`-equivalent tinted shadow.
- **Ambient glow — DECIDED (operator, 2026-07-05): RESTRAINED.** NO big 130px bloom (too marketing for
  a work app). Use only the rail top-glow (WS2 seam glow) + wash elevation. Revisit only if it reads flat.
- **Light theme** — the same tokens derive from light `--primary` (oklch 0.62 .11 192 ≈ #0e9e98 family),
  so grid/glow/wash all shift automatically; verify contrast (teal-on-white washes are subtle — may need
  the light washes at slightly higher % than dark).

## Workstream 4 — FEAT-14 settings-at-a-glance rail (NEW component)

A **two-level progressive-disclosure expand/collapse rail directly below the telemetry rail**,
summarizing key settings. This is the deferred FEAT-14, now in scope.

- **Level 1 (collapsed, default):** a single slim row of the most important settings as compact
  read-only chips — e.g. active runtime/model, license tier, budget cap, permissions mode, web-search
  on/off, channels count. One line, scannable, mirrors the telemetry rail's density. A chevron expands.
- **Level 2 (expanded):** a short grouped panel — the ~11 setting sources grouped into a few labeled
  clusters (Runtime · Budget · Permissions · Integrations), each a small labeled tile. Read-only summary
  with a "Settings →" deep-link per group; NOT an editor (edits stay on /settings).
- **Data:** one consolidated read (extend the S47 `useInstanceIdentity()` pattern — a new
  `useSettingsGlance()` hook over a new `/api/settings/glance` route that aggregates the ~11
  `/api/settings/*` sources server-side into one payload). Shadow-path discipline: every field nullable,
  the row renders only the chips that resolved; a failed read collapses the rail to nothing (no crash).
- **The "5 distinct areas" background treatment** (the zones that need varying surfaces): (1) collapsed
  glance row, (2) expanded panel ground, (3) each group tile, (4) nested value pills, (5) the
  telemetry-rail↔glance seam. Assign these using the WS3 wash/surface system so they read as distinct
  layers (the current settings page mushes everything onto `--surface-1` — this rail must not repeat
  that). Collapsed row = translucent chrome (like the telemetry rail); expanded panel = one step
  toward the canvas; tiles = `--wash-1`; pills = `--surface-1`.
- **Sticky behavior:** decide whether the glance rail is sticky under the telemetry rail (adds to
  `--chrome-header`) or scrolls away. DEFAULT: **collapsed row is sticky** (part of chrome, so
  `--chrome-header` grows by its height and the offset math stays honest); the **expanded panel is an
  overlay** that pushes content or floats — implementer picks the non-janky option, documents it.

**Sequencing — DECIDED (operator, 2026-07-05): all four workstreams in ONE pass.** FEAT-14's zone
backgrounds are designed against the final palette from the start. FEAT-14 is the largest workstream
but is IN SCOPE for this implementation, not a follow-up.

---

## Token drift + critical-CSS (do not repeat the S48 debugging)

`layout.tsx` `CRITICAL_THEME_CSS` duplicates `--background/foreground/surface-1/surface-2/border` under
`html.dark` (specificity 0,2,0 — WINS over globals.css `.dark`). ANY change to those five tokens' values
MUST be mirrored there or it silently doesn't take (memory `critical-css-shadows-surface-tokens`). The
new grid/glow/wash tokens are NOT in the critical-CSS (they're not first-paint-critical), so they're
safe to add in globals.css only. Turbopack dev does not HMR token edits — `rm -rf .next` + restart to
verify (memory).

## Blast radius / do-not-break

- `--surface-2`/`--surface-3` are consumed by `data-table.tsx:129` (sticky header) + `schedule-form.tsx:538`
  + `.surface-*` utility classes + slider track. WS3 does NOT change surface VALUES (only adds wash/grid/
  glow tokens), so these are untouched. If WS2 retiers a surface, re-check these.
- Grid `::before` currently targets `#main-content` AND `[aria-label="Telemetry"]` — the two-tier upgrade
  edits that shared rule; both get the new grid.
- Freeze note: the telemetry rail is freeze Target 4 (presentation-only lift already granted 2026-07-04).
  Translucency + grid-through is still presentation-only (no new cells, `RailCell` API + `TelemetrySnapshot`
  unchanged) — within the amendment. Edit-only; strategy owner commits.

## Error & Rescue Registry

| Error | Trigger | Rescue |
|-------|---------|--------|
| Rail values illegible over grid | translucency too high / grid too strong | tune rail bg % (78–88) + grid alpha; legibility is the gate, assert in dev-smoke both themes |
| Light washes invisible | teal-on-white wash too faint | raise light wash % vs dark; verify each wash reads |
| Critical-CSS drift | edit a surface token in globals only | mirror in layout.tsx; memory rule |
| Glance read fails | `/api/settings/glance` 500 | hook `status:error` → rail collapses to nothing, dev-warn; no crash |
| Glance sticky breaks offset | glance height not in `--chrome-header` | if collapsed row is sticky, add its height to the offset token; assert rail-below-glance flush |
| Grid over-tiles (no fade) | mask dropped | keep the radial edge mask; without it the sheet reads as a hard grid, not a drafting surface |

## Verification (real `npm run dev`, both themes)

1. Rail rejoins the chrome (reads as the bottom of the bar stack, not floating in content); grid shows
   through translucent rail; sparklines pop over the grid.
2. Two-tier teal grid visible (fine + major lines), edge-masked; teal-tinted not neutral.
3. Elevation reads via wash/glow, both themes; surfaces still neutral (no green cast on plain surfaces).
4. FEAT-14: collapsed glance row shows key settings chips; expand reveals grouped panel; 5 zones read as
   distinct layers; failed read collapses cleanly.
5. Sticky offsets honest (telemetry rail + glance row); no overlap on scroll.
6. `npm test` green (esp. telemetry-rail cell-count = 10; new glance route/hook tests).
7. Critical-CSS synced (dark first-paint matches globals).
