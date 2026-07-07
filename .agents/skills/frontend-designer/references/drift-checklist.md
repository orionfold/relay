# Drift Detection — Grep Patterns

Exact patterns to check during Mode 4 Design System audits.
Run each check against `src/` files (.tsx, .ts, .css), excluding node_modules, .next, dist.

---

## 1. Forbidden Pattern Scan (CRITICAL)

**Source:** `design-system/tokens.json` → `forbidden.patterns[]`

Read `tokens.json` and grep each pattern in `src/**/*.{tsx,ts,css}`. Skip comment lines (lines starting with `//`, `*`, `/*`). Any match = CRITICAL drift.

Current forbidden list (as of tokens.json v2.0.0):
- `backdrop-filter`, `backdrop-blur`
- `rgba(`
- `--glass-`, `--gradient-`, `--blur-glass`
- `glass-card`, `glass-shimmer`
- `gradient-morning`, `gradient-ocean`, `gradient-forest`, `gradient-sunset`, `gradient-twilight`, `gradient-neutral`
- `rounded-[24px]`, `rounded-[28px]`, `rounded-[30px]`

## 2. Semantic Token Compliance (HIGH)

Grep for raw Tailwind colors used where semantic tokens should be:

| Grep Pattern | Context Check | Correct Token |
|-------------|---------------|---------------|
| `text-green-` | Near status/success | `text-status-completed` |
| `text-red-` | Near error/fail | `text-status-failed` or `text-destructive` |
| `text-blue-` | Near active/running | `text-status-running` |
| `text-amber-` or `text-yellow-` | Near warning | `text-status-warning` |
| `bg-green-` | Status background | `bg-status-completed` |
| `bg-red-` | Status background | `bg-status-failed` or `bg-destructive` |

**Context matters:** Not every `text-green-*` is wrong — only when used for status/priority indication. Check surrounding code for status-related variable names or props.

## 3. Surface Hierarchy Compliance (MEDIUM)

| Grep Pattern | Issue | Fix |
|-------------|-------|-----|
| `bg-white` | Bypasses surface system | Use `surface-card` or `bg-card` |
| `bg-black` | Forbidden in both themes | Use dark base via CSS var |
| `bg-zinc-` | Bypasses surface tokens | Use `surface-*` / `bg-muted` / `bg-secondary` |
| `bg-slate-` | Bypasses surface tokens | Use `surface-*` / `bg-muted` / `bg-secondary` |
| `bg-gray-` | Bypasses surface tokens | Use `surface-*` / `bg-muted` / `bg-secondary` |

**Exception:** `bg-white` in test files or SVG definitions is acceptable.

## 4. Elevation Consistency (MEDIUM)

| Grep Pattern | Issue | Fix |
|-------------|-------|-----|
| `shadow-lg` without `elevation-` class | Shadow-first elevation | Use `elevation-2` or `elevation-3` |
| `shadow-xl` | Oversized shadow | Use `elevation-3` |
| `shadow-2xl` | Oversized shadow | Use `elevation-3` |
| `backdrop-blur` | Forbidden | Remove (see DD-003) |
| `backdrop-filter` | Forbidden | Remove (see DD-003) |

**How to check:** For shadow findings, inspect the same element/component for a co-located `elevation-*` class. If present, the shadow is part of the elevation system and is acceptable.

## 5. Spacing Grid Adherence (LOW)

Grep for arbitrary spacing values: `p-\[`, `m-\[`, `gap-\[`, `space-x-\[`, `space-y-\[`

For each match, check if the pixel value is on the 4px grid:
- **Acceptable:** `p-[2px]` (half-step), `p-[4px]`, `p-[8px]`, `p-[12px]`, `p-[16px]`, `p-[24px]`, `p-[32px]`
- **Flagged:** `p-[5px]`, `p-[7px]`, `p-[13px]`, `p-[15px]`, `p-[17px]`

**Exception:** Single-pixel values (`1px`) are acceptable for borders and fine dividers.

## 6. Radius Compliance (LOW)

| Grep Pattern | Context | Issue |
|-------------|---------|-------|
| `rounded-2xl` | On cards/containers | Max is `rounded-xl` (12px) |
| `rounded-3xl` | Anywhere | Oversized |
| `rounded-full` | On cards/containers/panels | Oversized (OK on avatars, badges, pills, indicators) |

**How to check:** For `rounded-full` hits, read surrounding JSX — if it's an avatar, badge, or indicator element, it's acceptable. If it's a card, panel, or container, it's drift.

## 7. Font Compliance (LOW)

| Grep Pattern | Issue |
|-------------|-------|
| `Geist` (case-sensitive) | Removed font family (migrated to Inter) |
| `geist-sans` | Removed font variable |
| `geist-mono` | Removed font variable |
| `font-[` with arbitrary family | Bypasses font system |

**Exception:** References in comments, documentation, or this skill's own files are acceptable.

## 8. Component Pattern Compliance (MEDIUM)

These require heuristic checking (not just grep):

**PageShell usage:**
- Read `src/app/**/page.tsx` files
- Each should import and use `PageShell` from `@/components/shared/page-shell`
- Pages that build their own layout wrapper = drift (see DD-007)

**StatusChip usage:**
- Grep for status rendering patterns (badge + status text)
- Check if they use `StatusChip` from `@/components/shared/status-chip`
- Inline status rendering that reinvents StatusChip = drift (see DD-011)

**FilterBar usage:**
- Grep for filter UI patterns (input + select + clear button combinations)
- Check if they use `FilterBar` from `@/components/shared/filter-bar`
- Inline filter UI that reinvents FilterBar = drift

**Shared component awareness:**
Check `src/components/shared/` for the current inventory of shared components. Any new page that duplicates shared component functionality = drift.
