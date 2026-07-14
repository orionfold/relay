import type { AppManifest } from "@/lib/apps/registry";
import { pickKit as pickKitId, resolveKitSelection } from "./inference";
import { coachKit } from "./kits/coach";
import { inboxKit } from "./kits/inbox";
import { ledgerKit } from "./kits/ledger";
import { placeholderKit } from "./kits/placeholder";
import { researchKit } from "./kits/research";
import { trackerKit } from "./kits/tracker";
import { workflowHubKit } from "./kits/workflow-hub";
import type { ColumnSchemaRef, KitDefinition, KitId } from "./types";

/**
 * View-kit registry. Phase 2 ships `tracker` + `workflow-hub` alongside the
 * Phase 1.1 `placeholder`. Phase 3 adds `coach` + `ledger`. Phase 4 adds
 * `inbox` + `research`. All seven kit ids in `KitId` are now registered.
 */
export const viewKits: Record<KitId, KitDefinition | undefined> = {
  placeholder: placeholderKit,
  tracker: trackerKit,
  "workflow-hub": workflowHubKit,
  coach: coachKit,
  ledger: ledgerKit,
  inbox: inboxKit,
  research: researchKit,
};

/**
 * Resolve a `KitId` to a `KitDefinition`. Falls back to `placeholderKit` for
 * any id not yet registered, so Phase 1.2 inference can return real kit ids
 * without blocking on Phase 2+ kit implementations.
 */
export function resolveKit(id: KitId | string): KitDefinition {
  if (id in viewKits) {
    return viewKits[id as KitId] ?? placeholderKit;
  }
  return placeholderKit;
}

/**
 * Phase 1.2: `pickKit` now delegates to the inference decision table and
 * resolves the returned id to a kit definition (with `placeholder` fallback).
 * The signature is preserved from Phase 1.1 so the dispatcher call site is
 * untouched.
 */
export function pickKit(
  manifest: AppManifest,
  columns: ColumnSchemaRef[]
): KitDefinition {
  const id = pickKitId(manifest, columns);
  return resolveKit(id);
}

/**
 * Per-table column row as returned by the data layer (`getColumns`). Kept
 * minimal here so we don't take a full DB-row dependency in pure code paths.
 */
export interface ColumnRowLike {
  name: string;
  dataType: string;
  config: string | null;
}

export type GetColumnsFn = (tableId: string) => Promise<ColumnRowLike[]>;

/**
 * `loadColumnSchemas(app, [getColumns])` reads each manifest table's columns
 * via the data layer and shapes them for the inference predicates. The
 * `semantic` field comes from the column's JSON `config.semantic` (Option A
 * from the Phase 1 strategy decision: no DB migration in Phase 1).
 *
 * `getColumns` is injected for testability; production callers omit it and
 * the real `@/lib/data/tables#getColumns` is used.
 */
export async function loadColumnSchemas(
  manifest: AppManifest,
  getColumns?: GetColumnsFn
): Promise<ColumnSchemaRef[]> {
  const fetcher: GetColumnsFn =
    getColumns ?? (async (id) => {
      const mod = await import("@/lib/data/tables");
      const rows = await mod.getColumns(id);
      return rows.map((r) => ({
        name: r.name,
        dataType: r.dataType,
        config: r.config,
      }));
    });

  const out: ColumnSchemaRef[] = [];
  for (const t of manifest.tables) {
    let rows: ColumnRowLike[] = [];
    try {
      rows = await fetcher(t.id);
    } catch {
      rows = [];
    }
    out.push({
      tableId: t.id,
      columns: rows.map((r) => ({
        name: r.name,
        type: r.dataType,
        semantic: extractSemantic(r.config),
        format: extractFormat(r.config),
      })),
    });
  }
  return out;
}

function extractSemantic(config: string | null): string | undefined {
  if (!config) return undefined;
  try {
    const parsed = JSON.parse(config) as { semantic?: unknown };
    return typeof parsed.semantic === "string" ? parsed.semantic : undefined;
  } catch {
    return undefined;
  }
}

function extractFormat(config: string | null): string | undefined {
  if (!config) return undefined;
  try {
    const parsed = JSON.parse(config) as { format?: unknown };
    return typeof parsed.format === "string" ? parsed.format : undefined;
  } catch {
    return undefined;
  }
}

export type { KitDefinition, KitId, ColumnSchemaRef };
export { placeholderKit, resolveKitSelection };
