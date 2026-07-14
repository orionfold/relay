import { notFound } from "next/navigation";
import { z } from "zod";
import { ChevronRight } from "lucide-react";
import { PageShell } from "@/components/shared/page-shell";
import { AppDetailActions } from "@/components/apps/app-detail-actions";
import { AppDetailEntryFocus } from "@/components/apps/app-detail-entry-focus";
import { AppPublishPanel } from "@/components/apps/app-publish-panel";
import { PackCompositionStrip } from "@/components/apps/pack-composition-strip";
import { PackRepositoryPanel } from "@/components/apps/pack-repository-panel";
import { WebDesignerShell } from "@/components/apps/web-designer-shell";
import { WebPublisherPagesPanel } from "@/components/apps/web-publisher-pages-panel";
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
  searchParams: Promise<{ period?: string; row?: string; pageStatus?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const period = PeriodSchema.parse(sp.period ?? "mtd");
  const rowParam = typeof sp.row === "string" ? sp.row : null;
  const selectedPageSlug = typeof sp.page === "string" ? sp.page : null;
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
  const isWebDesignerBundle = app.id === "relay-web-designer";
  const isWebPublisher = app.id === "relay-web-publisher";

  const headerActions = (
    <AppDetailActions
      appId={app.id}
      appName={app.name}
      tableCount={app.tableCount}
      scheduleCount={app.scheduleCount}
      fileCount={app.files.length}
    />
  );
  model.header.actions = headerActions;

  return (
    <PageShell backHref="/apps" backLabel="Installed packs">
      <AppDetailEntryFocus targetId="pack-detail-heading" />
      <div className="space-y-6">
        {isWebDesignerBundle ? (
          <div id="pack-detail-heading" tabIndex={-1} className="scroll-mt-[calc(var(--chrome-header)+1rem)] focus:outline-none">
            <WebDesignerShell app={app} actions={headerActions} />
          </div>
        ) : (
          <>
            <div id="pack-detail-heading" tabIndex={-1} className="scroll-mt-[calc(var(--chrome-header)+1rem)] focus:outline-none">
              <KitView model={model} />
            </div>
            {isWebPublisher && (
              <WebPublisherPagesPanel
                app={app}
                pageStatus={sp.pageStatus}
                selectedPageSlug={selectedPageSlug}
              />
            )}
          </>
        )}
        {isWebDesignerBundle ? (
          <>
            <details className="group rounded-lg border bg-[var(--surface-1)]">
              <summary className="flex list-none items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Bundle primitives</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Agents, workflows, tables, and schedules installed by this bundle
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
              </summary>
              <div className="border-t p-4">
                <PackCompositionStrip manifest={app.manifest} />
              </div>
            </details>
          </>
        ) : (
          <>
            <PackCompositionStrip manifest={app.manifest} />
            {generateBinding && publishBinding?.targetType === "github-pages" && (
              <div id="site-publish-panel" className="scroll-mt-[calc(var(--chrome-header)+1rem)]">
                <AppPublishPanel
                  appId={app.id}
                  targetType={publishBinding.targetType}
                  generatorType={generateBinding.generatorType}
                  sourceTable={generateBinding.table}
                  pageSlug={isWebPublisher ? selectedPageSlug ?? "home" : null}
                  pageTitle={isWebPublisher ? selectedPageSlug ?? "Home" : null}
                />
              </div>
            )}
          </>
        )}
        <div id="pack-repository-panel" className="scroll-mt-[calc(var(--chrome-header)+1rem)]">
          <PackRepositoryPanel
            appId={app.id}
            exportBlocked={Boolean(app.manifest.entitlement)}
          />
        </div>
      </div>
    </PageShell>
  );
}
