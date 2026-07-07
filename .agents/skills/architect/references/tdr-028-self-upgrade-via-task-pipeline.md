---
id: TDR-028
title: Self-upgrade runs via task execution pipeline, not chat tools
status: accepted
date: 2026-04-07
category: agent-system
---

# TDR-028: Self-upgrade runs via task execution pipeline, not chat tools

## Context

ainative is a self-modifying dev environment: every git-clone user customizes their checkout via ainative chat itself. When upstream ainative has new commits, users need a safe, guided way to `git fetch / git merge main` into their instance branch and resolve any conflicts interactively. The question during feature design was: *should git operations (fetch, merge, conflict resolution, abort) run as chat tools or as a task?*

Chat tools are deliberately DB-only per TDR-024 — `settings-tools.ts` and its siblings only read and write ainative data through a typed tool registry with per-key allowlists. Adding shell or git execution to the chat surface would cross a trust boundary the chat engine is explicitly designed to preserve: a compromised or buggy chat prompt could then run arbitrary shell commands against the user's working tree.

Meanwhile, the task execution pipeline (claude-agent.ts, execution-manager.ts, canUseTool approval flow) already has:
- `Bash` tool support with per-command allowlists on agent profiles
- The permission pre-check cache from TDR-015 so rapid-fire approvals during a merge session don't prompt the user for every individual git command
- SSE log streaming via the existing `AgentLogsView` component
- Notification-queue-based pending-approval flow from TDR-002 for conflict resolution prompts
- Fire-and-forget execution from TDR-001 so the upgrade task does not block the HTTP request

## Decision

The upgrade flow runs as a **task** with `agentProfile='upgrade-assistant'`, not as a chat conversation. The `upgrade-assistant` profile ships as a builtin skill directory under `src/lib/agents/profiles/builtins/upgrade-assistant/` per TDR-007, declaring a tight Bash tool allowlist (`git fetch *`, `git status`, `git stash *`, `git checkout *`, `git merge *`, `git commit *`, `git diff *`, `git rev-parse *`, `git log *`, `git merge --abort`, `npm install`) plus `Read` and `Write` for conflicted files. No other tools.

The "Upgrade Session" UI surfaces the task in a right-side sheet overlay that feels chat-like — streaming log output via `AgentLogsView`, conflict prompts via `PendingApprovalHost` — but the execution pipeline underneath is the existing task runner. No changes to the chat engine. No new chat tools. No shell access on the chat surface.

The pre-push hook template (embedded in `src/lib/instance/bootstrap.ts`) is also shell, but it is installed exactly once at first boot by `ensurePrePushHook()` — it is not invoked from chat or from the task runner at merge time. Git itself executes the hook on push.

## Consequences

- **Zero new execution infrastructure.** 100% reuse of claude-agent.ts, canUseTool, notifications, SSE, and profile distribution.
- **The chat tool trust boundary is preserved.** No future chat tool author can accidentally expose shell access by copying from upgrade-assistant — the profile lives in a completely separate registry.
- **Merge conflict UX reuses `PendingApprovalHost`** and gets the entire existing notification inbox for free (history, cross-device delivery via the channel poller when that ships, etc.).
- **The upgrade-assistant profile is user-editable** per TDR-007 — advanced users can edit `~/.claude/skills/upgrade-assistant/SKILL.md` to customize merge behavior (e.g., preferred conflict resolution strategies, additional checks).
- **Testing is simpler.** Agent profiles have established test patterns (`profile_test_results` table, `test:` blocks in profile.yaml). Chat tools have their own test surface. Keeping upgrade logic in one place (profiles) avoids cross-cutting test setup.
- **The upgrade flow is bound to Claude Agent SDK** for Bash access in v1. Multi-runtime support for this feature is deferred; other runtimes (Codex, Ollama) can add Bash adapters in a future extension without touching this design.

## Alternatives Considered

- **Chat-based git tools** — rejected. Crosses the DB-only trust boundary of TDR-024 and would require rebuilding half of the permission framework to gate shell access appropriately.
- **Dedicated background runner outside both chat and tasks** — over-engineered. The task pipeline already provides every primitive needed (execution, streaming, approvals, logs, retry, cancellation). Building a third pipeline for "just upgrades" would double the surface area of execution infrastructure with no additional capability.
- **Front-end git library (isomorphic-git or similar)** — rejected. Doing merges in browser/Node without shelling out means we lose: hook execution, user's git config (attributes, hooks, merge drivers), reflog integrity, and credential helpers. The user's git installation is the right tool for this job.
- **Wizard modal with scripted steps, no agent** — rejected during UX brainstorm. Scripted wizards can't adapt to the user's actual merge conflict content. The agent-in-the-loop lets us explain conflicts in natural language, suggest resolutions based on the diff, and answer follow-up questions.

## References

- `src/lib/instance/bootstrap.ts` — establishes the instance branch this feature upgrades
- `src/lib/agents/claude-agent.ts` — task execution pipeline with Bash tool
- `src/lib/agents/execution-manager.ts` — fire-and-forget task runner
- `src/lib/notifications/actionable.ts` — pending-approval flow reused for conflict resolution
- `features/upgrade-session.md` — full feature spec
- TDR-001 — fire-and-forget execution
- TDR-002 — notification as message queue
- TDR-007 — profile as skill directory
- TDR-015 — permission pre-check caching
- TDR-024 — permission-gated chat tools (the boundary this TDR preserves)
