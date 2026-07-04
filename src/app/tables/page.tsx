import { listTables } from "@/lib/data/tables";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { listApps } from "@/lib/apps/registry";
import { TableBrowser } from "@/components/tables/table-browser";
import { PageShell } from "@/components/shared/page-shell";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const tables = await listTables();

  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects);

  // Installed packs — mark tables whose projectId is a pack with a pack pill
  // (FEAT-8) instead of the plain project name.
  const installedPacks = listApps().map((a) => ({ id: a.id, name: a.name }));

  return (
    <PageShell title="Tables">
      <TableBrowser
        initialTables={tables}
        projects={projectList}
        installedPacks={installedPacks}
      />
    </PageShell>
  );
}
