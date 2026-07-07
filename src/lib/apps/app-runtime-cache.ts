import type { AppDetail } from "@/lib/apps/registry";

export function appIdsOwningTable(tableId: string, apps: AppDetail[]): string[] {
  return apps
    .filter((app) => app.manifest.tables.some((table) => table.id === tableId))
    .map((app) => app.id);
}

export async function revalidateAppRuntimeForTable(tableId: string): Promise<string[]> {
  const { listAppsWithManifestsCached } = await import("@/lib/apps/registry");
  const appIds = appIdsOwningTable(tableId, listAppsWithManifestsCached());
  if (appIds.length === 0) return [];

  try {
    const { revalidatePath, revalidateTag } = await import("next/cache");
    for (const appId of appIds) {
      revalidateTag(`app-runtime:${appId}`, { expire: 0 });
      revalidatePath(`/apps/${appId}`);
    }
    revalidatePath(`/tables/${tableId}`);
  } catch (err) {
    console.warn(
      "[app-runtime-cache] failed to revalidate app runtime cache:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return appIds;
}
