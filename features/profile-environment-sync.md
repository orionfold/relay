---
title: Profile-Environment Sync
status: completed
priority: P1
milestone: post-mvp
source: features/agent-profile-from-environment.md
dependencies: [agent-profile-from-environment, environment-cache, agent-profile-catalog, skill-portfolio]
---

# Profile-Environment Sync

## Description

Create roundtrip two-way sync between ainative profiles and environment skill artifacts. Today the profile registry and environment scanner both read from the same filesystem (`~/.claude/skills/`) but maintain separate representations with no reconciliation — profiles don't know about their corresponding environment artifacts, and environment artifacts don't know which ones are already profiles.

This feature adds a thin reconciliation layer that makes the implicit filesystem-based sync explicit and visible. A profile-artifact linker runs after each environment scan, cross-referencing skill artifacts with registered profiles by directory name. The suggestion engine is enhanced from 6 hardcoded rules to a two-tier system where any unlinked skill artifact becomes a discoverable profile candidate. Profile mutations invalidate the scan cache so the environment dashboard stays current.

The result: users who install a skill see it immediately as a promotable profile candidate, users who create profiles see them reflected in the environment dashboard, and the filesystem remains the single source of truth with no bidirectional sync complexity.

## User Story

As a ainative user who installs skills and creates profiles across multiple projects, I want the environment dashboard and profile system to stay in sync automatically, so that discovered skills become usable profiles with one click and my profiles appear as linked artifacts in the environment view.

## Technical Approach

### Architecture: Passive Reconciliation

The filesystem is the single source of truth. Both systems already read from `~/.claude/skills/`. Rather than building a bidirectional sync engine, we add a reconciliation layer that merges both perspectives at query time.

### Component 1: Profile-Artifact Linker (new module)

**File**: `src/lib/environment/profile-linker.ts`

Runs after `createScan()` completes in `src/lib/environment/data.ts`. Matches skill artifacts (category="skill") to profiles by shared directory basename under `~/.claude/skills/`.

- Query all skill artifacts from the scan
- Query all profiles from registry via `listAllProfiles()`
- Match by directory basename (e.g., `~/.claude/skills/code-reviewer/` matches profile `code-reviewer`)
- UPDATE `environmentArtifacts` SET `linkedProfileId` for matched pairs
- Return `{ linked, unlinked, unlinkedArtifacts }` for downstream suggestion engine

**DB change**: Add `linkedProfileId TEXT` column to `environmentArtifacts` table.

### Component 2: Enhanced Suggestion Engine (extend existing)

**File**: `src/lib/environment/profile-rules.ts` (modify)

Extend from 6-rule-only to two-tier system:

- **Tier 1 (Curated)**: Keep existing 6 `PROFILE_RULES` as high-confidence suggestions (0.65-1.0)
- **Tier 2 (Auto-discovered)**: Any unlinked skill artifact with valid SKILL.md frontmatter becomes a generic suggestion at confidence 0.5. Uses the artifact's own frontmatter (name, description) as profile metadata

New function `generateTier2Suggestions(unlinkedArtifacts)` in `profile-rules.ts`.

Update `src/lib/environment/profile-generator.ts` to handle Tier 2 suggestions and `src/app/api/environment/profiles/suggest/route.ts` to return tiered results.

### Component 3: Profile Source Annotation (type extension)

**File**: `src/lib/agents/profiles/types.ts` (modify)

Add `origin` field to `AgentProfile`:

```typescript
origin?: "manual" | "environment" | "import" | "ai-assist";
```

Key distinction: `scope` = WHERE (builtin/user/project), `source` = HOW CREATED. Environment-generated profiles have scope `"user"` (they live in `~/.claude/skills/`) but source `"environment"`.

Existing `author: "ainative-env"` pattern in `profile-generator.ts` already partially covers this; the `origin` field makes it explicit and queryable.

### Component 4: Registry Enrichment (extend existing)

**File**: `src/lib/agents/profiles/registry.ts` (modify)

Add `listProfilesWithEnvironmentStatus(scanId?)`:

- Calls `listAllProfiles()` to get all profiles
- Queries `environmentArtifacts` for linked artifacts by `linkedProfileId`
- Annotates each profile with `{ linked, artifactId?, contentHash?, drifted? }`
- Drift = profile's SKILL.md content hash differs from artifact's content hash

### Component 5: Scan Invalidation on Profile Mutations (extend existing)

**File**: `src/lib/agents/profiles/registry.ts` (modify) + `src/lib/environment/data.ts` (add `invalidateLatestScan()`)

After `createProfile()`, `updateProfile()`, `deleteProfile()`:
- Call `invalidateLatestScan()` which marks the latest scan as stale
- Next `ensureFreshScan()` on page load re-scans the filesystem
- The linker re-runs, picking up the new/modified/deleted profile

### Component 6: UI Badges and Affordances

**Environment Dashboard** (`src/components/environment/`):
- Artifact cards for skills show "Profile" chip when `linkedProfileId` is set (clickable → profile detail)
- Unlinked skill artifacts show "Create Profile" button inline (one-click promotion)
- New "Profiles" sub-tab showing merged profile+environment view with three sections: Linked Profiles, Unlinked Profiles, Discoverable Skills
- Tier 1 suggestions section (existing, enhanced) + Tier 2 "Other discoverable skills" section (collapsible)

**Task Creation** (`src/components/tasks/task-create-panel.tsx`):
- Profile dropdown shows origin dot/badge: indigo=builtin, green=environment, gray=custom, orange=project

**Chat** (`src/components/chat/chat-command-popover.tsx`):
- Profile mentions include origin badge
- Skills group surfaces unlinked skills with "promote to profile" affordance

### Component 7: Auto-Promotion Setting (opt-in, power-user)

Setting `auto_promote_skills: boolean` (default: `false`, opt-in). When enabled, the linker auto-creates profiles for Tier 2 unlinked skills with valid SKILL.md frontmatter. Toggle in Settings page under "Environment" section. Opt-in avoids noise for casual users; power users enable zero-config.

### Resolved Design Decisions

- **Auto-promotion**: Opt-in (default off). Power users enable it. Avoids profile list bloat from utility scripts
- **Builtins in environment**: Yes. After `ensureBuiltins()` copies them to `~/.claude/skills/`, they appear as environment artifacts with "Built-in" badge. Complete view over clean view
- **Profiles tab**: Complements existing /profiles page. `/environment` shows the environment-centric merged view; profile CRUD stays on /profiles
- **Naming**: "Discovered" — as in "Your environment discovered 3 skills that can become agent profiles". Least jargon-y, most intuitive

### UX Considerations

**Primary flow (Discover → Promote → Use)**:
1. User installs skill in `~/.claude/skills/my-skill/`
2. Next `/environment` load triggers auto-scan
3. Dashboard shows skill card with "Create Profile" button
4. One click creates profile, ready for task assignment
5. Task creation dropdown shows profile with "Environment" badge

**Reverse flow (Create → See)**:
1. User creates profile via profiles page
2. Registry writes to filesystem, invalidates scan
3. Next `/environment` load re-scans, linker matches artifact
4. Dashboard shows skill card with "Profile" badge (linked)

**Visual design (Calm Ops aligned)**:
- Profile badge: `StatusChip variant="default"` — subtle, informational
- Create Profile: `Button variant="outline" size="sm"` — discoverable but not aggressive
- Origin dots in dropdowns: small colored circles per scope
- Drift indicator: yellow dot when content hashes differ

## Acceptance Criteria

- [ ] `linkedProfileId` column added to `environmentArtifacts` table with migration
- [ ] Profile-artifact linker runs after every scan, matching by directory basename
- [ ] Linker correctly matches skill artifacts to profiles across all scopes (builtin, user, project)
- [ ] Tier 2 suggestions generated for unlinked skill artifacts with valid SKILL.md frontmatter
- [ ] Tier 1 and Tier 2 suggestions displayed separately in environment dashboard
- [ ] One-click "Create Profile" on unlinked skill artifacts creates a working profile
- [ ] Created profile appears in task/workflow profile dropdowns immediately
- [ ] Profile mutations (create/update/delete) invalidate the latest environment scan
- [ ] Re-scan after profile mutation correctly links the new/modified artifact
- [ ] Environment dashboard shows "Profile" badge on linked skill artifacts
- [ ] Profiles API returns `origin` field distinguishing manual/environment/import/ai-assist
- [ ] Task creation dropdown shows origin badge per profile
- [ ] Drift detection: when SKILL.md content differs between profile and artifact, drift indicator appears
- [ ] `listProfilesWithEnvironmentStatus()` returns environment linkage for all profiles
- [x] Auto-promotion setting exists in settings (default off), when on auto-creates profiles for unlinked skills

## Scope Boundaries

**Included:**
- Profile-artifact linking via directory basename matching
- Tier 2 auto-discovered suggestions from unlinked skill artifacts
- `origin` field on `AgentProfile` type
- Registry enrichment with environment status
- Scan invalidation on profile mutations
- UI badges in environment dashboard, task creation, and chat
- Auto-promotion opt-in setting
- Drift detection between profile and artifact content hashes

**Excluded:**
- Real-time filesystem watching (relies on scan-based staleness, 5-min window)
- ML/NLU-based profile suggestion (rules + frontmatter parsing only)
- Merging the /environment and /profiles pages (they complement, not replace)
- Cross-tool sync (Claude ↔ Codex) — already handled by environment-sync-engine
- Custom user-defined suggestion rules (future enhancement)
- Profile version history or rollback (out of scope)

## References

- Source: `features/agent-profile-from-environment.md` — extends the one-way bridge to roundtrip sync
- Architecture: Passive Reconciliation pattern — filesystem as single source of truth
- Related: `environment-cache` (scan storage), `skill-portfolio` (drift detection), `agent-profile-catalog` (profile CRUD), `environment-sync-engine` (cross-tool sync)
- Plan: `internal implementation plan` — full architectural analysis with 3 alternatives evaluated
