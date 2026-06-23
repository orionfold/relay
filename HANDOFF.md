# Handoff: Claude Code self-improvement pass — Session 5 (the public de-commit) remaining

**Updated:** 2026-06-23. Sessions 1–4 complete. Prior handoff (the full 5-session plan, before
S3/S4 landed) is captured in commit messages `553d217e` (S1+S2) and `a0b532d5` (S3+S4).

**Status:** clean on `main` at `a0b532d5`, **not yet pushed** to `origin/main` (S1–S4 commits are
local — push is operator-gated; see below). Only **Session 5** of the pass remains, and it was
**deliberately deferred** to a separate, careful session because it is the highest-blast-radius
step and affects the PUBLIC repo.

**Full approved plan:** `~/.claude/plans/read-handoff-md-it-soft-token.md`.
**Playbook + standard:** `_REFER/cc-self-improve-all-projects.md` +
`_REFER/claude-code-opus-4.8-best-practices-2026.md` (gitignored, local).

---

## What's done (S1–S4)

- **S1 ✅** (`553d217e`) — `_REFER/` reference docs (gitignored); `.claude/hooks/secrets-guard.py`
  (executable, PreToolUse guard). 5/5 fixtures verified.
- **S2 ✅** (`553d217e`) — committed `.claude/settings.json`: model pin `claude-opus-4-8`; 15 allow
  / 5 ask / 3 deny rules; 4 plugins disabled (`stripe`/`agent-sdk-dev`/`ralph-loop`/
  `session-report`); secrets-guard hook wired via `$CLAUDE_PROJECT_DIR`.
- **S3 ✅** (`a0b532d5`, local-only) — pruned `.claude/settings.local.json` 326 → 117 allow rules
  (dead `/Developer/stagent/*` paths, one-off PIDs/cp/sed, shell fragments removed; deduped vs
  committed baseline; dropped broad `Bash(git:*)`). Still gitignored + valid JSON.
- **S4 ✅** (`a0b532d5`) — `strategy/ainative/` (`_RELAY.md` + `_IDEAS/`) committed in the **private**
  `orionfold/strategy` repo (commit `39e0f90` there, **not pushed**). In ainative: `_IDEAS ->
  ../strategy/ainative/_IDEAS` symlink (resolves); `CLAUDE.local.md` with the 4 operator workflow
  policies; both gitignored. Verified: symlink resolves, `git check-ignore` lists all three,
  nothing tracked except the `.gitignore` edit.

## Outstanding pushes (operator-gated — nothing has left a remote yet)
- ainative `origin/main`: commits `553d217e` + `a0b532d5` are local-only. Push when ready.
- `orionfold/strategy` `origin/main`: commit `39e0f90` (ainative channel) is local-only. Push when ready.

---

## Session 5 — Surgical de-commit (REMAINING; highest blast radius; operator approval before push)

**Goal:** stop publishing the dev-time secret sauce to the PUBLIC ainative repo, without deleting
anything from disk or breaking the homepage starters.

1. Add to root `.gitignore`, scoped precisely (KEEP `.claude/apps/starters/` TRACKED):
   ```
   # Secret sauce — dev-time CC/Codex steering, held back for the paid model.
   # NOT product runtime deps (SDK reads end-user cwd, not this repo). Kept local on disk.
   /CLAUDE.md
   /AGENTS.md
   /MEMORY.md
   /FLOW.md
   .claude/skills/
   .claude/plans/
   .claude/reference/
   .claude/agents/
   .claude/commands/
   .claude/rules/
   .claude/hooks/
   # KEEP TRACKED (product seed data the homepage renders): .claude/apps/starters/
   ```
   (`/CLAUDE.local.md` is already gitignored from S4 — don't double-add.)
2. `git rm -r --cached` the now-ignored tracked paths. **DOUBLE-CHECK `.claude/apps/starters/` is
   EXCLUDED from the `rm`** so product seed data stays tracked. Files stay on disk (--cached only).
3. **Verify before any push:** starters test green; homepage renders 5 starters
   (`src/lib/apps/starters.ts:40-47`); `git ls-files .claude/` drops ~342 → ~6 (only
   `apps/starters/*` + maybe `settings.json`/`.gitignore`); `ls .claude/skills` still shows files
   on disk (nothing deleted).
4. **STOP and get operator approval before `git push`.**

## Meta-harness safety (VERIFIED SAFE — recorded for confidence)
The shipped product reads CLAUDE.md / `.claude/skills` relative to the *end user's* cwd / `~/.ainative`
(`claude-agent.ts:614,628`, `profiles/registry.ts:35,408`), NOT this dev repo. npm `files` already
excludes `.claude/`. Gitignoring dev-repo steering does NOT break the product. The ONE exception is
`.claude/apps/starters/*.yaml` (homepage seed data) → must stay tracked.

## Gotchas
- The S5 `.gitignore` edit will trip the auto-mode classifier? No — `.gitignore` isn't a permissions
  file. But the `git rm --cached` + push are the consequential steps; keep them operator-visible.
- Hook activation: secrets-guard already active (S2 verified live). No restart needed.
- Don't re-add `/CLAUDE.local.md` or `_IDEAS`/`_REFER` to `.gitignore` in S5 — already there.

## Out of scope (record, don't do)
- Global personal-skill cull. Relocating starters out of `.claude/`. New skills.
- Repo-privatization / history purge of already-published secret sauce (separate decision; this pass
  only stops *future* commits).
