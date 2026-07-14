---
title: Guided Upgrade Session (Merge in Chat)
status: in-progress
priority: P1
milestone: post-mvp
source: features/architect-report.md
dependencies: [instance-bootstrap, upgrade-detection, agent-integration, agent-profile-catalog]
---

> **Partially shipped (~60%) per Tier 2 Ship Verification 2026-05-03.** **Done:** `upgrade-assistant` profile + SKILL.md with merge sequence + Bash allowlist; 5 instance API routes (`/api/instance/init,config,upgrade,...`); UpgradeBadge dialog showing branch + commits-behind + data dir; InstanceSection in `/settings` with "Check for upgrades" + "Repair setup" + dev-mode skip. **Still missing:** dedicated upgrade-session-view.tsx (currently re-uses generic `/tasks/[id]`); upgrade history list (only shows `lastUpgrade` timestamp); abort confirmation dialog with rollback; "Restart dev server" success banner; integration tests on temp-dir clone. Roughly the back half of the UX spec is unbuilt.

# Guided Upgrade Session (Merge in Chat)

## Description

When a user decides to pull in upstream ainative changes, clicking the "Upgrade" badge should not dump them into a raw `git merge` conflict with no guidance. This feature delivers a guided, conversational upgrade experience: a pre-flight modal explaining what will happen, then a dedicated session where a Claude agent (the `upgrade-assistant` profile) runs the merge sequence step by step, surfaces conflicts as interactive prompts ("keep mine / take theirs / show me the diff"), and restarts the dev server on completion.

The critical architectural choice: the upgrade session runs as a **task**, not a chat conversation. Chat tools are DB-only by design (TDR-024) and cannot shell out. Tasks already have Bash tool access via `claude-agent.ts`, `canUseTool` approval caching (TDR-015), and SSE log streaming — 100% reuse. The "Upgrade Session" UI is a dressed-up task detail view with the existing `AgentLogsView` and `PendingApprovalHost` components, shown inside a sheet overlay that feels chat-like.

The `upgrade-assistant` profile ships as a builtin skill directory under `src/lib/agents/profiles/builtins/upgrade-assistant/`. Its SKILL.md encodes the exact merge sequence from `PRIVATE-INSTANCES.md` (stash → checkout main → merge origin/main → checkout instance branch → merge main → npm install if package-lock changed → stash pop → restart). Its profile.yaml declares a tight allowlist of git commands, limiting blast radius.

This feature also delivers the Settings → Instance surface showing `instanceId`, branch name, guardrail status, and upgrade history.

## User Story

As a ainative end user who sees an "Upgrade Available" badge, I want to click it, read a clear explanation of what will happen, confirm, and then be walked through any merge conflicts by an agent that knows my instance branch and data directory, so that I can safely pull in upstream improvements without becoming a git expert.

## Technical Approach

**New profile:** `src/lib/agents/profiles/builtins/upgrade-assistant/` containing:

- `profile.yaml` — Bash tool allowlist: `Bash(git fetch *)`, `Bash(git status)`, `Bash(git stash *)`, `Bash(git checkout *)`, `Bash(git merge *)`, `Bash(git commit *)`, `Bash(git diff *)`, `Bash(git rev-parse *)`, `Bash(git log *)`, `Bash(git merge --abort)`, `Bash(npm install)`, plus `Read` and `Write` for conflicted files. No other tools.
- `SKILL.md` — system prompt encoding the merge sequence, conflict resolution language, abort-on-failure behavior, and these crucial rules:
  1. "You are upgrading branch `{{INSTANCE_BRANCH}}` with commits from `main`. Never modify `main` directly. Never push any branch."
  2. "If a step fails, run `git merge --abort` and `git stash pop` before reporting the error."
  3. "If `main` has local commits not in `origin/main` (check with `git rev-list origin/main..main`), stop and ask the user: 'Your `main` branch has N commits that aren't in `origin/main`. This is unusual for a private instance. Want me to move them to `{{INSTANCE_BRANCH}}` and reset `main` to match `origin/main`, or abort so you can review?' — do not proceed without explicit user decision."
  4. "If the user's instance branch is `local` (single-clone case), treat it identically to a named branch like `wealth-mgr` — same merge flow, same safety rules."
  
  Template placeholders `{{INSTANCE_BRANCH}}` and `{{COMMITS_BEHIND}}` are interpolated at task creation from `settings.instance` values.

**New API routes:**

- `POST /api/instance/upgrade` → 202 Accepted. Creates a `tasks` row with `agentProfile='upgrade-assistant'`, `sourceType='manual'`, `title="Upgrade <branch> with N upstream commits"`, description including the current instance config as context. Returns `{taskId}`. Fire-and-forget per TDR-001.
- `POST /api/instance/init` → 200. Idempotent manual re-run of `ensureInstance()` from `instance-bootstrap`. Useful if initial boot failed or user wants to re-apply guardrails.
- `GET /api/instance/config` → 200. Returns current `InstanceConfig` + `Guardrails` + `UpgradeState` as one response. Used by Settings → Instance section.

**New UI components:**

- `src/components/instance/upgrade-modal.tsx` — educational pre-flight dialog (Client Component). Shows commits-behind count, branch name, data directory, last successful upgrade time, estimated changes summary. Two buttons: **Start Upgrade** (POSTs to `/api/instance/upgrade`, navigates to session view) and **Cancel**. Uses existing `Dialog` primitive from shadcn.
- `src/components/instance/upgrade-session-view.tsx` — the live session UI. Renders in a right-side sheet overlay. Composed of existing components: task header (title, status, started-at), `AgentLogsView` for the streaming git command output, `PendingApprovalHost` for merge-conflict prompts. No new streaming infrastructure. On task completion, shows a "Dev server restart required" notice with a one-click restart button.
- `src/components/settings/instance-section.tsx` — new section in Settings page. Uses existing `DetailPane`, `SectionHeading`, `StatusChip`. Shows: instanceId, branch name, data dir, guardrail status (hook installed, branches protected), upgrade history (last 5 upgrade tasks as a small list with status chips). Includes "Check for upgrades now" button and "Re-run instance setup" button.

**System prompt injection strategy:** the `upgrade-assistant` profile's SKILL.md contains template placeholders like `{{INSTANCE_BRANCH}}`, `{{COMMITS_BEHIND}}`. When creating the task, the API route reads `settings.instance` + `settings.instance.upgrade` and interpolates these into the task description. The agent system prompt is derived from SKILL.md per TDR-007, so context flows naturally.

**Conflict resolution UX:** when the agent encounters a merge conflict, it runs `git status` and `git diff <conflicted-file>`, summarizes the conflict, then uses `canUseTool` to ask the user one of three canonical choices: "keep my version", "take main's version", "show me the full diff". User's response comes back through the existing notification → response flow. The agent then runs the appropriate `git checkout --ours` / `git checkout --theirs` / no-op (user edits manually). This reuses 100% of the pending-approval infrastructure.

**Abort path:** every upgrade task has an "Abort" button in the session view. Clicking Abort sends a cancellation signal to the running task; the agent's system prompt instructs it to run `git merge --abort` and `git stash pop` on cancellation before exiting. Task status becomes `cancelled`.

**Critical UX decisions resolved by `/frontend-designer` UX Recommendation (2026-04-07):**
- Session view: **right-side Sheet overlay** (not full page) — user can glance back at app while running; matches existing task detail pattern
- Pre-flight copy: **educational, non-urgent tone** ("Upgrade available" not "New version!"); "Start upgrade" CTA not "Install"
- Conflict choices: **3-card cluster** (Keep mine / Take theirs / Show diff) inside existing PendingApprovalHost; each card has short explanation
- Restart notice: **success banner inside the session sheet** (not toast, not modal) with explicit "Restart dev server" button; keeps user in session context
- Settings → Instance: **DetailPane with labeled rows** following existing settings section density

See "UX Specification" section below for full interaction detail.

## Acceptance Criteria

- [ ] `src/lib/agents/profiles/builtins/upgrade-assistant/profile.yaml` exists with the exact Bash command allowlist above
- [ ] `src/lib/agents/profiles/builtins/upgrade-assistant/SKILL.md` contains the merge sequence, conflict language, and abort rule with `{{INSTANCE_BRANCH}}` and `{{COMMITS_BEHIND}}` template placeholders
- [ ] On first boot, the profile is distributed to `~/.claude/skills/upgrade-assistant/` per TDR-007 profile distribution pattern
- [ ] `POST /api/instance/upgrade` creates a task row with the correct profile, interpolates instance context into description, returns 202 with taskId
- [ ] `POST /api/instance/init` idempotently re-runs `ensureInstance()` and returns the updated config
- [ ] `GET /api/instance/config` returns `InstanceConfig + Guardrails + UpgradeState` in one response
- [ ] Clicking the upgrade badge opens the upgrade modal showing commits-behind, branch name, data dir, last upgrade time
- [ ] Clicking "Start Upgrade" creates the task and navigates to the upgrade session view
- [ ] Upgrade session view renders in a right-side sheet overlay using existing sheet primitive with proper padding (`px-6 pb-6` on body — SheetContent gotcha from MEMORY.md)
- [ ] Session view shows live git command output via existing `AgentLogsView` SSE stream
- [ ] Merge conflicts surface as pending approvals via existing `PendingApprovalHost` with three-choice prompt
- [ ] "Abort" button cancels the task and the agent runs `git merge --abort` + `git stash pop` before exiting
- [ ] On successful completion, session view shows a "Dev server restart required" notice
- [ ] Settings page has new "Instance" section showing instanceId, branch, data dir, guardrail status, last 5 upgrade tasks
- [ ] Settings → Instance has working "Check for upgrades now" button that force-runs the poller
- [ ] Settings → Instance has "Re-run instance setup" button that hits `/api/instance/init`
- [ ] Task execution uses `canUseTool` approval caching so users are not prompted for every git command individually (cached per session)
- [ ] The upgrade task's Bash calls respect the profile's allowlist — any command outside the list is rejected with a clear error
- [ ] Unit tests cover API route creation, profile interpolation, abort path
- [ ] Integration test: simulate an upstream commit, run the full upgrade flow in a temp-dir clone, assert branch state and settings after completion
- [ ] UX review by `/frontend-designer` completed and incorporated before frontend implementation begins
- [ ] Pre-flight modal copy matches UX Specification exactly (headline "Upgrade available", body paragraph, "Start upgrade" CTA, "Cancel" secondary)
- [ ] Modal fact panel shows: branch name, data dir, commits-behind count, last successful upgrade timestamp
- [ ] Session sheet header shows status line with elapsed time: `"Upgrading <branch> · 00:12"` + StatusChip
- [ ] Session sheet body has `role="log" aria-live="polite"` for screen reader announcements of streaming output
- [ ] Conflict prompt renders as 3-card cluster with `role="radiogroup"` and labeled cards (keyboard-navigable)
- [ ] Conflict cards show file path prominently, agent-written conflict summary above cards, three choice labels match UX Specification
- [ ] Abort button uses de-emphasized destructive variant and opens confirmation dialog (not silent abort)
- [ ] Abort confirmation copy: "Abort this upgrade? Your uncommitted work will be restored and the merge will be rolled back."
- [ ] On successful completion, session header turns success variant, body shows "Upgrade complete" banner with "Restart dev server" button
- [ ] On failure, session header turns destructive, error summary visible in log, "Retry" + "Abort cleanup" buttons available
- [ ] On abort, session header turns neutral, rollback actions shown in log, "Dismiss" button
- [ ] Settings → Instance section uses `DetailPane` + `SectionHeading` + labeled rows per UX Specification
- [ ] Settings → Instance shows upgrade history as last 5 tasks with StatusChips, each clickable to reopen that upgrade session
- [ ] Settings → Instance has "No upgrades yet" empty state when history is empty
- [ ] Settings → Instance shows amber notice "Existing pre-push hook backed up to pre-push.ainative-backup" when applicable
- [ ] Hook backup notice is dismissible but re-appears if the .ainative-backup file still exists
- [ ] All session states verified against UX Specification state table: initializing, running, conflict-waiting, installing, complete, failed, aborted
- [ ] SheetContent body uses `px-6 pb-6` padding (per MEMORY.md recurring gotcha)
- [ ] Focus returns to upgrade badge after session sheet closes
- [ ] Design metrics verified via `/taste`: DV=3, MI=3, VD=6 (sheet body), VD=4 (modal)
- [ ] **Single-clone user test:** full upgrade flow works on a clone with `AINATIVE_DATA_DIR` unset — profile interpolates `{{INSTANCE_BRANCH}}=local`, modal shows `branch: local, data dir: ~/.ainative`, merge executes correctly
- [ ] **Dev-mode skip test:** upgrade badge, modal, session sheet, and Settings → Instance section all render as "disabled" or null when `AINATIVE_DEV_MODE=true` — no API routes created, no scheduled tasks, no UI entry points
- [ ] **Main dev repo safety test:** manual verification checklist for the implementing PR: run `npm run dev` in `Relay development checkout` after adding `AINATIVE_DEV_MODE=true` to its `.env.local` → zero new branches, zero git hooks installed, zero config changes, badge not visible, Settings → Instance section shows "Dev mode — instance features disabled"
- [ ] **Drifted-main test:** simulate a user with 3 local commits on `main` predating feature install → bootstrap creates `local` at HEAD → first upgrade session detects main-has-drifted and prompts user interactively ("I see main has commits not in origin/main. Move them to `local`?")
- [ ] Upgrade-assistant profile SKILL.md includes explicit handling for the "main diverged from origin/main" case with a canonical user prompt
- [ ] Settings → Instance section shows a clear "Dev mode" banner when running in dev mode, with no action buttons enabled

## Scope Boundaries

**Included:**
- `upgrade-assistant` profile (profile.yaml + SKILL.md)
- Three new API routes: `/api/instance/upgrade`, `/api/instance/init`, `/api/instance/config`
- Upgrade modal component (pre-flight dialog)
- Upgrade session view component (live task detail in sheet)
- Settings → Instance section component
- Conflict resolution via existing pending-approval pattern (no new approval infra)
- Abort path with clean git state rollback
- Dev server restart notice on completion
- Unit tests + integration test on temp-dir git repo

**Excluded:**
- Automatic dev server restart — users click a button to restart themselves (avoiding a supervisor process and complexity)
- Visual diff/merge editor — text-based conflict resolution only; diff preview is via existing agent tool output
- Multi-clone orchestration (upgrade all instances at once) — deferred to potential future "Instance Manager" feature
- Upgrade rollback beyond abort — once merge is committed, rollback is user's responsibility via standard git
- Release notes display — the modal shows commit count only; fetching and rendering release notes is deferred
- License metering around seat counts — deferred to `instance-license-metering` (but the flow must not crash if cloud license validation fails)
- Push of cherry-picked commits to PR branches — users handle this manually with `ALLOW_PRIVATE_PUSH=1`
- Chat-based git tools — explicitly rejected per architect TDR-028 rationale

## UX Specification

*Contributed by `/frontend-designer` UX Recommendation mode, 2026-04-07.*

### Persona & Core Task

- **Persona:** ainative user who customizes their clone via ainative chat itself. Technical enough to run npm scripts, not necessarily a git expert. Values not losing their customizations above all else.
- **Core task:** Safely pull upstream ainative commits into their local branch without losing work or accidentally pushing private changes.
- **Success metric:** Conflict-free upgrades in < 60 seconds; upgrades with conflicts completed without losing work and without reading git docs.
- **Emotional arc:** Badge = inviting. Modal = educational. Session = conversational. Completion = celebratory.

### Information Architecture

```
[Sidebar Badge] → [Pre-flight Modal] → [Session Sheet] → [Settings → Instance]
  awareness         decision             execution          history + control
```

Each touchpoint has a distinct role. The badge is ambient awareness (peripheral). The modal is the commitment gate (focused). The session is guided execution (conversational). Settings → Instance is the authoritative reference.

### Interaction Patterns

| Touchpoint | Pattern | Rationale |
|---|---|---|
| Badge | StatusChip in sidebar (info variant) | Ambient, low visual weight |
| Pre-flight modal | shadcn Dialog, 3 zones (explain / facts / CTAs) | Focused commitment moment |
| Session UI | Right-side Sheet overlay | Non-disruptive; user glances back at app during run; matches task detail pattern |
| Live git output | Existing `AgentLogsView` SSE stream | 100% reuse |
| Conflict prompt | 3-card cluster inside `PendingApprovalHost` | Visually distinct from log noise; scannable |
| Completion | Success banner + restart button inside sheet | Keeps user in session context |
| Settings surface | `DetailPane` with labeled rows | Matches existing settings density |

### Pre-Flight Modal States

| State | What user sees |
|---|---|
| Opening | Dialog fades in; fact panel populated from `GET /api/instance/upgrade/status` |
| Loading facts | Skeleton rows in fact panel; CTAs disabled |
| Ready | Facts visible, Start enabled |
| Starting | CTAs disabled, spinner on Start button, auto-transition to session sheet |
| Error | Inline error banner above CTAs with "Retry" button |

**Modal layout zones:**
1. Headline: **"Upgrade available"** + sub: "N commits ready to merge into `<branch>`"
2. Fact panel (labeled rows): branch name, data directory, commits behind, last successful upgrade timestamp
3. Body paragraph: "ainative has N new commits on `main`. Merging them into `<branch>` will pull in upstream fixes and features. Any uncommitted work will be stashed and restored automatically. If merge conflicts appear, the upgrade assistant will walk you through them."
4. CTAs: **Start upgrade** (primary) + Cancel (ghost)

### Session Sheet States

| State | What user sees | What user can do |
|---|---|---|
| Initializing | Empty log with "Starting upgrade..." | Abort |
| Running (any git step) | Live log, current step highlighted in status line | Abort |
| Conflict waiting | Log scrolls to show conflict summary; 3-choice card cluster appears below summary | Pick Keep mine / Take theirs / Show diff, or Abort |
| Installing deps | Log streams `npm install` output row by row | Abort |
| Complete | Status line turns success; success banner + "Restart dev server" button | Dismiss or Restart |
| Failed | Status line turns destructive; error in log; Retry + Abort cleanup buttons | Retry or Abort |
| Aborted | Status line neutral "Aborted — returned to pre-upgrade state" | Dismiss |

**Session layout:**
- Header: Status line `"Upgrading <branch> · 00:12"` + StatusChip (running → success/failed/aborted), elapsed time auto-updates
- Body: Log stream (dominant) with inline conflict cards when they appear
- Footer: Abort button (de-emphasized destructive variant)

### Conflict Resolution UX

When the agent encounters a merge conflict, it:
1. Writes a 1-line conflict summary in the log (e.g., `"src/app/page.tsx has conflicting changes in the header component."`)
2. Renders a 3-card cluster via `PendingApprovalHost`:
   - **"Keep my version"** — "Use your changes, discard main's version of this file"
   - **"Take main's version"** — "Use main's changes, discard your version of this file"
   - **"Show me the diff"** — "Output the full conflict diff in this log for manual resolution"
3. Agent waits on the user's response via the existing notification → approval flow
4. On response: runs `git checkout --ours` / `--theirs` / no-op (user edits), continues merge

Cards use `role="radiogroup"` with labeled children for keyboard accessibility.

### Settings → Instance Section

Rendered in Settings page using `SectionHeading` + `DetailPane` + labeled rows.

**Rows (in order):**
| Label | Value | Notes |
|---|---|---|
| Instance ID | `<uuid>` in mono font | Read-only, copyable |
| Branch | `<branch>` | Link to git log output (future) |
| Data directory | `<path>` in mono | Read-only |
| Cloud validation | `enabled` / `disabled` | Shows `STAGENT_CLOUD_DISABLED` state |
| Pre-push hook | `installed` / `missing` | StatusChip green/amber |
| Blocked branches | comma list | Branches with `pushRemote=no_push` |
| Last upgrade check | relative time | e.g., "5 min ago" |
| Last successful upgrade | timestamp | empty if never |
| Upgrade history | 5 most recent tasks with StatusChips | Clickable to reopen session sheet |

**Actions:** "Check for upgrades now" (primary button) + "Re-run instance setup" (secondary)

**Empty states:** "No upgrades yet" when history is empty.

**Warning banners:**
- "Existing pre-push hook backed up to pre-push.ainative-backup" (amber) — dismissible but re-appears if backup file still exists
- "Instance setup incomplete — re-run setup" (red) — appears if any `ensureX` function failed on boot

### Copy Direction (Load-Bearing)

| Surface | Copy | Rationale |
|---|---|---|
| Modal headline | "Upgrade available" | Avoids version-chasing anxiety |
| Modal CTA primary | "Start upgrade" | Not "Install" — this is a merge, not a package |
| Modal CTA secondary | "Cancel" | Not "Not now" — implies decision |
| Session status running | "Upgrading `<branch>` · 00:12" | Shows scope + elapsed |
| Step labels | "Fetching origin" / "Merging main" / "Installing dependencies" | Action-oriented |
| Completion banner | "Upgrade complete. You have N new commits on `<branch>`. Restart the dev server to apply changes." | Explains why restart |
| Abort confirmation | "Abort this upgrade? Your uncommitted work will be restored and the merge will be rolled back." | Reassures about data |
| Settings heading helper | "This instance is running on branch `<branch>` with data at `<data-dir>`. Upgrades pull in upstream commits from `main` while keeping your customizations." | Contextualizes |

### Accessibility Requirements

- Modal: shadcn Dialog focus-trap; Escape closes; focus returns to badge on close
- Session sheet body: `role="log" aria-live="polite"` so screen readers announce new lines without interrupting
- Conflict card cluster: `role="radiogroup"` with labeled cards; arrow keys navigate
- Abort button: `aria-label="Abort upgrade and rollback"`; Enter triggers confirmation, not silent abort
- All status changes use `aria-live="polite"` (never `assertive`) to avoid interrupting screen reader users
- Color contrast: all StatusChip variants pass WCAG AA via existing Calm Ops tokens
- Minimum 44x44px touch targets for CTAs, buttons, and conflict cards

### Design Metric Calibration (for `/taste`)

| Metric | Value | Rationale |
|---|---|---|
| `DESIGN_VARIANCE` | **3** | Reuses existing Calm Ops primitives; no new visual language |
| `MOTION_INTENSITY` | **3** | Spinner during commands + subtle pulse on in-flight badge; no bouncing or springs |
| `VISUAL_DENSITY` (sheet body) | **6** | Log-dense, consistent with task detail sheet |
| `VISUAL_DENSITY` (modal) | **4** | More breathing room than sheet; commitment moment deserves space |

### Open UX Questions (Deferred)

1. **Badge placement** — above Settings in Configure group (recommended) vs. dot on Settings itself. Recommendation: **above Settings**. Worth usability testing post-launch.
2. **Conflict diff preview** — inline in log (recommended v1) vs. side-panel diff viewer. Recommendation: **inline for v1**, side-panel as post-launch enhancement.
3. **Multi-instance discovery** — should the session view hint at sibling clones needing upgrades? Recommendation: **no** — keeps scope tight, clones are filesystem-separate.

## References

- Source: `features/architect-report.md` — full Integration Design, specifically "Upgrade Task Execution Flow" and "State Machine: Upgrade Task Lifecycle"
- Related features: depends on `instance-bootstrap` (profile distribution, git-ops, settings), `upgrade-detection` (poll state drives modal pre-flight), `agent-integration` (task runner + canUseTool), `agent-profile-catalog` (profile distribution pattern)
- Design patterns: TDR-001 (fire-and-forget), TDR-002 (notification queue), TDR-007 (profile-as-skill-dir), TDR-015 (permission caching), TDR-023 (chat engine — explicitly not used), TDR-024 (chat tools — explicitly not extended)
- Gotcha: SheetContent padding (`px-6 pb-6`) — MEMORY.md recurring issue
- Design system: reuses `DetailPane`, `SectionHeading`, `StatusChip`, `Dialog`, `Sheet`, `AgentLogsView`, `PendingApprovalHost`
- UX review required: `/frontend-designer` for sheet layout, copy tone, conflict UX, Instance section density
