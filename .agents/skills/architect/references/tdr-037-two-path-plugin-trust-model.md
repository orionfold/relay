---
id: TDR-037
title: Two-Path Plugin Trust Model — Self-Extension First, Third-Party Opt-In
status: accepted
date: 2026-04-20
accepted-date: 2026-04-20
category: security
supersedes-scope-of: TDR-035 acceptance criteria, M3 Phases C+D+E shipped semantics
---

> **Status: accepted (2026-04-20).** Promoted from `proposed` after Phase 4
> live smokes (T19 echo-server classifier + MCP registration, T20 confinement
> flag activation, T21 safe-mode + Settings toggles) all passed against the
> live `npm run dev` runtime. Strategy §15 Amendment becomes authoritative.
> See `handoff/2026-04-20-tdr-037-phase-4-shipped-handoff.md` for the
> verification trace.

# TDR-037: Two-Path Plugin Trust Model

## Context

The "Self-Extending Machine" strategy (`ideas/self-extending-machine-strategy.md`) promised *"Describe your business. Ainative builds it."* The north star is **machine that builds machines** — where *machines-it-builds* are the user's **own** domain apps (wealth manager, book reader, content marketing pipeline, book publisher), composed via chat or authored as plugin code when composition cannot express the need.

Three domain apps have shipped entirely via Tier 0-2 composition:

| Built via chat | Composed of | Plugin-trust events |
|---|---|---|
| Wealth manager (Book Ch. 13, 1-day build) | 7 tables + 4 profiles + 2 schedules + planner-executor blueprint + 10 routes | Zero |
| AI Native Book reader | `/book` route + bookmarks + read_progress tables + book-updater skill | Zero |
| Content marketing pipeline | checkpoint blueprint + 2 profiles | Zero |

None of these touched M3 plugin-trust machinery. Yet Phases C+D+E of M3 shipped ~1,619 LOC of trust infrastructure (canonical manifest hash, click-accept, per-tool approval Layer 1.8, capability expiry TTL, revocation flow, seatbelt/apparmor/docker confinement wraps, silent-swap hash guard) — engineered for a third-party plugin distribution model that strategy §10 **explicitly refused** after the 2026-04-12 marketplace rollback.

The over-engineering was not gratuitous: **shape-the-wrap-surface-once discipline**, Windows parity for confinement, and TDR-035's cross-runtime correctness justified shipping the mechanism. The drift from strategy is that the mechanism **activates by default** for every Kind 1 plugin including bundles ainative itself writes on the user's behalf. That default is wrong. Users habituated to Claude Code / Codex CLI freedom expect their own code to run at zero ceremony.

This TDR codifies a **two-path trust model** that preserves M3's machinery for the third-party case (ready the day external distribution is actually wanted) while making the self-extension case ceremony-free by default.

## Decision

**Classify every plugin bundle into one of two paths at load time, branch at the loader, keep adapters ignorant of the split.**

### 1. The classifier (`src/lib/plugins/classify-trust.ts`)

Pure function: `classifyPluginTrust(manifest, rootDir, opts?) → 'self' | 'third-party'`.

**Self-extension signals — ANY one flips the bundle to `'self'`:**

1. `manifest.origin === 'ainative-internal'` — explicit signal set by ainative's own chat tools (`create_profile`, `create_blueprint`, `create_schedule`, `create_table`, forthcoming `create_plugin_spec`) and the `ainative-app` skill.
2. `manifest.author === 'ainative'` — builtin dogfood convention (matches `echo-server` today).
3. `manifest.author === userIdentity` — user authored the bundle themselves (liberal match: `os.userInfo().username` by default; user email from Settings if configured).
4. `rootDir` is under `~/.ainative/apps/*` — composition-bundle path (future /apps surface).
5. `capabilities` is empty or missing — nothing to gate regardless of authorship.

**Kind 5 (primitives-bundle) ALWAYS classifies as `'self'`** — primitives bundles are data (YAML + SKILL.md), no executable surface beyond Zod-validated loaders. §10 Amendment II moved Kind 2 (data-processors) into MCP resource providers; primitives bundles can't ship code by definition.

**When NONE of the above hold AND `kind === 'chat-tools'` AND `capabilities` non-empty → `'third-party'`.**

### 2. Where the branch fires

`isCapabilityAccepted(pluginId, hash, opts?)` in `src/lib/plugins/capability-check.ts` accepts an optional `{ manifest, rootDir, trustModelSetting?, userIdentity? }`. When provided AND the classifier returns `'self'` AND the setting does not force `'strict'`, the function **early-returns `{ accepted: true, trustPath: 'self' }` without touching the lockfile**. Self-extension bundles never write to, read from, or drift-detect against `plugins.lock`.

Both known call sites (`mcp-loader.ts` `scanPlugin`, `plugin-tools.ts` `list_plugins`) thread manifest + rootDir through. Legacy callers that omit them fall through to the original lockfile-based check unchanged (backward-compatible).

### 3. Adapter neutrality

Zero changes required in the four runtime adapters (Claude SDK, Anthropic direct, OpenAI direct, Codex App Server). They continue consuming `withAinativeMcpServer()` output; the path split happens upstream at the loader. TDR-035's five-source merge invariant and loader-authority contract actively protect this separation — the drift heuristic tests in `src/lib/plugins/__tests__/cross-runtime-contract.test.ts` keep adapters free of manifest-parsing code regardless of which trust path a plugin takes.

### 4. Per-feature disposition of shipped M3 machinery

| M3 feature | Disposition | Rationale |
|---|---|---|
| Canonical manifest hash + `plugins.lock` | **KEEP (third-party path only)** | Gated behind classifier; self-extension never writes to lockfile. |
| Click-accept capability flow | **KEEP (third-party path only)** | Third-party entry gate; never fires for self-extension. |
| Silent-swap hash guard on grant | **KEEP (third-party path only)** | Cheap correctness check inside the lockfile path. |
| Revocation flow + Inbox notification + cache-bust | **KEEP (third-party path only)** | For actual foreign code that might need to be disabled; file-system deletion is the self-extension "revoke". |
| Per-tool approval Layer 1.8 (never/prompt/approve) | **PARK behind `AINATIVE_PER_TOOL_APPROVAL=1` (default OFF)** | MCP elicitation (SEP-1036) is the strategy-sanctioned runtime consent primitive per Amendment II. Keep code dormant until runtime-consent UI ships. |
| Capability expiry TTL (30/90/180/365) | **REMOVE (scheduled)** | Scope creep. Claude Code has no TTL. Self-authored code doesn't age. `set_plugin_accept_expiry` deprecated in tool description; Zod schema keeps `expiresAt` optional for lockfile backward-compat until hand-edited files age out. |
| `--safe-mode` CLI flag | **KEEP (both paths)** | Cheap, incident-response hygiene; mirrors Claude Code `--no-plugins`. |
| Seatbelt wrap (macOS) | **PARK behind `AINATIVE_PLUGIN_CONFINEMENT=1` (default OFF)** | §11 Risk D off-ramp. Dormant. |
| AppArmor wrap (Linux) | **PARK** | Same. |
| Docker wrap + boot sweep | **PARK** | §11 Risk D explicitly gated on "first external `child_process` plugin" — hasn't happened. |
| 8 confinement profile stubs | **PARK on disk** | Do NOT author real policy corpus (M3.5 commitment) until demand surfaces. |
| TDR-035 drift heuristic tests | **KEEP (both paths)** | Validates loader/adapter separation regardless of trust path. TDR-035 rescoped to "Loader-Authority Contract" to reflect this. |
| Echo-server dogfood | **KEEP as reference, DEMOTE from release gate** | Phase F smokes reduced; wealth-manager is the real "machine that builds machines" dogfood. |

**Net effect:** ~920 LOC parked behind flags, ~80 LOC (TTL) scheduled for removal, ~400 LOC retained in active hot path for the third-party case that stays ready.

### 5. Settings toggle (user autonomy)

A new Settings → Advanced → **"Plugin trust model"** select respects user autonomy:

- `auto` (default) — path split per classifier.
- `strict` — force third-party path for all plugins (forces lockfile even for ainative-internal bundles). For users who want training wheels over their own tool-emitting code.
- `off` — trust-on-first-use for all plugins. For users who want CLI-grade freedom matching Claude Code / Codex CLI exactly.

The setting is read by `isCapabilityAccepted` via `opts.trustModelSetting`. All three values tested in `src/lib/plugins/__tests__/capability-check.test.ts` (Section 5b).

### 6. Manifest `origin` field

`plugin.yaml` schema extended with optional `origin: 'ainative-internal' | 'third-party'` on both `primitives-bundle` and `chat-tools` kinds (`src/lib/plugins/sdk/types.ts`). Additive and backward-compatible. `EXCLUDED_COSMETIC_FIELDS` in `capability-check.ts` intentionally does NOT include `origin` — it's security-relevant, so flipping origin is a hash drift that triggers re-accept on the third-party path (the self-extension path ignores the hash anyway).

## Consequences

### What this unblocks

- The `/apps` surface (strategy §6) can ship without the ExtensionFallbackCard and capability-accept sheet as blockers — self-extension is zero-ceremony by default.
- `create_plugin_spec` chat tool can scaffold Kind 1 plugins with `author: ainative` + `origin: ainative-internal` that load at zero ceremony on next reload — closing the "what if composition isn't enough" gap in strategy §4.
- The `ainative-app` skill can fall through to plugin scaffolding when composition cannot express the need, inside one continuous chat session.
- Users can hand-edit their own plugin code under `~/.ainative/plugins/<slug>/` with their email as `author:` and still land on self-extension — matching the CLI-fluent freedom the strategy positions itself against.

### What this reinforces

- **Strategy §10 non-goals.** No marketplace, no publish flow, no trust ladder — self-extension default posture makes any gradual re-entry via TTL / hash-pinning ceremony impossible without an explicit setting change.
- **§11 Risk D off-ramp stays valid.** The confinement code is dormant but immediately available when the "first external `child_process` plugin" leading indicator fires.
- **TDR-035 loader-authority.** The path split happens at the loader; adapters remain parser-free.

### What this rejects

- **Capability TTL as a strategic primitive.** Self-authored code doesn't age. Claude Code / Codex CLI reject TTLs. Keeping the field for backward-compat with hand-edited lockfiles, not as a recommendation.
- **Per-tool approval as a default runtime-consent surface.** MCP elicitation (SEP-1036) is the sanctioned primitive per Amendment II. Duplicating it in Layer 1.8 created two consent surfaces with different semantics.
- **Confinement as a default hardening layer.** §11 Risk D is explicit: "opt-in hardening layer, NOT a default." Parked behind a flag honors this letter and spirit.

### Migration (2026-04-20)

**No reverts.** The retrofit is additive:

1. Extend `plugin.yaml` schema with optional `origin` field. ✅
2. Add `classifyPluginTrust()` in `src/lib/plugins/classify-trust.ts`. ✅
3. Extend `isCapabilityAccepted()` with optional `{ manifest, rootDir, trustModelSetting, userIdentity }` opts; early-return for self-extension. ✅
4. Thread manifest + rootDir through both known call sites (mcp-loader, plugin-tools). ✅
5. Gate Layer 1.8 behind `AINATIVE_PER_TOOL_APPROVAL=1` (default OFF). ✅
6. Gate `wrapStdioSpawn()` and `dockerBootSweep()` behind `AINATIVE_PLUGIN_CONFINEMENT=1` (default OFF). ✅
7. Deprecate `set_plugin_accept_expiry` chat tool in description; schedule TTL code for removal. ✅
8. Add Settings toggle (Phase 1.12, pending).
9. Write TDR-037 + rescope TDR-035 title. ✅ (this document + TDR-035 header update)
10. Strategy §15 amendment (Phase 1.10, pending).
11. Simplify `docs/plugin-security.md` (Phase 1.11, pending).

Test coverage: 19 classify-trust tests + 8 capability-check self-extension bypass tests + 3 confinement parked-by-default tests + 1 Layer 1.8 parked-by-default test. All existing tests preserved unchanged.

## References

- `ideas/self-extending-machine-strategy.md` §4 (composition ladder), §5 (security posture), §10 (non-goals), §11 Risk D (Docker off-ramp), Amendment II (MCP as extension surface)
- `handoff/2026-04-20-m3-phases-c-d-e-complete-handoff.md` (what shipped in Phases C+D+E)
- `/Users/manavsehgal/.claude/plans/time-to-consult-the-clever-rose.md` (execution plan this TDR ratifies)
- TDR-035 (loader-authority cross-runtime contract, rescoped)
- TDR-032 (dynamic-import discipline — unchanged)
- `src/lib/plugins/classify-trust.ts` (classifier implementation)
- `src/lib/plugins/capability-check.ts` §isCapabilityAccepted (self-extension bypass)
- `src/lib/agents/tool-permissions.ts` (Layer 1.8 flag gate)
- `src/lib/plugins/confinement/wrap.ts` (wrapStdioSpawn + dockerBootSweep flag gates)
