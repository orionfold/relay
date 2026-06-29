# Handoff: Content extraction → ~/orionfold/books (Book + User-Guide/docs done, local); pushes pending

**Updated:** 2026-06-28 (session 2: roadmap reconciliation done).

> **Operator policy (this session):** all commits stay **local-only** through the next release
> while pivotal changes land. Do NOT push or prompt to push. Memory: `feedback-no-push-reminders-pre-release`.

## DONE: User Guide / docs extraction → ~/orionfold/books (content-factory model)

Governing principle realized: **ALL content generation lives in `~/orionfold/books`, reading the
ainative product repo read-only via `$AINATIVE_REPO` sibling path; ainative keeps zero generation
machinery.** Plan: `~/.claude/plans/extract-user-guide-docs-to-books.md`.

- **Phase A ✅:** field-manual already fully self-contained in `books/field-manual/` (69/69
  screenshots local, `make BOOK=field-manual all` green, epubcheck 0). No copy needed.
- **Phase B ✅ (books/ commit `ff02215`, local):** all 5 generation skills moved to books/ and
  rewritten to sibling-path with loud guards — doc-generator (writes `books/ainative-docs/` corpus,
  the field-manual authoring source), screengrab (drives ainative dev server, writes back to
  `$AINATIVE_REPO/screengrabs/`), user-guide-sync (writes README images to
  `$AINATIVE_REPO/public/readme/`), refresh-content-pipeline (orchestrates from books/),
  book-updater (prior). Seeded `books/ainative-docs/` (22 features, 5 journeys, 2 use-cases). All 5
  skills removed from ainative `.claude/skills/` (gitignored; on-disk only).
- **Phase C ✅ (ainative, local — NOT pushed):** full in-app User Guide removal. Deleted
  `src/app/user-guide/`, `src/app/api/user-guide/`, `src/components/playbook/` (10), `src/lib/docs/`
  (5, DB-backed loader). Decoupled the **command palette** (route + component + command-data — it
  surfaced docs via getManifest). Removed sidebar "Learn" group + User Guide entry. Dropped `docs/`
  from `package.json files` + `bin/cli.ts` hoist. De-committed the generated docs corpus
  (gitignore + `git rm --cached`; files on disk; KEPT `docs/superpowers/` + `docs/plugin-security.md`
  tracked). Updated `npm-pack-files.test.ts` (asserts docs/ NOT shipped) + `npx-process-cwd.test.ts`.
  **Smoke verified:** `npm run build` clean (no /user-guide route), `npm run dev` boots, `/` → 200,
  `/user-guide` → 404, command-palette API → 200 (no playbook field). Full suite: my changes add
  ZERO failures (10 pre-existing failures confirmed via stash-and-retest, all unrelated:
  settings/charts/plugin-version/router/blueprint-e2e).

**Pushes pending (operator-gated):** ainative Phase C commit (local), books/ Phase B `ff02215`
(local, no remote by decision). On-disk generated `docs/` corpus + past public history left as-is
(same accept stance as the book).

### ✅ RESOLVED (session 2, 2026-06-28): roadmap reconciliation for User-Guide-removed features

The QUEUED stale-roadmap items are now fixed. **Operator decision: mark `removed` + note.** A new
`removed` status value was introduced (prior vocab was `completed`/`in-progress`/`deferred`; no
legend block to update — statuses appear inline only). Nothing was broken at runtime — this was
truth-drift: specs/roadmap claimed `completed` for UI deleted in Phase C.

Changes (4 files, all **local, uncommitted** in working tree; `tsc --noEmit` exits 0):
1. **`features/roadmap.md`** — `playbook-documentation` + `documentation-adoption-tracking` rows:
   `completed` → `removed`.
2. **`features/playbook-documentation.md`** — `status: removed` + `removed-note` (points to commit
   `e6f532e9` + the `~/orionfold/books` content factory; spec kept as historical record).
3. **`features/documentation-adoption-tracking.md`** — `status: removed` + `removed-note` (adoption
   heatmap lost its only consumer; underlying `settings`/usage DB tables retained).
4. **`src/lib/constants/prose-styles.ts`** — removed the now-dead `PROSE_READER_FULL` export (only
   consumer was the deleted playbook reader; verified orphaned repo-wide). This also resolves the
   stale "(playbook)" comment flagged in the prior handoff.

Downstream specs that referenced playbook-documentation as a dependency are still valid as history,
not broken: `living-book-*` (content-merge/reading-paths/markdown-pipeline),
`composed-app-kit-coach-and-ledger`, `sidebar-ia-route-restructure`.

**Browser smoke (Claude in Chrome, session 2):** `npm run dev` booted (HTTP 200 on `/`), homepage
dashboard rendered clean, **zero console errors**, sidebar confirmed to have **no "Learn"/User Guide
group** (Home/Compose/Observe/Configure only) — live confirmation Phase C left no orphaned client
imports. Server torn down after.

---

## DONE: AI Native Business book extraction → ~/orionfold/books

The book (content + authoring) is being moved OUT of this public/npm repo into the private
`~/orionfold/books` repo, so book IP stays out of the open repo + packaging. Plan:
`~/.claude/plans/let-s-plan-extracting-ai-drifting-lemur.md`.

- **Phase A ✅ (committed in books/ `cdbbc9a`, local-only):** `book/chapters` (14), `ai-native-notes`
  → `books/ainative/{chapters,notes,images}`; `book.yml` → `source.local: true`; `book-updater`
  skill moved + rewritten (sibling-path channel `$AINATIVE_REPO=~/orionfold/ainative`, stale
  `src/lib/book/*` refs removed, build gate `make BOOK=ainative all`, publish via PR to reader).
  Verified: `make all` green, epubcheck 0, manifest 14ch/4parts, round-trip + guard dry-run pass.
- **Phase B ✅ (this repo, local — NOT pushed):** de-committed `book/` + `ai-native-notes/`
  (`git rm -r --cached`, files still on disk); `.gitignore` stanza added; `npm-pack-files.test.ts`
  updated (now asserts untracked, 5/5 green); `document-writer`/`technical-writer` profiles
  generalized (book-specific authoring guidance + `ai-native-notes/` refs removed). `next.config.mjs`
  `/book`→ainative.business redirect KEPT. Historical records (`.archive/`, `features/living-book-*`,
  CHANGELOG) intentionally left as-is.
- **Phase C ✅ (books/ skill rewrite + dry-run, local):** book sync now OWNED by the books/
  `book-updater` skill (Phase 7b rewritten). Reframed model: reader repo is canonical on Spark, its
  skills run on Spark; `~/Developer/ainative-business.github.io` is a Mac read/write-via-PR clone.
  New flow = books/ writes chapters into the Mac clone's `src/data/book/chapters/` (confirmed dest)
  + `public/book/images/`, updates `src/lib/book/content.ts` wordcounts, `npm run build`, then
  branch+commit+`gh pr create` → Spark merges. **No reader-side sync skill** — the redundant
  `apply-book-update` skill (assumed a Spark local-peer source) is to be **deleted via the same PR**
  (`git rm -r .claude/skills/apply-book-update`). Dry-run verified: copying books/ chapters into the
  clone is a **0-file diff** (content byte-identical to deployed); throwaway branch discarded, clone
  left clean on main. (Reader `npm run build` fails on a PRE-EXISTING unrelated missing dep
  `asciinema-player` — needs `npm install` in that clone; NOT book-related, NOT fixed here per
  no-sibling-edits.)

**Status (2026-06-28):**
1. **ainative `origin/main`** — ✅ pushed (`50ea3e10`). Public repo confirmed clean of `book/` +
   `ai-native-notes/`.
2. **books/** — local-only git by decision (NO remote, settled — book stays Mac-only). Commits
   `cdbbc9a` (Phase A) + `f8b09e5` (Phase C) live only on this Mac; nothing to push.
3. **Reader skill deletion** — ✅ **PR #6 opened** in `orionfold/ainative-business.github.io`
   (`chore/remove-redundant-apply-book-update`) deleting the dead `apply-book-update` skill.
   Awaiting Spark merge.
4. **On-disk copies + past public history** — left as-is by decision (don't delete, don't purge).

**⏳ FOLLOW-UP (migration closure — come back to this):** the new book-sync round-trip has only
been dry-run'd (0-file content diff) — it has NOT done a real chapter-content PR yet. Closure =
on the next actual chapter update, run books/ `book-updater` Phase 7b end-to-end so
**orionfold/books creates the PR → ainative.business on Spark picks it up + merges + deploys** —
confirming the full Mac-authors → Spark-deploys path works for live content, not just the skill
deletion. Also confirm PR #6 merged on Spark.

---

## DONE (prior): Claude Code self-improvement pass — COMPLETE (S1–S5); both repos pushed; history purge = someday

**All five sessions (S1–S5) done; BOTH pushes landed (ainative + strategy).**
The public `origin/main` carries the S5 de-commit (steering files no longer tracked going forward).
The sibling `orionfold/strategy` repo is now pushed too. Only remaining item is the **history-purge
decision**, now parked as a **someday** action (no active work pending).

**Status:** clean on `main` at `73d142d8`, **fully in sync with `origin/main` (0 ahead, 0 behind)**.
Verified live: `git ls-files .claude/` → 7, steering files untracked, 25 skills on disk.

**Full approved plan:** `~/.claude/plans/read-handoff-md-it-soft-token.md`.
**Playbook + standard:** `_REFER/cc-self-improve-all-projects.md` +
`_REFER/claude-code-opus-4.8-best-practices-2026.md` (gitignored, local).

---

## What's done (S1–S5)

- **S1 ✅** (`553d217e`) — `_REFER/` reference docs (gitignored); `.claude/hooks/secrets-guard.py`
  (executable, PreToolUse guard). 5/5 fixtures verified.
- **S2 ✅** (`553d217e`) — committed `.claude/settings.json`: model pin `claude-opus-4-8`; 15 allow
  / 5 ask / 3 deny rules; 4 plugins disabled; secrets-guard hook wired via `$CLAUDE_PROJECT_DIR`.
- **S3 ✅** (`a0b532d5`, local-only) — pruned `.claude/settings.local.json` 326 → 117 allow rules.
- **S4 ✅** (`a0b532d5`) — `strategy/ainative/` committed in private `orionfold/strategy` repo
  (commit `39e0f90` there, **not pushed**); `_IDEAS` symlink + `CLAUDE.local.md` (4 operator
  policies), both gitignored in ainative.
- **S5 ✅** (`b1c3b3d0`, local-only) — **surgical de-commit of dev-time steering from the PUBLIC
  ainative repo.** Scoped `.gitignore` block (`/CLAUDE.md /AGENTS.md /MEMORY.md /FLOW.md` +
  `.claude/{skills,plans,reference,agents,commands,rules,hooks}/`); `git rm -r --cached` untracked
  341 paths (files stay on disk). **`git ls-files .claude/` dropped 344 → 7** (only the 5
  `apps/starters/*.yaml` + `settings.json` + `.claude/.gitignore` remain tracked). 0 files deleted
  from disk. `starters.test` green (10/10). Product-safety re-verified: npm `files` never included
  `.claude/`; SDK reads end-user cwd; starters loader resolves a filesystem path needing only the
  YAMLs on disk.

---

## Outstanding pushes — ✅ ALL DONE

1. **ainative `origin/main`** — ✅ **DONE.** All commits pushed; local `73d142d8` == `origin/main`.
   The S5 de-commit (`b1c3b3d0`) is live on the public remote — it stopped the public repo from
   carrying the steering files going forward.
2. **`orionfold/strategy` `origin/main`** — ✅ **DONE (2026-06-28).** Strategy channel pushed,
   including the history-purge backlog item (`ainative/_SPECS/backlog.md`).

## Pre-push sanity (re-run right before pushing, optional but cheap)
- `git ls-files .claude/` → expect 7 (`.gitignore`, 5 `apps/starters/*.yaml`, `settings.json`).
- `git ls-files CLAUDE.md AGENTS.md MEMORY.md FLOW.md` → expect EMPTY.
- `ls .claude/skills | wc -l` → still ~25 on disk (nothing deleted).
- `npx vitest run src/lib/apps/__tests__/starters.test.ts` → 10/10 green.

## `_SPECS` strategy channel (added this session — `6df89f0b`)
The history-purge / repo-privatization decision (previously only an "out of scope" note) was queued
as a written backlog item. It lives in the **private** `orionfold/strategy` repo at
`ainative/_SPECS/backlog.md`, surfaced in the public repo via a gitignored relative symlink
`_SPECS -> ../strategy/ainative/_SPECS` (same pattern as `_IDEAS -> ../strategy/ainative/_IDEAS`).
The public ainative repo tracks ONLY the `.gitignore` stanza — never the symlink or its content.
Pattern memorized: `memory/strategy-channel-symlink-pattern.md`.

## Meta-harness safety (VERIFIED SAFE — recorded for confidence)
The shipped product reads CLAUDE.md / `.claude/skills` relative to the *end user's* cwd / `~/.ainative`,
NOT this dev repo. npm `files` already excludes `.claude/`. Gitignoring dev-repo steering does NOT
break the product. The ONE exception — `.claude/apps/starters/*.yaml` (homepage seed data) — was kept
tracked, confirmed by the 344 → 7 ls-files result above.

## Someday (parked — no active work; operator will revisit if/when it matters)
- **History purge / repo-privatization of already-published steering files.** S5 only stopped
  *future* commits; the steering files (CLAUDE.md, skills, plans, etc.) already in *past* public git
  history remain there. Three options if ever revisited: **history-purge** (rewrite git history),
  **privatize** the repo, or **accept** the published history as-is. Backlog detail lives in the
  private strategy repo at `ainative/_SPECS/backlog.md` (now pushed). **Parked as someday — do not
  act without explicit operator go-ahead.**

## Out of scope (record, don't do)
- Global personal-skill cull. Relocating starters out of `.claude/`. New skills.
- Note (pre-existing, unrelated to S5): published-npx starters rely on `.claude/apps/starters/`
  existing at the package root, but `.claude/` is in neither npm `files` nor the bin/cli.ts hoist
  list. The loader degrades gracefully (`if (!fs.existsSync(dir)) return []`). Untracking did not
  change this either way; flagged only so it isn't mistaken for an S5 regression.
