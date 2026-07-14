---
title: Instance Bootstrap & Branch Guardrails
status: completed
priority: P1
milestone: post-mvp
source: features/architect-report.md
dependencies: []
---

# Instance Bootstrap & Branch Guardrails

## Description

ainative is a self-modifying dev environment — every git-clone user customizes their checkout via ainative chat itself. To make that customization safe, the first time a clone boots we need to establish branch discipline: user customizations must live on a dedicated local branch (never on `main`), and the clone must block accidental pushes of that branch to the public origin. This foundation is required for both single-clone users and multi-instance power users (wealth/investor/growth-style private instances).

This feature delivers the idempotent first-boot installer that runs from `src/instrumentation.ts` alongside scheduler startup. It detects clone type (`.git` present, not in dev mode, `AINATIVE_DATA_DIR` maybe overridden), generates a stable `instanceId`, creates a `local` branch if the user is on clean `main`, installs a pre-push hook, and writes per-branch `pushRemote = no_push` config. All steps are idempotent and safe to run every boot.

No new database tables. All state lives in the existing `settings` key-value table as JSON-in-TEXT (keys: `instance`, `instance.guardrails`). This preserves zero migration cost and makes `clearAllData()` trivially correct since `settings` is already preserved.

## User Story

As a ainative end user who just cloned the repo and is about to make my first customization via chat, I want ainative to automatically protect me from accidentally pushing my private changes to the public origin and from losing my work during future upgrades, so that I can focus on using ainative to build my app without worrying about git hygiene.

## Technical Approach

**New module:** `src/lib/instance/` directory containing:

- `types.ts` — TypeScript interfaces for `InstanceConfig`, `Guardrails` (structure defined in architect report)
- `settings.ts` — read/write helpers for `settings.instance` and `settings.instance.guardrails` rows, using existing settings table patterns
- `detect.ts` — clone-type detection with **layered dev-mode gates** (all of the following cause bootstrap to no-op):
  1. `process.env.AINATIVE_DEV_MODE === "true"` (primary gate — per-developer, set in `.env.local`)
  2. `.git/ainative-dev-mode` sentinel file exists (secondary gate — git-dir-scoped, never cloned, persists across `.env.local` changes)
  3. `.git` directory absent (non-git runtime like `npx`)
  
  **Override:** `process.env.AINATIVE_INSTANCE_MODE === "true"` forces bootstrap to run even in dev mode, so contributors can test this feature in the main repo. Opt-in beats opt-out.
  
  Also computes `isPrivateInstance` from `AINATIVE_DATA_DIR` comparison to default `~/.ainative` (used by license metering, does not affect bootstrap behavior).
- `fingerprint.ts` — machine fingerprint generator: `os.hostname() + os.userInfo().username + sha256(primary network MAC)` → stable per machine, not personally identifying (used by the license metering feature)
- `git-ops.ts` — thin wrapper around Node's `execFileSync` from `node:child_process`, with strict argument arrays, no shell interpolation (never uses the shell-invoking variant). Exports typed helpers like `getCurrentBranch()`, `getCommitsAhead(base)`, `createBranch(name)`, `configSet(key, value)`. Injectable for unit tests.
- `bootstrap.ts` — the orchestrator with idempotent `ensureInstance()` function. **Two-phase execution to protect against workflow damage:**

  **Phase A — Non-destructive (runs on first boot without consent):**
  - `ensureInstanceConfig()` — generates `instanceId` UUID on first call, persists to settings
  - `ensureLocalBranch()` — if a branch named `local` does not already exist, runs `git checkout -b local` **at the current HEAD** (regardless of whether HEAD is on `main`, or whether `main` has drifted from `origin/main`). This is non-destructive: `git checkout -b` does not modify any existing branch. If already on `local` or any non-main branch and `local` doesn't exist, creates `local` at current HEAD and stays on current branch. Records the "instance branch" in settings as `local` if it was created, or the user's current branch if they were already on something non-default.

  **Phase B — Destructive (requires explicit consent):**
  - `ensurePrePushHook()` — writes `.git/hooks/pre-push`, backs up any existing non-ainative hook
  - `ensureBranchPushConfig()` — sets `branch.<name>.pushRemote` to `no_push` for each blocked branch

  Phase B only runs if `settings.instance.guardrails.consentStatus === "enabled"`. First boot creates a pending notification: **"Protect this clone from accidental origin pushes? This will install a pre-push hook and block direct origin pushes on your instance branch."** with three actions: `[Enable guardrails]`, `[Not now]` (re-prompts next boot), `[Never on this clone]` (permanently skip). User's choice is persisted.
  
  On subsequent boots: if consent is `enabled`, Phase B runs idempotently; if `declined_permanently`, Phase B is skipped silently; if `not_yet`, notification re-appears.
- `hooks/pre-push.sh` — hook template with `AINATIVE_HOOK_VERSION` marker comment, `ALLOW_PRIVATE_PUSH=1` escape hatch. The hook reads the blocked branch list from `settings.instance.branchName` via a bounded `sqlite3` query with a hardcoded SQL string (no user input reaches the shell).

**Integration point:** `src/instrumentation.ts` — add `await ensureInstance()` call before scheduler startup. Boot order matters: instance config must exist before scheduler reads it.

**Security note on git invocations:** All git calls use `execFileSync("git", [...args])` from `node:child_process`. The first argument is always the literal string `"git"`; user-provided values (branch names, config keys) pass through the argv array, which does not invoke a shell. We never concatenate strings to build a command line, and we never use the shell-invoking variant. Failures are caught and logged to `agent_logs` with `source='instance-bootstrap'`; bootstrap failure must never break app startup.

**Testing:** unit-testable against a temp-dir git repo. Factor all filesystem and git operations through an injectable `GitOps` interface so tests can mock them. Test matrix:

*Bootstrap happy paths:*
- Fresh clone on `main` with zero local commits, consent=enabled → creates `local` branch AND installs hook AND sets pushRemote
- Fresh clone on `main`, consent=not_yet → creates `local` branch, does NOT install hook, emits consent notification
- Fresh clone on `main`, consent=declined_permanently → creates `local` branch only, silently skips Phase B
- Clone already on `local` branch → `ensureLocalBranch` no-op
- Clone with local commits on `main` (pre-existing user customizations) → creates `local` at current HEAD (non-destructive), `main` still points at user's HEAD
- Pre-push hook missing, consent=enabled → installs
- Pre-push hook present with ainative marker → no-op (version check)
- Pre-push hook present without marker, consent=enabled → backs up, installs ours
- Rebase in progress (`.git/rebase-merge` exists) → skips branch creation, logs warning, does not run Phase B

*Dev-mode skip paths (all must result in zero filesystem/git mutations):*
- `AINATIVE_DEV_MODE=true` env var set → all phases are no-ops
- `.git/ainative-dev-mode` sentinel file present → all phases are no-ops
- Both set → all phases are no-ops
- `AINATIVE_DEV_MODE=true` AND `AINATIVE_INSTANCE_MODE=true` → override wins, bootstrap runs normally
- `.git/ainative-dev-mode` present AND `AINATIVE_INSTANCE_MODE=true` → override wins, bootstrap runs normally

*Generalization test (single-clone user on default data dir):*
- `AINATIVE_DATA_DIR` unset (default `~/.ainative`) → `isPrivateInstance=false`, bootstrap runs identically, `local` branch created, guardrails flow identical to private-instance case

**Important edge cases:**
- Filesystem read-only (sandbox mode) — all writes must fail gracefully, not crash startup
- User has `worktree` setups — `git rev-parse --git-common-dir` vs `--git-dir` detection from `bin/sync-worktree.sh` is reusable
- Private instance detection based on `AINATIVE_DATA_DIR` — don't fail if user aliased default path

## Acceptance Criteria

*Core functionality:*
- [ ] `src/lib/instance/bootstrap.ts` exports `ensureInstance()` that runs Phase A unconditionally, runs Phase B only if consent is enabled, tolerates individual failures, returns a result object indicating what ran
- [ ] First call generates a stable `instanceId` UUID and writes it to `settings.instance` JSON
- [ ] Subsequent calls detect existing `instanceId` and do not regenerate it
- [ ] First call creates a `local` branch **at current HEAD** (not necessarily at `origin/main`), regardless of whether user has local commits on `main`
- [ ] Creating `local` does not modify, delete, or reset the user's `main` branch — verified by SHA comparison before/after
- [ ] `ensureInstance()` called a second time is a full no-op (verified by mtime-check on all written files)

*Dev-mode gates (safety-critical — must all pass to prevent breaking the main dev repo):*
- [ ] Called with `AINATIVE_DEV_MODE=true` → zero filesystem mutations, zero git config changes, zero branch creation, returns `{skipped: "dev_mode_env"}`
- [ ] Called with `.git/ainative-dev-mode` sentinel file present → zero mutations, returns `{skipped: "dev_mode_sentinel"}`
- [ ] Called with `AINATIVE_DEV_MODE=true` AND `AINATIVE_INSTANCE_MODE=true` → override wins, bootstrap runs normally (opt-in beats opt-out)
- [ ] Called with no `.git` directory present → returns `{skipped: "no_git"}`, no errors
- [ ] Test explicitly covers the ainative main dev repo scenario: temp-dir with a `.env.local` containing `AINATIVE_DEV_MODE=true` → `ensureInstance()` makes no changes
- [ ] Pre-ship checklist item (verified manually before merge): `AINATIVE_DEV_MODE=true` added to `Relay development checkout/.env.local` AND documented in `AGENTS.md` + `CLAUDE.md`

*Consent flow:*
- [ ] First boot with no existing consent → Phase A runs, Phase B skipped, notification created with 3 actions
- [ ] Consent=`enabled` → Phase B runs, pre-push hook installed, pushRemote configured
- [ ] Consent=`not_yet` → Phase B skipped, notification re-appears on next boot
- [ ] Consent=`declined_permanently` → Phase B permanently skipped, no notification
- [ ] User selecting "Enable guardrails" from notification persists `consentStatus=enabled` and triggers Phase B immediately
- [ ] User selecting "Never on this clone" persists `consentStatus=declined_permanently`

*Guardrails (once consent is granted):*
- [ ] Pre-push hook file at `.git/hooks/pre-push` exists, is executable, contains the `AINATIVE_HOOK_VERSION` marker
- [ ] Pre-existing non-ainative `pre-push` hook is backed up to `pre-push.ainative-backup`, warning logged
- [ ] `git config branch.local.pushRemote` returns `no_push`
- [ ] Attempting `git push origin local` is rejected by the hook unless `ALLOW_PRIVATE_PUSH=1` is set

*Single-clone user generalization (explicit test):*
- [ ] Test scenario: `AINATIVE_DATA_DIR` unset → `isPrivateInstance=false` → bootstrap runs identically → `local` branch created → same consent flow → guardrails work identically
- [ ] Test scenario: user has existing commits on `main` from prior ainative usage → `local` branch created at current HEAD → `main` still points at user's HEAD → no commits lost

*Edge cases:*
- [ ] Called with `.git/rebase-merge` present → `ensureLocalBranch` skips with warning log, does not crash
- [ ] Call from `src/instrumentation.ts` happens before scheduler startup; failure does not crash app boot
- [ ] All git invocations use `execFileSync` with argv arrays, no shell interpolation; code review checklist item added
- [ ] Unit tests cover every row in the test matrix using an injectable `GitOps` mock
- [ ] Integration test verifies `ensureInstance()` is idempotent across multiple calls in the same process

## Scope Boundaries

**Included:**
- The `src/lib/instance/` module with all sub-files listed above
- Pre-push hook template and installation logic
- Per-branch `pushRemote = no_push` configuration
- `instanceId` generation and persistence in `settings` table
- Machine fingerprint generator (used by license metering feature)
- Integration into `src/instrumentation.ts` boot sequence
- Unit tests with injectable `GitOps` mock covering the 8-scenario test matrix

**Excluded:**
- Upgrade availability polling or badge (deferred to `upgrade-detection`)
- The upgrade-assistant agent profile or merge session UI (deferred to `upgrade-session`)
- Cloud-side license seat counting or `(email, machineFingerprint, instanceId)` tuple validation (deferred to `instance-license-metering`)
- Settings page UI surfacing `instanceId`, branch name, guardrail status (deferred to `upgrade-session`'s settings surface)
- Scheduled polling task registration (deferred to `upgrade-detection`)
- Multi-instance listing, switching, or presets (not planned for this scope — see architect report "NOT in Scope")

## References

- Source: `features/architect-report.md` — Integration Design section, specifically "First-Boot & Guardrail Installer" and "Data Model Design"
- Related features: unblocks `upgrade-detection`, `upgrade-session`, `instance-license-metering`
- Design pattern: follows TDR-009 (idempotent bootstrap) for boot-time setup
- Memory: `memory/shared-ainative-data-dir.md` — prior art on `AINATIVE_DATA_DIR` isolation
- Local doc: `PRIVATE-INSTANCES.md` (root, gitignored) — runbook this feature automates
