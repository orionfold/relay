# F9 — KPI Computed Expressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `kind: ratio` as a structured composition KPI source — composes two leaf sources into `numerator / denominator`, with explicit null/zero/non-numeric handling. Replace the `portfolio-manager` "Largest Position %" placeholder tile with a real ratio.

**Architecture:** The existing 6 leaf source kinds in `src/lib/apps/registry.ts` get extracted into `LeafKpiSourceSchema`. A new `RatioKpiSourceSchema` wraps two leaves. The two unite via `z.union`, keeping the leaf union non-recursive by construction. `evaluate-kpi.ts` extracts the existing switch into `evaluateLeaf` and wraps the public `evaluateKpi` with a ratio-first dispatch that uses `Promise.all` for parallel child eval and `computeRatio` for the null/zero/coercion guards.

**Tech Stack:** TypeScript, Zod, Vitest, Drizzle (via existing KpiContext), Next.js (for live smoke).

---

## File Structure

**Modify:**
- `src/lib/apps/registry.ts` — split `KpiSpecSchema` source into Leaf + Ratio + union.
- `src/lib/apps/view-kits/evaluate-kpi.ts` — extract `evaluateLeaf`, add `computeRatio`, dispatch ratio in `evaluateKpi`.
- `src/lib/apps/__tests__/view-schema.test.ts` — add ratio accept/reject schema tests.
- `src/lib/apps/view-kits/__tests__/evaluate-kpi.test.ts` — add ratio behavior tests.
- `~/.ainative/apps/portfolio-manager/manifest.yaml` — replace tile #3 with `Avg Position Value`.

**No new files.** All changes are surgical extensions of existing modules.

---

## Task 1: Schema — split leaf union, add ratio union

**Files:**
- Modify: `src/lib/apps/registry.ts:67-104`
- Test: `src/lib/apps/__tests__/view-schema.test.ts`

- [ ] **Step 1: Write the failing schema-accept test**

Add to `src/lib/apps/__tests__/view-schema.test.ts`, after the existing "rejects a KpiSpec with a formula-style source" test (around line 118):

```ts
  it("accepts a KpiSpec with kind: ratio composed of two leaf sources", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [
            {
              id: "avg",
              label: "Avg",
              format: "currency",
              source: {
                kind: "ratio",
                numerator: { kind: "tableSum", table: "t", column: "amount" },
                denominator: { kind: "tableCount", table: "t" },
              },
            },
          ],
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a ratio with a nested ratio (depth limited by construction)", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [
            {
              id: "x",
              label: "X",
              source: {
                kind: "ratio",
                numerator: {
                  kind: "ratio",
                  numerator: { kind: "tableCount", table: "t" },
                  denominator: { kind: "tableCount", table: "t" },
                },
                denominator: { kind: "tableCount", table: "t" },
              },
            },
          ],
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a ratio missing denominator", () => {
    const r = AppManifestSchema.safeParse({
      id: "a",
      name: "A",
      view: {
        kit: "tracker",
        bindings: {
          kpis: [
            {
              id: "x",
              label: "X",
              source: {
                kind: "ratio",
                numerator: { kind: "tableCount", table: "t" },
              },
            },
          ],
        },
      },
    });
    expect(r.success).toBe(false);
  });
```

- [ ] **Step 2: Run schema tests to verify the three new tests fail**

Run: `cd /Users/manavsehgal/Developer/ainative && npx vitest run src/lib/apps/__tests__/view-schema.test.ts`
Expected: 3 new tests FAIL (the union doesn't know about `ratio` yet); pre-existing tests still PASS.

- [ ] **Step 3: Refactor registry.ts — split leaf, add ratio**

Replace `src/lib/apps/registry.ts` lines 67-104 (the entire `KpiSpecSchema = z.object(...)` definition) with:

```ts
const LeafKpiSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tableCount"),
    table: z.string(),
    where: z.string().optional(),
  }),
  z.object({
    kind: z.literal("tableSum"),
    table: z.string(),
    column: z.string(),
  }),
  z.object({
    kind: z.literal("tableLatest"),
    table: z.string(),
    column: z.string(),
  }),
  z.object({
    kind: z.literal("blueprintRunCount"),
    blueprint: z.string(),
    window: z.enum(["7d", "30d"]).default("7d"),
  }),
  z.object({
    kind: z.literal("scheduleNextFire"),
    schedule: z.string(),
  }),
  z.object({
    kind: z.literal("tableSumWindowed"),
    table: z.string().min(1),
    column: z.string().min(1),
    sign: z.enum(["positive", "negative"]).optional(),
    window: z.enum(["mtd", "qtd", "ytd"]).optional(),
  }),
]);

const RatioKpiSourceSchema = z.object({
  kind: z.literal("ratio"),
  numerator: LeafKpiSourceSchema,
  denominator: LeafKpiSourceSchema,
});

const KpiSourceSchema = z.union([LeafKpiSourceSchema, RatioKpiSourceSchema]);

export const KpiSpecSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: KpiSourceSchema,
  format: z.enum(["int", "currency", "percent", "duration", "relative"]).default("int"),
});
```

Note: `LeafKpiSourceSchema` and `RatioKpiSourceSchema` are not exported — they are implementation details of `KpiSpecSchema`. `KpiSpecSchema` itself stays exported, signature unchanged from a consumer's perspective.

- [ ] **Step 4: Run schema tests to verify all pass**

Run: `cd /Users/manavsehgal/Developer/ainative && npx vitest run src/lib/apps/__tests__/view-schema.test.ts`
Expected: ALL tests PASS, including the three new ratio tests AND the existing "rejects formula-style source" test (since `formula` is neither a leaf kind nor `ratio`).

- [ ] **Step 5: Type-check the registry change**

Run: `cd /Users/manavsehgal/Developer/ainative && npx tsc --noEmit 2>&1 | grep -E "registry|view-kits" | head -20`
Expected: NO errors mentioning `registry.ts` or `view-kits/`. The discriminated-union type inferred by `z.union` of two arms differs from a single discriminated union, but consumers that switch on `source.kind` should continue to type-narrow correctly because TypeScript still narrows literal kinds across the union.

If `evaluate-kpi.ts:37` (`switch (spec.source.kind)`) errors with a non-exhaustive switch, that's expected — Task 2 fixes it.

- [ ] **Step 6: Commit**

```bash
cd /Users/manavsehgal/Developer/ainative
git add src/lib/apps/registry.ts src/lib/apps/__tests__/view-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(view-kits): add KPI ratio source kind to schema

Split KpiSpecSchema source into LeafKpiSourceSchema (the existing 6
kinds) and RatioKpiSourceSchema (numerator + denominator over leaves).
Schema rejects nested ratios by construction. Engine dispatch lands in
follow-up commit.

Per F9 design (docs/superpowers/specs/2026-05-08-f9-kpi-computed-expressions-design.md).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Engine — extract evaluateLeaf, add ratio dispatch

**Files:**
- Modify: `src/lib/apps/view-kits/evaluate-kpi.ts`
- Test: `src/lib/apps/view-kits/__tests__/evaluate-kpi.test.ts`

- [ ] **Step 1: Write the failing ratio happy-path test**

Add to `src/lib/apps/view-kits/__tests__/evaluate-kpi.test.ts`, after the closing `});` of the second describe block (after line 157):

```ts
describe("evaluateKpi — ratio composition", () => {
  it("computes numerator / denominator for two leaf sources", async () => {
    const tableSum = vi.fn(async () => 1000);
    const tableCount = vi.fn(async () => 4);
    const spec: KpiSpec = {
      id: "avg",
      label: "Avg",
      format: "currency",
      source: {
        kind: "ratio",
        numerator: { kind: "tableSum", table: "t", column: "amount" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const tile = await evaluateKpi(spec, makeCtx({ tableSum, tableCount }));
    expect(tableSum).toHaveBeenCalledWith("t", "amount");
    expect(tableCount).toHaveBeenCalledWith("t", undefined);
    expect(tile.value).toBe("$250.00");
  });

  it("renders em-dash when denominator is 0", async () => {
    const spec: KpiSpec = {
      id: "x",
      label: "X",
      format: "currency",
      source: {
        kind: "ratio",
        numerator: { kind: "tableSum", table: "t", column: "a" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const tile = await evaluateKpi(
      spec,
      makeCtx({
        tableSum: vi.fn(async () => 100),
        tableCount: vi.fn(async () => 0),
      })
    );
    expect(tile.value).toBe("—");
  });

  it("renders em-dash when numerator is null", async () => {
    const spec: KpiSpec = {
      id: "x",
      label: "X",
      format: "int",
      source: {
        kind: "ratio",
        numerator: { kind: "tableLatest", table: "t", column: "c" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const tile = await evaluateKpi(
      spec,
      makeCtx({
        tableLatest: vi.fn(async () => null),
        tableCount: vi.fn(async () => 5),
      })
    );
    expect(tile.value).toBe("—");
  });

  it("renders em-dash when a child returns a non-numeric string", async () => {
    const spec: KpiSpec = {
      id: "x",
      label: "X",
      format: "int",
      source: {
        kind: "ratio",
        numerator: { kind: "tableLatest", table: "t", column: "c" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const tile = await evaluateKpi(
      spec,
      makeCtx({
        tableLatest: vi.fn(async () => "running"),
        tableCount: vi.fn(async () => 5),
      })
    );
    expect(tile.value).toBe("—");
  });

  it("formats ratio with format: percent (multiplies by 100)", async () => {
    const spec: KpiSpec = {
      id: "win-rate",
      label: "Win rate",
      format: "percent",
      source: {
        kind: "ratio",
        numerator: { kind: "tableCount", table: "t", where: "won" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const calls: Array<[string, string | undefined]> = [];
    const tableCount = vi.fn(async (tbl: string, where: string | undefined) => {
      calls.push([tbl, where]);
      return where === "won" ? 3 : 12;
    });
    const tile = await evaluateKpi(spec, makeCtx({ tableCount }));
    expect(calls).toContainEqual(["t", "won"]);
    expect(calls).toContainEqual(["t", undefined]);
    expect(tile.value).toBe("25%");
  });

  it("evaluates numerator and denominator in parallel", async () => {
    const order: string[] = [];
    const tableSum = vi.fn(async () => {
      order.push("sum-start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("sum-end");
      return 100;
    });
    const tableCount = vi.fn(async () => {
      order.push("count-start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("count-end");
      return 4;
    });
    const spec: KpiSpec = {
      id: "avg",
      label: "Avg",
      format: "int",
      source: {
        kind: "ratio",
        numerator: { kind: "tableSum", table: "t", column: "a" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    await evaluateKpi(spec, makeCtx({ tableSum, tableCount }));
    expect(order.indexOf("sum-start")).toBeLessThan(order.indexOf("count-end"));
    expect(order.indexOf("count-start")).toBeLessThan(order.indexOf("sum-end"));
  });
});
```

Also update `makeCtx` to include `tableSumWindowed` (currently missing the default — see line 7-16):

```ts
function makeCtx(over: Partial<KpiContext> = {}): KpiContext {
  return {
    tableCount: vi.fn(async () => 42),
    tableSum: vi.fn(async () => 100),
    tableLatest: vi.fn(async () => "bar"),
    blueprintRunCount: vi.fn(async () => 7),
    scheduleNextFire: vi.fn(async () => 1_700_000_000_000),
    tableSumWindowed: vi.fn(async () => 0),
    ...over,
  };
}
```

- [ ] **Step 2: Run evaluate-kpi tests to verify the new tests fail**

Run: `cd /Users/manavsehgal/Developer/ainative && npx vitest run src/lib/apps/view-kits/__tests__/evaluate-kpi.test.ts`
Expected: 6 new ratio tests FAIL (engine doesn't dispatch ratio yet — `evaluateKpi` falls through the switch with no match). Pre-existing tests PASS.

- [ ] **Step 3: Refactor evaluate-kpi.ts — extract leaf, add ratio dispatch**

Replace the entire body of `src/lib/apps/view-kits/evaluate-kpi.ts` with:

```ts
import type { ViewConfig } from "@/lib/apps/registry";
import { formatKpi, type KpiPrimitive } from "./format-kpi";
import type { KpiTile } from "./types";

type KpiSpec = NonNullable<ViewConfig["bindings"]["kpis"]>[number];
type KpiSource = KpiSpec["source"];
type LeafKpiSource = Exclude<KpiSource, { kind: "ratio" }>;

/**
 * Data-access surface for KPI evaluation. Concrete implementations live in
 * `kpi-context.ts` (DB-backed) and tests (in-memory mocks). Each method
 * returns the raw value; formatting happens in `evaluateKpi`.
 *
 * Why an interface (rather than direct DB calls inside `evaluateKpi`):
 * the switch stays unit-testable without a DB, and Phase 3+ kits can extend
 * the interface without touching this file.
 */
export interface KpiContext {
  tableCount(table: string, where: string | undefined): Promise<KpiPrimitive>;
  tableSum(table: string, column: string): Promise<KpiPrimitive>;
  tableLatest(table: string, column: string): Promise<KpiPrimitive>;
  blueprintRunCount(blueprint: string, window: "7d" | "30d"): Promise<KpiPrimitive>;
  scheduleNextFire(schedule: string): Promise<KpiPrimitive>;
  tableSumWindowed(
    table: string,
    column: string,
    sign: "positive" | "negative" | undefined,
    window: "mtd" | "qtd" | "ytd" | undefined
  ): Promise<KpiPrimitive>;
}

/**
 * Pure switch over a leaf KpiSource. New leaf kinds require a code change
 * here AND a Zod arm in `LeafKpiSourceSchema` — by design (no formula
 * strings, no manifest escape hatch).
 */
async function evaluateLeaf(source: LeafKpiSource, ctx: KpiContext): Promise<KpiPrimitive> {
  switch (source.kind) {
    case "tableCount":
      return ctx.tableCount(source.table, source.where);
    case "tableSum":
      return ctx.tableSum(source.table, source.column);
    case "tableLatest":
      return ctx.tableLatest(source.table, source.column);
    case "blueprintRunCount":
      return ctx.blueprintRunCount(source.blueprint, source.window);
    case "scheduleNextFire":
      return ctx.scheduleNextFire(source.schedule);
    case "tableSumWindowed":
      return ctx.tableSumWindowed(
        source.table,
        source.column,
        source.sign,
        source.window
      );
  }
}

/**
 * Combine two leaf-evaluated values into a ratio. Returns null when either
 * child is non-numeric or denominator is zero — the formatter renders null
 * as an em-dash, which is the design-system convention for "no value yet".
 *
 * No implicit string→number coercion: if a manifest author wires a
 * `tableLatest` over a status column as numerator, the tile renders `—`
 * rather than misleadingly numbering a label.
 */
function computeRatio(num: KpiPrimitive, den: KpiPrimitive): KpiPrimitive {
  if (typeof num !== "number" || typeof den !== "number") return null;
  if (den === 0) return null;
  return num / den;
}

/**
 * Public entry. Dispatches `ratio` (parallel-evaluating its two leaf
 * children) and falls through to `evaluateLeaf` for the six leaf kinds.
 */
export async function evaluateKpi(spec: KpiSpec, ctx: KpiContext): Promise<KpiTile> {
  let raw: KpiPrimitive;
  if (spec.source.kind === "ratio") {
    const [num, den] = await Promise.all([
      evaluateLeaf(spec.source.numerator, ctx),
      evaluateLeaf(spec.source.denominator, ctx),
    ]);
    raw = computeRatio(num, den);
  } else {
    raw = await evaluateLeaf(spec.source, ctx);
  }
  return {
    id: spec.id,
    label: spec.label,
    value: formatKpi(raw, spec.format),
  };
}
```

- [ ] **Step 4: Run evaluate-kpi tests to verify all pass**

Run: `cd /Users/manavsehgal/Developer/ainative && npx vitest run src/lib/apps/view-kits/__tests__/evaluate-kpi.test.ts`
Expected: ALL tests PASS, including all 6 new ratio tests.

- [ ] **Step 5: Run all view-kits tests to catch any cross-file regressions**

Run: `cd /Users/manavsehgal/Developer/ainative && npx vitest run src/lib/apps/`
Expected: ALL tests PASS. Particular interest in `tracker.test.ts`, `workflow-hub.test.ts`, `default-kpis.test.ts`, `kpi-context.test.ts` — none of them should be broken because `evaluateLeaf` is private and `evaluateKpi`'s public signature is unchanged.

- [ ] **Step 6: Type-check end-to-end**

Run: `cd /Users/manavsehgal/Developer/ainative && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/manavsehgal/Developer/ainative
git add src/lib/apps/view-kits/evaluate-kpi.ts src/lib/apps/view-kits/__tests__/evaluate-kpi.test.ts
git commit -m "$(cat <<'EOF'
feat(view-kits): dispatch ratio in evaluateKpi

Extract evaluateLeaf for the six leaf source kinds; evaluateKpi now
checks for kind=ratio first and runs both children via Promise.all,
combining via computeRatio. Null/zero/non-numeric children render as
em-dash via formatKpi's existing convention.

Per F9 design (docs/superpowers/specs/2026-05-08-f9-kpi-computed-expressions-design.md).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Live reproducer — portfolio-manager manifest

**Files:**
- Modify: `~/.ainative/apps/portfolio-manager/manifest.yaml` (lines 40-46)

This step does NOT use TDD — it's a config change verified by a live screenshot. The failing fixture is the existing wrong tile.

- [ ] **Step 1: Capture a "before" screenshot**

Open the dev server if not already running (per MEMORY.md guidance):
```bash
cd /Users/manavsehgal/Developer/ainative
ps aux | grep "next-server" | grep -v grep
# if not running:
# npm run dev (background)
```

Navigate to `http://localhost:3000/apps/portfolio-manager` in Claude in Chrome. Capture the KPI tile row to `/tmp/f9-before.png`. Note the value rendered for "Largest Position %" — it will be a number that doesn't make sense as a percentage (e.g. `"$1,500.00"` if the latest market_value write happened to be 1500).

- [ ] **Step 2: Edit the manifest**

Replace lines 40-46 of `~/.ainative/apps/portfolio-manager/manifest.yaml`:

```yaml
      - id: largest-position-pct
        label: Largest Position %
        source:
          kind: tableLatest
          table: 8f744af3-1b0f-424b-950c-71ca9d74184f
          column: market_value
        format: percent
```

with:

```yaml
      - id: avg-position-value
        label: Avg Position Value
        source:
          kind: ratio
          numerator:
            kind: tableSum
            table: 8f744af3-1b0f-424b-950c-71ca9d74184f
            column: market_value
          denominator:
            kind: tableCount
            table: 8f744af3-1b0f-424b-950c-71ca9d74184f
        format: currency
```

- [ ] **Step 3: Capture an "after" screenshot**

In Claude in Chrome, hard-reload `http://localhost:3000/apps/portfolio-manager` (Cmd+Shift+R) and capture to `/tmp/f9-after.png`. The third tile should now read "Avg Position Value" and render a currency number that equals `Total Market Value / Total Positions` from the same row of tiles (visual sanity check).

- [ ] **Step 4: Verify with a query against the live DB**

Run a one-shot smoke script (saved in project root, gitignored via dot-prefix per HANDOFF.md line 108):

```bash
cd /Users/manavsehgal/Developer/ainative
cat > .f9-smoke.ts <<'EOF'
import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";

const db = new Database(join(homedir(), ".ainative", "ainative.db"), { readonly: true });
const TABLE = "8f744af3-1b0f-424b-950c-71ca9d74184f";

const sumRow = db.prepare(`
  SELECT COALESCE(SUM(CAST(json_extract(data, '$.market_value') AS REAL)), 0) AS total
  FROM user_table_rows WHERE table_id = ?
`).get(TABLE) as { total: number };

const countRow = db.prepare(`
  SELECT COUNT(*) AS n FROM user_table_rows WHERE table_id = ?
`).get(TABLE) as { n: number };

const avg = countRow.n === 0 ? null : sumRow.total / countRow.n;
console.log("total market value:", sumRow.total);
console.log("position count:", countRow.n);
console.log("expected avg position value:", avg);
EOF
npx tsx .f9-smoke.ts
```

Expected: a numeric `expected avg position value`. Compare against the value rendered in the screenshot — they should match.

- [ ] **Step 5: Clean up the smoke script**

```bash
cd /Users/manavsehgal/Developer/ainative
rm .f9-smoke.ts
```

- [ ] **Step 6: Commit the manifest change**

The manifest lives at `~/.ainative/apps/portfolio-manager/manifest.yaml` (outside the repo). It's not tracked. The "commit" here is recording the change in F9's design doc — done in Task 4.

---

## Task 4: Update spec status + handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-05-08-f9-kpi-computed-expressions-design.md` (frontmatter `status: draft` → `status: shipped`)

- [ ] **Step 1: Update spec status**

Edit the frontmatter of `docs/superpowers/specs/2026-05-08-f9-kpi-computed-expressions-design.md` — change `status: draft` to `status: shipped`. Add at the bottom:

```markdown
## Verification (2026-05-08)

- Schema tests: 3 added, all green. Existing 6-leaf coverage preserved.
- Engine tests: 6 added (happy path, den=0, null numerator, non-numeric child, percent format, parallel eval).
- All `src/lib/apps/` tests green.
- portfolio-manager manifest updated; "Avg Position Value" tile renders end-to-end against the live DB.
- Smoke check confirmed total/count/avg from `.f9-smoke.ts` matches the rendered tile.
```

- [ ] **Step 2: Run full test suite as the final pass**

Run: `cd /Users/manavsehgal/Developer/ainative && npm test 2>&1 | tail -40`
Expected: 2171 + 9 (3 schema + 6 engine) = 2180 passing. The 8 pre-existing failures (router / settings / api-version-window / phase-5-blueprints-validity) remain unchanged — they are not on F9's path. If any new failure appears, it is a regression and must be fixed before commit.

- [ ] **Step 3: Commit spec update**

```bash
cd /Users/manavsehgal/Developer/ainative
git add docs/superpowers/specs/2026-05-08-f9-kpi-computed-expressions-design.md
git commit -m "$(cat <<'EOF'
docs(f9): mark KPI ratio shipped + verification record

All schema/engine tests green; portfolio-manager Avg Position Value
tile verified end-to-end against live DB.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Schema (Leaf + Ratio + union, depth=2 by construction) → Task 1 ✓
- Evaluator (extract evaluateLeaf, ratio dispatch, computeRatio) → Task 2 ✓
- Semantics (den=0 / null / non-numeric) → Task 2 tests ✓
- Reproducer ship-gate (Avg Position Value) → Task 3 ✓
- Acceptance criteria (all 6 enumerated) → Tasks 1-3 ✓

**Placeholder scan:** All test code blocks contain real `expect`s. All file paths are concrete. All commit messages are concrete. No "implement later" language.

**Type consistency:** `KpiSpec`, `KpiSource`, `LeafKpiSource`, `KpiContext`, `KpiPrimitive`, `KpiTile` are used consistently across Tasks 1-2. `evaluateLeaf` is the same name used in both the engine extraction (Task 2 step 3) and the test descriptions (Task 2 step 1).

**Spec gap:** none — every section of the design doc maps to a task. The "out of scope" items (other ops, tableMax/Min/Avg, sandboxed evaluator, nested ratios, loadColumnSchemas swallow) are correctly NOT planned.
