import { notFound } from "next/navigation";
import { z } from "zod";
import { PageShell } from "@/components/shared/page-shell";
import { AppDetailActions } from "@/components/apps/app-detail-actions";
import { AppPublishPanel } from "@/components/apps/app-publish-panel";
import { KitView } from "@/components/apps/kit-view/kit-view";
import { getApp } from "@/lib/apps/registry";
import { loadColumnSchemas, pickKit } from "@/lib/apps/view-kits";
import { resolveBindings } from "@/lib/apps/view-kits/resolve";
import { loadRuntimeState } from "@/lib/apps/view-kits/data";

export const dynamic = "force-dynamic";

const PeriodSchema = z.enum(["mtd", "qtd", "ytd"]).default("mtd");

export default async function AppDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; row?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const period = PeriodSchema.parse(sp.period ?? "mtd");
  const rowParam = typeof sp.row === "string" ? sp.row : null;
  const app = getApp(id);
  if (!app) notFound();

  const columns = await loadColumnSchemas(app.manifest);
  const kit = pickKit(app.manifest, columns);
  const bindings = resolveBindings(app.manifest);
  const projection = kit.resolve({ manifest: app.manifest, columns, period, rowId: rowParam });
  const runtime = await loadRuntimeState(app, bindings, kit.id, projection, rowParam);
  const model = kit.buildModel(projection, runtime);
  const generateBinding = app.manifest.view?.bindings.generate;
  const publishBinding = app.manifest.view?.bindings.publish;

  model.header.actions = (
    <AppDetailActions
      appId={app.id}
      appName={app.name}
      tableCount={app.tableCount}
      scheduleCount={app.scheduleCount}
      fileCount={app.files.length}
    />
  );

  return (
    <PageShell backHref="/apps" backLabel="All apps">
      <div className="space-y-6">
        <KitView model={model} />
        {generateBinding && publishBinding?.targetType === "github-pages" && (
          <AppPublishPanel
            appId={app.id}
            targetType={publishBinding.targetType}
            generatorType={generateBinding.generatorType}
            sourceTable={generateBinding.table}
          />
        )}
      </div>
    </PageShell>
  );
}
