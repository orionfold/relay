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

---

## Surface health at a glance

| Surface | State | Action |
|---|---|---|
| `AGENTS.md` ↔ `CLAUDE.md` (5 synced sections) | ✅ In sync | none |
| Memory (Claude files vs Codex SQLite) | ✅ Independent by design | none — not a shared surface |
| Tool-specific skills (Claude-only staging; Codex-only OpenAI) | ✅ Correctly partitioned | none |
| 18 "shared" skills | ⚠️ Architecturally forked | reconcile only genuine stale-content cases (below) |

**Key finding (2026-07-06):** the 18 "shared" skills are **not** symmetrically synced
copies. The pattern is deliberate: **Claude holds the fat, authoritative skill body;
Codex holds a thin shim or condensed port** that routes back to (or mirrors) the Claude
version. So most "drift" is architectural, not accidental. A blind copy in either
direction would clobber real work. Reconcile case-by-case using the table below.

---

## Per-skill reconciliation report (the 18 shared skills)

Evidence captured 2026-07-06 by `[CC]`. `newer` = SKILL.md mtime. `lines` = C(laude)/X(codex).
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
| frontend-design | CODEX (same day) | 52/28 | no | PORT | Leave. Codex condensed port. |
| frontend-designer | CLAUDE | 436/57 | no | PORT | Leave. Claude is the full UX-strategy body; Codex is a thin standalone. |
| pdf | CLAUDE | 314/67 | quoting only | PORT | Leave. `name: "pdf"` (quoted) vs `pdf` is cosmetic. Claude is authoritative body. |
| pptx | CODEX | 232/26 | no | PORT | Leave. Codex condensed port. |
| product-manager | CLAUDE | 294/123 | no | PORT | **Watch.** Claude newer + Codex has a real 123-line body. If Claude gained backlog/roadmap rules, mirror the substantive ones into Codex. |
| quality-manager | CLAUDE | 514/73 | no | PORT | Leave. Claude authoritative; Codex thin port. |
| refer | CODEX | 88/25 | no | PORT | Leave. Codex condensed standalone; same `.claude/reference/` contract. |
| supervisor | CLAUDE | 540/65 | no | PORT | Leave. Claude authoritative; Codex thin port. |
| taste | CLAUDE | 251/119 | no | PORT | **Watch.** Claude newer (2026-04-18) + Codex has a substantive 119-line body. If Claude added design metrics/forbidden-patterns, mirror the rule set into Codex. |
| worktree-production | CODEX (same day) | 212/32 | no | PORT | Leave. Codex thin port; Claude full body. |
| writing-plans | CLAUDE | 56/36 | `-overrides` vs `writing-plans` | PORT | Leave. Claude = plugin override; Codex = port. |
| xlsx | CODEX | 291/20 | no | **SHIM** | Leave. Codex explicit compatibility shim → Claude body. |

**Net:** 2 SHIM + 14 PORT are intentional and need **no action**. Only 2 are worth a
human glance — **`product-manager`** and **`taste`** — where Claude is newer *and* Codex
carries a real (non-stub) body, so a substantive Claude rule addition might be worth
mirroring into Codex. Neither is a mechanical copy; both need a rule-level diff, not a
file overwrite.

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
5. After any reconciliation, **append a signed Sync Log entry below**.

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

---

## Sync Log

_Newest at bottom. One signed, timestamped entry per update from either platform._

- **2026-07-06 — `[CC]` (Claude Code, Opus 4.8):** Created this doc. Audited all four
  cross-tool surfaces. Found `AGENTS.md`↔`CLAUDE.md`, memory, and tool-specific skill
  partitioning all healthy. Classified the 18 shared skills: 2 SHIM (`docx`, `xlsx`),
  14 PORT, 0 true bidirectional stale — Claude holds authoritative bodies, Codex holds
  thin shims/ports. Flagged only `product-manager` + `taste` for a human rule-level
  glance (Claude newer + Codex non-stub body). No files changed; report only.
