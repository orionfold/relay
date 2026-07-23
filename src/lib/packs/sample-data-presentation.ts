import type { KpiTile } from "@/lib/apps/view-kits/types";
import type { SampleDataSummary } from "./sample-data";

const AGENCY_KPI_TABLES: Record<string, string> = {
  "active-clients": "clients",
  "billed-mtd": "engagements",
  "costs-mtd": "engagements",
  "margin-mtd": "engagements",
};

export function discloseAgencySampleKpis(
  tiles: KpiTile[],
  summary: SampleDataSummary
): KpiTile[] {
  const samplesByTableName = new Map(
    summary.tableCounts.map((table) => [
      table.tableName.toLowerCase(),
      table.untouched + table.edited,
    ])
  );
  return tiles.map((tile) => {
    const tableName = AGENCY_KPI_TABLES[tile.id];
    if (!tableName || (samplesByTableName.get(tableName) ?? 0) === 0) {
      return tile;
    }
    return {
      ...tile,
      hint: tile.hint
        ? `${tile.hint} · Includes synthetic sample data`
        : "Includes synthetic sample data",
    };
  });
}
