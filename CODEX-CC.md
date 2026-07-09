# CODEX ↔ CC — Cross-Platform Sync Handoff

**A living handoff document between Claude Code and Codex.** Either platform may
edit it. When you update it, append a **timestamped, signed entry** to the Sync Log
(newest at bottom) describing what you changed and why. Do not silently overwrite the
other platform's entries — this doc is a shared ledger, not a scratchpad.

- **Signers:** `[CC]` = Claude Code (Opus). `[CODEX]` = Codex.
- **Scope:** the cross-tool surfaces both platforms share — skills, memory, config,
  and the `AGENTS.md` ↔ `CLAUDE.md` sync contract.
- **Companion contracts:** `CLAUDE.md` ("Cross-Tool Sync"), `AGENTS.md`, and the
  gitignored `.claude/skills/` (memory `skills-are-gitignored-secret-sauce`).
- **Single-ledger rule:** keep this as the one Codex↔Claude Code coordination file.
  Do not create a separate `CLAUDE-CC.md`; Claude Code should read and update this file.

---

## Surface health at a glance

| Surface | State | Action |
|---|---|---|
| `AGENTS.md` ↔ `CLAUDE.md` (5 synced sections) | ✅ In sync | none |
| Memory (Claude files vs Codex SQLite) | ✅ Independent by design | none — not a shared surface |
| Tool-specific skills (Claude-only staging; Codex-only OpenAI) | ✅ Correctly partitioned | none |
| 15 "shared" skills | ⚠️ Architecturally forked | reconcile only genuine stale-content cases (below) |
| Removed Codex frontend skills | ✅ Intentionally removed | do not recreate `frontend-design`, `frontend-designer`, or `taste` |
| Codex browser/handoff settings | ✅ Codex-only | preserve browser runbook and disabled Stop hook |
| `_ASSETS` strategy corpus | ⚠️ Strategy-owned via symlink | read/write only; do not commit from Relay unless explicitly asked |
| `_ASSETS` catalog stage-1 sync | ✅ Now drift-guarded (2026-07-09 `[CC]`) | `derive`+`verify-feature-catalog.mjs` enforce; catalog no longer hand-pinned prose |
| Static demo foundation | ⚠️ Mock, not simulation; behavioral verifier now RED on it | rebuild via Option C hybrid; verifier is the gate (no more false green) |

**Key finding (2026-07-06):** the 18 "shared" skills are **not** symmetrically synced
copies. The pattern is deliberate: **Claude holds the fat, authoritative skill body;
Codex holds a thin shim or condensed port** that routes back to (or mirrors) the Claude
version. So most "drift" is architectural, not accidental. A blind copy in either
direction would clobber real work. Reconcile case-by-case using the table below.
As of 2026-07-07, the current shared count is 15 because the three Stagent-era Codex
frontend skills were intentionally removed.

---

## Per-skill reconciliation report

Evidence captured 2026-07-06 by `[CC]`, amended 2026-07-07 by `[CODEX]`. `newer` = SKILL.md mtime. `lines` = C(laude)/X(codex).
**Classification:**
- **SHIM** — Codex file is an explicit compatibility shim / port that points at or defers
  to the Claude body. Divergence is intentional; **do not sync**. Codex line count is
  meant to stay small.
- **PORT** — Codex is a deliberately-condensed standalone port of the Claude skill.
  Intentional; **do not sync** unless the Claude body gained rules Codex should mirror.
- **STALE** — one side is genuinely newer with content the other lacks; **sync the newer
  side's substantive changes** into the other (respecting each tool's syntax).

| Skill | Newer | Lines C/X | Name fork | Class | Recommended action |
|---|---|---|---|---|---|
| architect | CODEX (same day) | 547/42 | no | PORT | Leave. Codex 42-line port; Claude is the full body. Re-verify only if Codex port cites rules Claude lacks. |
| brainstorming | CODEX | 39/33 | `-overrides` vs `brainstorming` | PORT | Leave. Claude = plugin *override*; Codex = port. Different mechanism by design. |
| capture | CODEX | 382/35 | no | PORT | Leave. Codex is a condensed standalone; both target `.claude/reference/`. |
| code-review | CODEX | 130/35 | no | PORT | Leave. Codex port defers to Claude's fuller 2-pass model. |
| commit-push-pr | CODEX | 22/24 | `-overrides` vs `commit-push-pr` | PORT | Leave. Claude = plugin override; Codex = standalone port. Never byte-identical. |
| docx | CODEX | 590/20 | no | **SHIM** | Leave. Codex explicitly says "Compatibility shim… read `.claude/skills/docx/SKILL.md`". Claude authoritative. |
| pdf | CLAUDE | 314/67 | quoting only | PORT | Leave. `name: "pdf"` (quoted) vs `pdf` is cosmetic. Claude is authoritative body. |
| pptx | CODEX | 232/26 | no | PORT | Leave. Codex condensed port. |
| product-manager | CLAUDE | 294/123 | no | PORT | **Watch.** Claude newer + Codex has a real 123-line body. If Claude gained backlog/roadmap rules, mirror the substantive ones into Codex. |
| quality-manager | CLAUDE | 514/73 | no | PORT | Leave. Claude authoritative; Codex thin port. |
| refer | CODEX | 88/25 | no | PORT | Leave. Codex condensed standalone; same `.claude/reference/` contract. |
| supervisor | CLAUDE | 540/65 | no | PORT | Leave. Claude authoritative; Codex thin port. |
| worktree-production | CODEX (same day) | 212/32 | no | PORT | Leave. Codex thin port; Claude full body. |
| writing-plans | CLAUDE | 56/36 | `-overrides` vs `writing-plans` | PORT | Leave. Claude = plugin override; Codex = port. |
| xlsx | CODEX | 291/20 | no | **SHIM** | Leave. Codex explicit compatibility shim → Claude body. |

### Removed from Codex on 2026-07-07

| Skill | Prior state | Current action |
|---|---|---|
| `frontend-design` | Stagent-era Codex port | Removed from repo-local and global Codex skills. Do not recreate from Claude. |
| `frontend-designer` | Stagent-era Codex port | Removed from repo-local and global Codex skills. Do not recreate from Claude. |
| `taste` | Stagent-era Codex port | Removed from repo-local and global Codex skills. Do not recreate from Claude. |

**Net:** 2 SHIM + 13 PORT are intentional and need **no action**. Only
**`product-manager`** is currently worth a human rule-level glance because Claude is
newer and Codex carries a real body. The removed frontend skills are not drift; they are
deliberate Codex cleanup. Future Relay frontend skills should be created deliberately
from current research, `design-system/MASTER.md`, `src/app/globals.css`, and Relay
practice, not restored from Stagent-era ports.

---

## Reconciliation protocol (for either platform)

1. **Never blind-copy** a SKILL.md across trees. Claude bodies are fat/authoritative;
   Codex bodies are thin shims/ports. Copying clobbers the architecture.
2. For a **STALE** case, diff at the **rule level**, not the line level. Port only the
   substantive new rule into the other tool's native syntax and structure.
3. Preserve each side's **name/frontmatter** (`-overrides` on Claude plugin skills;
   plain names + shim language on Codex).
4. `.claude/skills/` is **gitignored** (public npm package) — there is **no CI gate** on
   this sync. That absence of enforcement is why drift accumulates; this doc is the
   manual ledger that stands in for the missing gate.
5. Do not restore Codex-only deletions from Claude-local source material. The removed
   Codex `frontend-design`, `frontend-designer`, and `taste` skill dirs are intentional.
6. After any reconciliation, **append a signed Sync Log entry below**.

---

## Non-skill surfaces (verified 2026-07-06)

- **`AGENTS.md` ↔ `CLAUDE.md`:** healthy. All 5 `<!-- synced from AGENTS.md#X -->`
  sections present and matching (operating-model, backend, testing, engineering-
  principles, instance-bootstrap-gate). Contract: **edit `AGENTS.md` first, then mirror
  into `CLAUDE.md`** (SDK ships behavior from `CLAUDE.md`).
- **Memory:** NOT a shared surface. Claude = 80 files under
  `~/.claude/projects/-Users-manavsehgal-orionfold-relay/memory/` + `MEMORY.md` index.
  Codex = `memories_*.sqlite` DB (`~/.codex/memories/` dir is empty). Different systems;
  no sync expected or attempted.
- **Config:** `~/.codex/config.toml` (model, trust, MCP servers) is Codex-only with no
  Claude peer. `.claude/settings.local.json` is Claude-only. No cross-sync contract.

## Codex-Specific Deltas (verified 2026-07-07)

- **Browser use:** In Codex desktop sessions, Relay UI verification follows
  `docs/codex-browser-runbook.md`: in-app Browser/Browser plugin first for
  unauthenticated localhost/file/public pages; Codex Chrome extension for
  signed-in/profile/extension state; Computer Use for GUI-only desktop flows; Chrome
  DevTools MCP only for CDP debugging against an isolated debug browser. `open -a
  "Google Chrome" <url>` is not sufficient verification unless Chrome-control tooling is
  connected or the operator specifically needs to watch. Do not launch the normal Chrome
  app directly in headless mode unless explicitly requested. This is Codex-specific and
  does not constrain Claude Code browser tooling.
- **Stop hook:** `.codex/hooks.json` intentionally keeps only the PreToolUse secrets
  guard. The Codex `Stop` handoff nudge was removed because it fired too frequently.
  Use auto compact or operator-initiated handoff for Codex session wrap-up.
- **Memory:** Keep `MEMORY.md` and `CODEX-CC.md` aligned when changing
  Codex-only hooks, skills, settings, or browser guidance. Do not add these Codex-only
  notes to `CLAUDE.md`.

## Private Peer-Folder Privacy Guardrail

Claude Code and Codex must not use private local peer folders as Relay pack-content
sources. This includes `~/orionfold/peer-folders` and sibling private workspaces under
`~/orionfold/*` for marketing, website, consulting, LLC, self-wealth, self-health, books,
strategy, customer, prospect, channel, campaign, finance, health, legal, or tax work.

The issue was found and fixed on 2026-07-07: real Orionfold examples had shipped in
public npm pack seed files for the Marketing line. See `5b491819` (`v0.35.2`) for the
sanitized seeds, `53e5de5d` for private-peer guardrails and privacy regressions, and
strategy commit `c7a0a6e` for the strategy-side note.

Standing rule: `package.json` ships `src/`, so `src/lib/packs/templates/**` is public
package surface. Use synthetic seed data only. If a pack needs an existing project as
reference material, wait for a clean synthetic clone and cite that clone explicitly.

## `_ASSETS` Strategy Corpus And Static Demo Caveat

Codex picked up the post-`0.36.2` asset-corpus workstream after commit `8b6d3c0a`
(`docs(handoff): add assets corpus workstream`). The current state spans two repos:

- Relay repo tracked changes: `.gitignore` ignores `_ASSETS`, and `HANDOFF.md`
  carries the live `_ASSETS` pipeline status.
- Strategy repo content: `_ASSETS` in the Relay repo is a symlink to
  `~/orionfold/strategy/relay/_ASSETS`. Codex generated or edited corpus files there
  for features, journeys, seed, screenshots, API docs, user guides, stats, static-demo
  specs, demo source/dist, and flow reports.
- Commit boundary: do **not** stage/commit/push `_ASSETS` through the Relay repo.
  Treat it like `_SPECS`/`_IDEAS`: read/write strategy-owned material only when the
  operator asks, and commit the strategy repo only on explicit request.

Important live caveat: the static demo work under `_ASSETS/demo/` is only a foundation.
It has a generated static shell, fixtures, route/link/leak/coverage reports, browser
boot/API/EventSource shims, and a few local mutations, but the operator flagged that it
does **not** capture the intended simulation requirements. Before Claude Code uses the
demo as launch-ready source material, it must address or formally rescope the gap in
`HANDOFF.md`: lane completion, realistic state machines, Web Publisher preview/publish,
workflow/HITL progression, route-specific mutable data, license/pack update behavior,
and all-lane scripted smoke.

Use `_ASSETS/flow/README.md`, `_ASSETS/README.md`, and `HANDOFF.md` as the pickup
contract. The current pipeline order is:

```
features-catalog -> journeys -> seed -> screenshots -> api -> docs -> stats -> demo -> articles
```

Launch-assets/articles remain blocked until the demo simulation gap is resolved or the
operator approves a reduced-scope demo contract.

---

## Sync Log

_Newest at bottom. One signed, timestamped entry per update from either platform._

- **2026-07-06 — `[CC]` (Claude Code, Opus 4.8):** Created this doc. Audited all four
  cross-tool surfaces. Found `AGENTS.md`↔`CLAUDE.md`, memory, and tool-specific skill
  partitioning all healthy. Classified the 18 shared skills: 2 SHIM (`docx`, `xlsx`),
  14 PORT, 0 true bidirectional stale — Claude holds authoritative bodies, Codex holds
  thin shims/ports. Flagged only `product-manager` + `taste` for a human rule-level
  glance (Claude newer + Codex non-stub body). No files changed; report only.
- **2026-07-07 — `[CODEX]`:** Amended the ledger after Codex-specific cleanup. Marked
  `frontend-design`, `frontend-designer`, and `taste` as intentionally removed Codex
  skills; documented visible-OS-Chrome browser use, disabled Codex Stop hook behavior,
  and the requirement to keep `CODEX-CC.md`/`MEMORY.md` aligned. Added
  the private `~/orionfold/peer-folders` pack-data leak guardrail and linked the
  2026-07-07 seed sanitization/guardrail commits.
- **2026-07-07 — `[CODEX]`:** Replaced the stale visible-Chrome-first Codex browser rule
  with `docs/codex-browser-runbook.md` after checking current OpenAI Codex Browser,
  Chrome extension, Computer Use, MCP, and sandbox docs plus Chrome DevTools MCP and
  Chrome remote-debugging guidance. Mirrored the new rule through `AGENTS.md`,
  `CLAUDE.md`, `MEMORY.md`, and this ledger so future Codex sessions pick the right
  browser tool instead of retrying brittle Chrome paths.
- **2026-07-09 — `[CODEX]`:** Looked up repo history since the prior Codex
  coordination entry (`086cd984`) and current handoff state. Added the `_ASSETS`
  strategy-corpus contract and static-demo caveat so Claude Code does not mistake
  symlinked strategy output for Relay-tracked source or treat the partial static demo
  as launch-ready. Key facts: `_ASSETS` is strategy-owned and ignored by Relay; Codex
  generated seed/screenshot/docs/API/stats/demo assets there; launch-assets/articles
  are blocked until the demo simulation gap is fixed or explicitly rescoped.
- **2026-07-09 — `[CC]` (Claude Code, Opus 4.8):** Reviewed `_ASSETS` from first
  principles against the operator's two bars (`~/orionfold/books/` narrative content
  factory; `~/ainative-business.github.io/arena-app/` Arena real-app-bundle demo).
  Diagnosed why the operator is unhappy: the demo is a from-scratch card-grid MOCK
  (bare `{ok:true}` for every `/api/`, single-event streams, no state machines) not
  the Arena pattern its own `technical-spec.md` demands; "always in sync" was an
  unenforced promise; a file-existence verifier false-greened both. **Built two gates
  (strategy-owned, under `_ASSETS/`, both runnable by either platform):** (1) catalog
  drift-guard — NEW `_ASSETS/catalog/scripts/derive-feature-catalog.mjs` +
  `verify-feature-catalog.mjs` + `pack-aliases.json`, wired into
  `flow/pipeline-manifest.json` + supervisor `--strict`; fails CLOSED on undeclared
  pack / phantom feature / stale baseline. (2) demo BEHAVIORAL verifier — rewrote
  `_ASSETS/demo/scripts/verify-relay-demo.mjs` to drive Playwright (bare-ok shim,
  stream cadence, visible-DOM mutation, lane completion); proven RED on the current
  mock. **Two facts for Codex:** (a) `_ASSETS` scripts importing playwright must run
  `node --preserve-symlinks --preserve-symlinks-main …` (symlink realpath). (b) The
  flow supervisor checks file EXISTENCE only — it does NOT execute the verifiers; a
  forthcoming Claude-only `assets-` skill family (`assets-flow` etc., `.claude/skills/`)
  will RUN them and gate on exit code. These `assets-` skills are Claude-authored and
  need NO Codex shim (same partition as staging); the SCRIPTS they invoke are shared in
  `_ASSETS/` and Codex may run them directly. Next: demo Option C rebuild (seeded-
  prerender + Arena `boot.js` network shim), consolidation of `.refresh-pipeline/` +
  marketing scripts into `_ASSETS/`, and authoring the skill family. Full design:
  `~/.claude/plans/review-the-current-assets-expressive-bird.md`. No Relay-tracked files
  changed except `HANDOFF.md` + `CODEX-CC.md`; `_ASSETS` stays strategy-owned/uncommitted.
