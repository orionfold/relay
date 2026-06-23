# Handoff: Claude Code self-improvement pass (Opus 4.8 alignment)

**Created:** 2026-06-23. Prior handoff (F9/F10/Phase-5 `@0.14.3` release) archived at
`.archive/handoff/2026-05-08-f9-f10-phase5-published.md`.

**Status:** clean on `main` at `d34d797e`, pushed to `origin/main`. Returning to the project after
a gap; now on Opus 4.8. This session researched and **approved** a 5-session plan to align the
project's Claude Code setup with current best practices, replicating the `orionfold-proof` pass.

**Full approved plan:** `~/.claude/plans/read-handoff-md-it-soft-token.md`.
**Playbook + standard:** `_REFER/cc-self-improve-all-projects.md` +
`_REFER/claude-code-opus-4.8-best-practices-2026.md` (seeded in Session 1 below).

---

## Two ainative-specific forces (why this differs from orionfold-proof)

1. **Paid-model shift.** Repo is **PUBLIC** today; every commit of `.claude/skills/`, `CLAUDE.md`,
   steering publishes the "secret sauce." Moving to paid + selective OSS → stop committing it,
   keep as gitignored local files (orionfold-website pattern).
2. **Meta-harness coupling — VERIFIED SAFE.** The shipped product reads CLAUDE.md / `.claude/skills`
   relative to the *end user's* cwd / `~/.ainative` (`claude-agent.ts:614,628`,
   `profiles/registry.ts:35,408`), NOT this dev repo. npm `files` already excludes `.claude/`.
   Keeping dev-repo steering local-only does NOT break the product. **One exception:**
   `.claude/apps/starters/*.yaml` IS product seed data the homepage renders
   (`src/lib/apps/starters.ts:40-47`) → must stay tracked. De-commit is **surgical**, not blanket.

## Decisions (operator-confirmed)
- Secrets hook: adapt orionfold-proof `secrets-guard.py` for ainative keys.
- New committed `.claude/settings.json` + prune dead `stagent`-path entries from `settings.local.json`.
- Disable plugins (this project): `stripe`, `ralph-loop`, `session-report`, `agent-sdk-dev`.
- Surgical de-commit (keep `.claude/apps/starters/`). Strategy channel at `~/orionfold/strategy/ainative/`.

---

## Work breakdown — session by session (`/clear` between; ascending blast radius)

- [ ] **Session 1 — Reference docs + secrets-guard hook (low risk, additive)**
  1. Create `_REFER/`; copy the 3 docs from `orionfold-proof/_REFER/`; add `_REFER/` to `.gitignore`.
  2. Create `.claude/hooks/secrets-guard.py` (adapt orionfold-proof; tune BLOCKED msg + ainative keys); `chmod +x`.
  3. Verify: 5 hand-run fixtures block/allow correctly (show stderr evidence).

- [x] **Session 2 — Curated committed `.claude/settings.json` + plugin disables — DONE 2026-06-23**
  - Created `.claude/settings.json` (untracked, NOT gitignored → tracked on commit): model pin
    `claude-opus-4-8`; 15 allow rules (npm dev/build/test, npx vitest/tsc/next, drizzle-kit generate,
    sqlite3, git status/diff/log/add/commit); 5 ask rules (git push, npm install/publish,
    drizzle-kit push, brew install); deny `Read(.env*)`; 4 plugins disabled
    (`stripe`/`agent-sdk-dev`/`ralph-loop`/`session-report`@claude-plugins-official); PreToolUse hook
    wired with matcher `Write|Edit|Bash` via `$CLAUDE_PROJECT_DIR`.
  - **Verified:** JSON parses; hook **activated mid-session** (no restart needed — CC re-reads on file
    change; my own `git add .env.local` test string got blocked live); 5/5 fixtures block/allow correct
    (real key BLOCK, process.env ALLOW, placeholder ALLOW, `git add .env` BLOCK, npm test ALLOW); deny
    rule confirmed safe (no src file reads `.env.local` via fs — runtime uses `process.env`).

- [ ] **Session 3 — Prune stale `settings.local.json` (local-only hygiene)**
  - Drop dead `/Developer/stagent/...` path rules + one-off kills/cps; keep generic patterns; dedup vs settings.json.
  - Verify JSON parses.

- [ ] **Session 4 — Strategy channel + gitignored `CLAUDE.local.md`**
  - In `~/orionfold/strategy` repo: create `strategy/ainative/` (`_RELAY.md` + `_IDEAS/`), commit there.
  - In ainative: symlink `_IDEAS` → strategy; gitignore the target. Write `CLAUDE.local.md` with the 4 operator
    workflow policies. Verify symlink resolves + files untracked.

- [ ] **Session 5 — Surgical de-commit (highest blast radius; operator approval before push)**
  - Add surgical secret-sauce ignores to `.gitignore` (KEEP `.claude/apps/starters/`); `git rm -r --cached` the
    ignored tracked paths (files stay on disk). Verify: starters test green, homepage renders 5 starters,
    `git ls-files .claude/` drops 342 → ~6, nothing deleted from disk. Operator approval before push.

## Out of scope (record, don't do)
- Global personal-skill cull (multi-project rule). Relocating starters out of `.claude/`. New skills.
- Repo-privatization / history purge of already-published secret sauce (separate decision; this pass
  only stops *future* commits).

## Gotchas for whoever executes
- The hook only activates on **session restart** — verify after restart, not in the same session.
- The `Read(.env*)` deny must NOT break dev flows; ainative reads env via `process.env` at runtime,
  not via Claude's `Read` tool, so it should be safe — confirm in Session 2.
- Session 5's `git rm --cached` removes from the index only; double-check `.claude/apps/starters/` is
  excluded from the `rm` so product data stays tracked.
