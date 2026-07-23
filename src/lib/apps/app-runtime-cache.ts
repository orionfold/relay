import type { AppDetail } from "@/lib/apps/registry";

export function appIdsOwningTable(tableId: string, apps: AppDetail[]): string[] {
  return apps
    .filter((app) => app.manifest.tables.some((table) => table.id === tableId))
    .map((app) => app.id);
}

export async function revalidateAppRuntime(
  appId: string,
  options: { throwOnError?: boolean } = {},
): Promise<void> {
  try {
    const { revalidatePath, revalidateTag } = await import("next/cache");
    revalidateTag(`app-runtime:${appId}`, { expire: 0 });
    revalidatePath(`/apps/${appId}`);
  } catch (err) {
    console.warn(
      "[app-runtime-cache] failed to revalidate app runtime cache:",
      err instanceof Error ? err.message : String(err)
    );
    if (options.throwOnError) throw err;
  }
}

export async function revalidateAppRuntimeForTable(tableId: string): Promise<string[]> {
  const { listAppsWithManifestsCached } = await import("@/lib/apps/registry");
  const appIds = appIdsOwningTable(tableId, listAppsWithManifestsCached());
  if (appIds.length === 0) return [];

  await Promise.all(appIds.map((appId) => revalidateAppRuntime(appId)));

  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/tables/${tableId}`);
  } catch (err) {
    console.warn(
      "[app-runtime-cache] failed to revalidate table path:",
      err instanceof Error ? err.message : String(err)
    );
  }

  return appIds;
}
