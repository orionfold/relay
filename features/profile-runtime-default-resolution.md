---
title: Profile Runtime Default Resolution
status: completed
priority: P1
milestone: post-phase-5
source: Relay git commit e9cc6d20
dependencies: [row-trigger-blueprint-execution]
---

# Profile Runtime Default Resolution

## Description

Closes a bug surfaced during Phase 5 (`row-trigger-blueprint-execution`) verification: row-triggered tasks crashed with `NoCompatibleRuntimeError` because the `cs-coach` profile referenced inline in `~/.ainative/apps/customer-follow-up-drafter/manifest.yaml` had no `profile.yaml` anywhere on disk, so `getProfile("cs-coach")` returned undefined and the execution-target resolver had no `supportedRuntimes` to match against. The fix synthesizes in-memory profile entries for any app-manifest inline ref that lacks an on-disk profile, allowing the resolver to find a compatible runtime without requiring operators to author a profile file for every persona.

## What shipped

- **`src/lib/agents/profiles/app-manifest-source.ts`** — new synthesizer module. `loadAppManifestProfiles(appsDir, profilesDir, builtinsDir)` scans `<appsDir>/*/manifest.yaml`, collects all `blueprints[].agentProfile` refs, skips ids already covered by on-disk profiles, and synthesizes `AgentProfile` entries with permissive defaults: `supportedRuntimes: [...SUPPORTED_AGENT_RUNTIMES]` (all 5), `domain: "work"`, `tags: [appId]`, `origin: "import"`, `readOnly: true`, `skillMd: ""`, `systemPrompt: description`.
- **`src/lib/agents/profiles/index.ts`** — `scanProfiles()` now loads synthesized entries first and overlays file-based profiles (Map last-write-wins), giving on-disk profiles precedence over synthesized ones at the same id. Cache signature extended: `getSkillsDirectorySignature()` fingerprints `<appsDir>/*/manifest.yaml` mtimes so any app-manifest mutation auto-invalidates the profile cache.
- **`src/lib/agents/runtime/execution-target.ts`** — both `NoCompatibleRuntimeError` throw sites now include the profile id, its `supportedRuntimes`, and the configured runtimes in the message, enabling diagnosis from logs without reading source code.
- **11 unit tests** in `src/lib/agents/profiles/__tests__/app-manifest-source.test.ts` — covers: missing appsDir, empty appsDir, manifest without blueprints, manifest without agentProfile, profile already on disk (skipped), synthesis shape correctness, multiple apps, multiple blueprints per app, duplicate-id deduplication, missing manifest.yaml in subdir.

## Architecture

```
scanProfiles()  [src/lib/agents/profiles/index.ts]
  ├─ loadAppManifestProfiles(appsDir, profilesDir, builtinsDir)   [NEW]
  │    ├─ glob <appsDir>/*/manifest.yaml
  │    ├─ for each: parse YAML, extract blueprints[].agentProfile refs
  │    ├─ skip ids already in profilesDir or builtinsDir
  │    └─ synthesize AgentProfile with supportedRuntimes = all 5
  └─ overlay file-based profiles (last-write-wins in Map)
       → synthesized entries shadowed by on-disk profiles at same id

getSkillsDirectorySignature()  [extended]
  └─ now includes glob(<appsDir>/*/manifest.yaml) mtimes
       → app manifest mutations auto-invalidate profile cache

NoCompatibleRuntimeError  [src/lib/agents/runtime/execution-target.ts]
  └─ message: "No compatible runtime for profile '<id>' …
               (profile supports: [A,B]; configured: [C])"
```

## Verification run — 2026-05-02

Dev server `PORT=3010 npm run dev`, cold start after all 5 feature commits. No `ReferenceError`, no module-load cycle.

- `GET /api/profiles` → `cs-coach` present with `origin: "import"`, `tags: ["customer-follow-up-drafter"]`, `supportedRuntimes: [all 5]` ✅
- `POST /api/tables/customer-touchpoints/rows` with `{customer: "Smoke Test Co", summary: "Smoke verification of profile-runtime-default-resolution", sentiment: "neutral", channel: "email"}` → row id `d77d9ace-5fa2-41ae-b5e8-020be8c3d3a5` ✅
- Workflow `4991db0c-77e2-479e-8815-9628bdc3417c` created with `_contextRowId = d77d9ace-...` ✅
- Task `ac895f80-4bbd-4180-bf86-3b693c0691cf` with `agent_profile=cs-coach`, `effective_runtime_id=claude-code` ✅
- Task settled to `status=completed`, `failure_reason=(none)` ✅ — first end-to-end completion of the row-trigger chain.
- Dev log grep `ReferenceError|TypeError|cannot|Cannot access|claudeRuntimeAdapter|NoCompatibleRuntime` → 0 matches ✅

Unit test suite: 1947 passed, 7 failed (all pre-existing, unrelated to this feature). `npx tsc --noEmit` clean.

## References

- Historical design: Relay git commit `e9cc6d20`
- Historical implementation plan: Relay git commit `ca23f59c`
- Predecessor feature: `features/row-trigger-blueprint-execution.md`
- Commit chain: `90aa707b` → `57fb3726` → `a476c857` → `31321eb8` → `f7a66b75`
- HANDOFF: `internal history record` (predecessor) → `internal continuity record` (current, post-ship)
