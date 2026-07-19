export interface PackRemovalCounts {
  appName: string;
  tableCount: number;
  profileCount: number;
  blueprintCount: number;
  scheduleCount: number;
  fileCount: number;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function list(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function buildPackRemovalDescription({
  appName,
  tableCount,
  profileCount,
  blueprintCount,
  scheduleCount,
  fileCount,
}: PackRemovalCounts): string {
  const removed = [
    scheduleCount > 0
      ? countLabel(scheduleCount, "schedule", "schedules")
      : null,
    fileCount > 0
      ? countLabel(fileCount, "installed-pack file", "installed-pack files")
      : null,
  ].filter((item): item is string => item !== null);

  const retained = [
    tableCount > 0
      ? `${countLabel(tableCount, "table", "tables")} and ${tableCount === 1 ? "its" : "their"} rows, columns, and triggers`
      : "any tables and their rows, columns, and triggers",
    countLabel(profileCount, "reusable profile", "reusable profiles"),
    countLabel(blueprintCount, "reusable blueprint", "reusable blueprints"),
    "durable customers and customer attribution",
  ];

  const removalDetail =
    removed.length > 0 ? ` and deletes ${list(removed)}` : "";

  return (
    `This removes ${appName} from Installed packs${removalDetail}. ` +
    `Relay keeps ${list(retained)} available for reuse. ` +
    `Removing a pack does not delete a Relay Cell. Delete retained data ` +
    `separately from its owning view if intended.`
  );
}
