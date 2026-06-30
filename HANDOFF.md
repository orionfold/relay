<!-- ============================================================= -->
<!-- QUEUED ALSO — Relay partner brochure revisions (2026-06-29)    -->
<!-- ============================================================= -->
<!--
RELAY BROCHURE — built this session, lives in the BOOKS peer repo, not here.
  - Source:   orionfold/books/relay-brochure/ (relay-brochure.qmd + theme/brochure.typ)
  - Skill:    orionfold/books/.claude/skills/publish-brochure/
  - Output:   ainative/output/relay-brochure/Orionfold-Relay-Partner-Brief.pdf (+ .html, screenshots/)
  - Seed:     feat/relay-agency-seed-dataset branch (CRE+nonprofit "Relay Agency Demo" dataset)
  - Render:   cd orionfold/books/relay-brochure && TYPST_FONT_PATHS="$(pwd)/theme/fonts" \
              quarto render relay-brochure.qmd --to typst   (then copy _output PDF to ainative/output)

OPERATOR FEEDBACK to apply (in progress this session):
  1. Whitespace/newline issues between text blocks — review thoroughly: caption→next paragraph,
     section title→paragraph start, between blocks. (Typst/Pandoc margin-collapse.)
  2. Do NOT dangle a headline at a page bottom with its section starting the next page
     (keep heading with its first content block — orphan/widow control).
  3. De-personalize: remove partner/co-founder NAMES (Harun/Daniel/Jeff), remove confidential
     partner-customer $ details ($5K retainer, 73% margin, specific client identities), generalize
     to a CRE+nonprofit agency audience.
  4. Add Orionfold branding: the OfMark disc+star (src/components/shared/of-mark.tsx — cyan disc
     #009b97 Tide cyan + white 45°-rotated star), a © copyright line, and Apache-2.0 license note
     (Orionfold-wide convention per website terms.astro + seo.ts).
  ALL FOUR APPLIED (2026-06-29) — brochure re-rendered, copied to ainative/output/relay-brochure/.
  PLUS: logo fixed (was broken — hand-rolled Typst star collapsed; now embeds theme/of-mark.svg +
  of-mark-ondark.svg, geometry from of-mark.tsx). PLUS: added 5 workflow/app screenshots (09 simple
  sequence, 10 complex human-in-the-loop checkpoint, 11 blueprints gallery, 12 blueprint detail, 13
  "Describe an app — Relay builds it" magic-feature) + new Orchestration section + upgraded zero-code
  apps pillar. Now ~11 pages, 13 screenshots.
  SPACING FIX SHIPPED: text-led section() H2s no longer hug their body — the fix was adding an optional
  `lead:` arg to section() so the first paragraph renders INSIDE the heading's block (no Pandoc raw-block
  boundary for the margin to collapse against). Converted the 4 text-led openers (Why-this-brief, Five-
  gaps, Orchestration, Zero-code-apps); grid/roadmap-led ones never had the problem.
  CLIENT NAMES SCRUBBED: re-seeded relay-agency with generic-but-believable names + re-captured all 13
  screenshots (light theme). Mapping: Lakeside→Meridian Commercial Realty, North Star→Summit CRE
  Advisors, Cedar & Co.→Parkview Property Management, Twin Cities Nonprofit Alliance→Community Impact
  Alliance, Headwaters→Cornerstone Community Foundation, Riverside Family→Lakeshore Family Services.
  Kept Twin Cities geography (Bloomington/Edina/Minneapolis — not client identities). Renames applied in
  BOTH worktree (relay-demo) and need mirroring to the feature branch's seed files at PR time.
  Minor remaining: (1) page-3 has a lone "5·Distribution" panel from the Five-Gaps grid split (layout,
  not a bug); (2) the build-an-app screenshot's chat-history sidebar shows generic default-dataset chat
  titles (createConversations isn't CRE-specific) — cosmetic background only.
  THEME-STICK NOTE: DevTools MCP page renders dark server-side (no theme cookie in that context); set
  the ainative-theme=light cookie + DOM class per route before each capture (navigate initScript helps).
  Open follow-up (optional): demo SCREENSHOTS still show invented client names (Lakeside, North Star,
  etc.) baked into seed data; captions frame them as "a sample agency." To fully scrub, re-seed with
  generic names + re-capture.

NPM NAMING — DONE (2026-06-29):
  - npm account `orionfoldllc` created (2FA on); org `@orionfold` created (scope for
    @orionfold/relay|proof|arena). Username ≠ org name on purpose — npm shares the username/org/scope
    namespace, so `orionfold` had to go to the ORG, not the personal account.
  - Reservation placeholders PUBLISHED: `orionfold@0.0.1` + `orionfold-relay@0.0.1` (1 kB stubs,
    "coming soon" bin, Apache-2.0). Source: orionfold/npm-reserve/ (untracked). `orionfold-relay`
    bins: `orionfold-relay` + `relay`.
  - PyPI parity: orionfold / orionfold-proof / orionfold-arena already held on PyPI (separate registry,
    no conflict). npm siblings orionfold-proof / orionfold-arena NOT yet reserved.
  - DEFERRED (per project-self-extending-machine-npm-deferred): the real `orionfold-relay@0.1.0`
    rename-release (package + bin rename, ~18-file sweep of "ainative-business"/"ainative" bin, npx
    hoisting, README/docs) ships with the BATCHED pivot release, not now. `npx ainative-business` is
    still the current command until then.
  - Bypass-2FA publish token was created, used once, then REVOKED + scrubbed from .env.local.

DONE (2026-06-29): SENT the Harun email from manav@orionfold.com (Orionfold Mail / u/1) via
  gmail-browser-ops Claude-in-Chrome flow. Operator added recipient + attached the PDF manually, then
  sent. Two in-session revisions vs the approved draft below: (1) DROPPED the "Tue/Wed once Cloud Code
  credits refresh + I'll send the install" launch commitment — credits situation resolved, operator
  chose to commit no further action and let the PDF be the "killer" next step; (2) cut the whole
  "next steps / your one-pager" forward-ask paragraph, closing on "PDF attached. Would love your
  unfiltered read." Generic tone preserved (no client names / $). Subject unchanged.
  Note: account default signature (Founder/Orionfold + CAN-SPAM opt-out line + physical address)
  auto-appended; left as-is per operator (flagged that the opt-out line reads marketing-ish on a warm 1:1).

  APPROVED DRAFT TEXT (generic version — paste into the Gmail body):
  --------------------------------------------------------------------
  Subject: Orionfold Relay — the partner brief I mentioned

  Hi Harun,

  Great catching up the other day — congrats again on the LLC and signing your first customer. The
  forward-deployed, agency-managed model you described is exactly the shape Relay is built for, so I put
  together a short partner brief to make the case concrete.

  The thesis in one line: Relay is the agency operating layer you'd otherwise spend months building —
  every client a project, every vertical a profile, every service a reusable workflow, every model a
  switch, with per-client billing and human-in-the-loop governance built in. The brief walks through it
  with real screenshots: the one-board cockpit, simple vs. governed multi-step workflows, multi-vendor
  model switching (Claude/Codex/Gemini/local), and the "describe an app, Relay builds it" zero-code
  composition.

  I also flagged the one piece that's still ahead of us — a first-class customer dimension for true
  multi-tenant agency management. That's the part I'd want to design with you, from your one-pager,
  rather than retrofit later.

  Next steps on my side: Relay goes public Tuesday/Wednesday once the Cloud Code credits refresh — I'll
  send you the install the moment it's live so you can put it through its paces and tell me where the
  gaps are. On yours, whenever it's ready, the one-pager on how you'd deploy Relay for clients (and what
  your customer/group schema looks like) would let me start shaping the agency surface around how you
  actually run accounts. Then we can structure the subcontractor/partnership side.

  PDF attached. Would love your unfiltered read.

  Best,
  Manav
  --------------------------------------------------------------------
-->

<!-- npm bin decision (from operator): eventually want THREE launch commands — `relay`,
     `orionfold-relay`, AND `orionfold` (umbrella dispatcher). Bake into the 0.1.0 rename plan.
     Watch: a bare `orionfold` npm bin could PATH-collide with the PyPI `orionfold` CLI if a user
     installs both globally; npx is unaffected. Keep npm bin names distinct (relay/orionfold-relay)
     or make the umbrella dispatch, to avoid the collision. -->


# Handoff: DONE — `_SPECS/feature-cut-freeze.md` implemented (cut/freeze the below-the-line surfaces)

**Updated:** 2026-06-29 (cut-freeze implementation session). The cutline is **SHIPPED + local**
(one commit, not pushed). All spec gates passed: `tsc --noEmit` clean, `validate:tokens` green,
`nav-items` 9/9, dev smoke + Claude-in-Chrome walkthrough (both themes) confirmed. Prior DS/redesign
handoff archived at `.archive/handoff/2026-06-29-orionfold-ds-redesign-shipped.md` (those 7 commits
shipped + local). The queued-task detail below is kept as the implementation record.

## WHAT SHIPPED (2026-06-29)
- **Nav cut** — `nav-items.ts`: removed Analytics + Environment; dissolved the `configure` group;
  `NAV_GROUPS` now **4 groups** (Home · Compose · Data · Observe); dropped 3 unused icon imports.
- **Settings right-align** — `app-bar.tsx`: icon-only gear in the right utility cluster, cyan-active
  on `/settings`, `aria-label`/`title`/`aria-current` set; verified no accordion mis-open
  (`activeGroupId`→home fallback holds).
- **Freeze markers** — 4 `FROZEN SCOPE` comments: `telemetry-rail.tsx`, `rail-cell.tsx`,
  `api/telemetry/route.ts`, `lib/plugins/registry.ts`.
- **Roadmap hygiene** — 11 `features/` distribution/marketplace specs flipped `deferred → dropped`
  (+ reason); "Dropped — not pursuing" note added to `features/roadmap.md` Post-MVP.
- **Doc reconcile** — `_IDEAS/reprioritze.md`: revision-log row + "Executed cuts / Frozen surfaces".
- **Verified zero-regression** — dormant `/analytics` (200, renders) + `/environment` (200, 44KB
  live workspace scan → `src/lib/environment/**` intact); `/monitor` + `/` charts render
  (`chart-data.ts` untouched). No `src/lib/**` behavior change, no DB/route/API/component deletion.
- **NOTE:** untracked `.archive/handoff/2026-06-29-orionfold-ds-redesign-shipped.md` (prior session's
  archive, not gitignored) was left untracked — not part of this commit; operator to decide.

---

<details><summary>Original QUEUED handoff (implementation record)</summary>

> **Operator policy:** commits stay **local-only** through the next release — do NOT push or prompt
> to push (`feedback-no-push-reminders-pre-release`). Default to `main`
> (`feedback-default-main-not-worktree`). `_IDEAS/` + `_SPECS/` are gitignored local strategy files.

## CONTEXT — why this work exists

Relay (formerly ainative) is becoming the **third** Orionfold product (menu: **Proof · Arena ·
Relay**). Positioning landed: **one buyer, three jobs** — Proof = *"which AI can I trust?"*, Arena =
*"which build wins?"*, **Relay = "now make the trusted AI do the actual work"** (the *operations
tier*; the only product whose value compounds *after* evaluation stops). Full thesis + a
28-feature **Desirability/Feasibility/Viability/Uniqueness** matrix is in
**`_IDEAS/reprioritze.md`** (living doc). Its §4 draws an **aggressive concentration cutline**: ship
fewer primitives deeper, stop carrying below-the-line surfaces that dilute the ops story or fight a
peer on the same screen.

This handoff is to **execute that cutline** via the approved spec.

## THE TASK — implement `_SPECS/feature-cut-freeze.md` end-to-end

Read the spec first; it is the source of truth (status: `spec — awaiting approval`, but operator
approved the approach + all open decisions in-session). It is **subtractive + zero-regression** —
removes/relabels, builds almost nothing. Operator decisions already baked into the spec frontmatter:
- **Cut method = hide from nav, keep routes dormant on disk** (reversible, minimal diff).
- **Freeze enforcement = doc + code marker comments** (no lint/test guard).
- **Marketplace DROP = roadmap-only** — there is NO shipped marketplace/`.sap`/remix code to delete
  (verified by grep). Do not hunt for files.
- **Settings → right-aligned icon-only gear; dissolve the now-single-item Config group.**

### Execution order (from spec § Sequencing — vertical slice, smallest blast radius first)

1. **Nav cut — `src/components/shell/nav-items.ts`** (one file):
   - Remove the **Analytics** item from `observeItems` (`href: "/analytics"`). Observe keeps Monitor
     + Cost.
   - Remove the **Environment** item from `configureItems`; then **dissolve the whole `configure`
     group** (it's down to a single Settings item): delete `configureItems`, its `NAV_GROUPS` entry,
     and `"configure"` from the `NavGroupId` union. `NAV_GROUPS` → **4 groups** (Home · Compose ·
     Data · Observe).
   - Remove now-unused icon imports: `BarChart3` (Analytics), `Globe` (Environment), `Settings`
     (moving to app-bar).
2. **Settings right-align — `src/components/shell/app-bar.tsx`** (one file, the ONLY behavior-bearing
   UI edit): add an **icon-only gear `Link`** to the right `ml-auto` utility cluster, placed BEFORE
   the ⌘K button. Mirror the ⌘K button sizing (`h-8`, rounded-md, muted→foreground hover). **Active
   state** (`pathname.startsWith("/settings")`) = cyan `text-primary` (bar's single action color).
   Add `aria-label="Settings"`, `title="Settings"` (icon-only needs the accessible name),
   `aria-current` when active. Import `Settings` from `lucide-react` here.
   - **Correctness check:** `activeGroupId()` already falls back to `"home"` when no item matches, so
     `/settings` (now in no group) won't mis-open an accordion — verify in smoke, no code change
     needed there.
3. **Test sync — `src/components/shell/__tests__/nav-items.test.ts`**: update to **4 groups**;
   `observe` = 2 items; no `/analytics`, `/environment`, or `/settings` in any group's items. Keep
   the `activeGroupId` fallback + active-matching assertions. Run `npm test -- nav-items`.
4. **Freeze markers** (4 short `FROZEN SCOPE` banner comments, no behavior change), each pointing to
   this spec + `_IDEAS/reprioritze.md` §4:
   - `src/components/shell/telemetry-rail.tsx` — 10 cells is the frozen surface; don't out-build
     Arena's machine monitor.
   - `src/components/shell/rail-cell.tsx` — frozen RailCell API.
   - `src/app/api/telemetry/route.ts` — frozen aggregate shape.
   - `src/lib/plugins/registry.ts` — plugin fall-through is the escape hatch, maintain-only.
5. **Roadmap hygiene**: flip the deferred app-distribution/marketplace specs under `features/` from
   `deferred` → `dropped` (the `.sap`/remix/updates/channels/marketplace-reviews/creator-portal/
   install-widget specs named in `reprioritze.md` gap analysis); add a "Dropped — not pursuing" note
   to `features/roadmap.md` Post-MVP section.
6. **Doc reconcile — `_IDEAS/reprioritze.md`**: append a revision-log row + add an "Executed cuts /
   Frozen surfaces" note so matrix and code agree.

## REGRESSION FENCES — the do-not-touch list (critical)

The cut surfaces sit on top of **deeply shared libs**. The danger is grazing the lib while hiding the
surface. **Do NOT touch** (spec § Regression fences has the full table):
- `src/lib/queries/chart-data.ts` — shared by telemetry rail (frozen, still reads it), `/monitor`,
  dashboard, `projects/[id]`. **Distinct from** `src/lib/analytics/queries.ts`.
- `src/lib/environment/**` — workspace-context / auto-scan / scanner / list-skills / parsers,
  consumed by chat, agents, runtime, telemetry route, `/monitor`, projects, tasks, plugins. Hiding
  the `/environment` UI must not graze any of it. `environment_*` DB tables stay.
- `src/lib/apps/**` — the local app-manifest KEEP (the composability moat we're concentrating ON);
  load-bearing for chat engine, table row-trigger dispatch, blueprint/profile/schedule tools.
- No DB migration, no API deletion, no route/component deletion. **Dormant ≠ deleted.**

## VERIFICATION (spec § Verification — do all)

- `npx tsc --noEmit` clean (catches unused imports + stray refs to removed items).
- `npm run validate:tokens` green (no token edits — sanity gate).
- `npm test -- nav-items` passes (updated IA).
- **`npm run dev` smoke** (`nav-items` feeds `app-bar.tsx`, mounted globally):
  - Bar shows **4 groups** (Home · Compose · Data · Observe); no Config group; Observe = Monitor +
    Cost (no Analytics). **Settings = icon-only gear in right cluster**, cyan-active on `/settings`,
    no accordion mis-opens.
  - **Dormant routes still resolve by direct URL**: `/analytics` + `/environment` each 200 (proves
    hidden-not-deleted + no shared lib harmed).
  - `/monitor`, `/`, `/projects/[id]` still render charts (proves `chart-data.ts` untouched);
    chat `list_skills` still works (proves `src/lib/environment/**` untouched).
- **Browser walkthrough** — operator prefers **Claude-in-Chrome side-by-side** (drive the live
  Chrome session, not headless/DevTools; the live tab doesn't auto-raise — tell operator to switch
  to the Browser-1 window; don't auto-close mid-session). Confirm 4-group bar + right gear +
  tooltip/active in both themes; frozen rail still renders its 10 cells.

## COMMIT (when verified, local-only)

Suggested: one focused commit. Conventional-commit style; end body with the Co-Authored-By trailer.
e.g. `refactor(shell): cut below-the-line surfaces; right-align Settings; freeze telemetry scope`.
Version NOT bumped per-commit — `0.15.0` accumulates toward the next batched release
(`project-self-extending-machine-npm-deferred`).

## STATE
- Branch `main`. Seven shipped local redesign commits (none pushed) — see archived handoff. **No new
  commit from this session yet** — only `_IDEAS/reprioritze.md` (new) + `_SPECS/feature-cut-freeze.md`
  (new) written, both gitignored local strategy files. Plus this `HANDOFF.md`.
- Code still self-identifies as `ainative-business` / "AI Native Business"; "Orionfold Relay" is the
  brand layer. Rename/CLI/data-dir migration is **out of scope** (operator decision) — do not touch
  identifiers while implementing the cut.
- Two artifacts from this session to read at start: **`_SPECS/feature-cut-freeze.md`** (the task) and
  **`_IDEAS/reprioritze.md`** §4 (the why). `feedback-handoff-md-workflow`: this handoff was written
  at task boundary for a clean `/clear`.

</details>
