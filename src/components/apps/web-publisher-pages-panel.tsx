import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ArrowUpRight,
  BadgeCheck,
  FilePlus2,
  FileText,
  Filter,
  RadioTower,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AppDetail } from "@/lib/apps/registry";
import { getApp } from "@/lib/apps/registry";
import {
  DEFAULT_WEB_PAGE_SLUG,
  createWebPublisherPage,
  deleteWebPublisherPage,
  ensureWebPageRegistry,
  filterSectionsForPage,
  renameWebPublisherPage,
  selectWebPage,
  type ParsedTableRow,
  type WebPageRecord,
} from "@/lib/apps/web-pages";
import { listDeployments } from "@/lib/publishers/app-publish";
import type { DeploymentRow } from "@/lib/db/schema";

type PageStatus = "all" | "published" | "draft" | "stale" | "failed";

interface WebPublisherPagesPanelProps {
  app: AppDetail;
  pageStatus?: string;
  selectedPageSlug?: string | null;
}

interface PageView {
  page: WebPageRecord;
  title: string;
  subtitle: string;
  status: Exclude<PageStatus, "all">;
  sectionCount: number;
  publishedSectionCount: number;
  hasHero: boolean;
  hasCta: boolean;
  imageCount: number;
  latestDeployment: DeploymentRow | null;
  latestFailure: DeploymentRow | null;
  liveUrl: string | null;
}

export async function createPublisherPageAction(formData: FormData) {
  "use server";

  const appId = String(formData.get("appId") ?? "");
  const app = appId ? getApp(appId) : null;
  if (!app) return;

  const page = await createWebPublisherPage(app);
  revalidatePath(`/apps/${encodeURIComponent(app.id)}`);
  redirect(`/apps/${encodeURIComponent(app.id)}?page=${encodeURIComponent(page.slug)}`);
}

export async function deletePublisherPageAction(formData: FormData) {
  "use server";

  const appId = String(formData.get("appId") ?? "");
  const pageSlug = String(formData.get("pageSlug") ?? "");
  const currentPageSlug = String(formData.get("currentPageSlug") ?? "");
  const app = appId ? getApp(appId) : null;
  if (!app || !pageSlug) return;

  const result = await deleteWebPublisherPage(app, pageSlug);
  const nextPageSlug =
    currentPageSlug && currentPageSlug !== result.deletedPageSlug
      ? currentPageSlug
      : result.nextPageSlug;
  revalidatePath(`/apps/${encodeURIComponent(app.id)}`);
  redirect(`/apps/${encodeURIComponent(app.id)}?page=${encodeURIComponent(nextPageSlug)}`);
}

export async function renamePublisherPageAction(formData: FormData) {
  "use server";

  const appId = String(formData.get("appId") ?? "");
  const pageSlug = String(formData.get("pageSlug") ?? "");
  const title = String(formData.get("title") ?? "");
  const app = appId ? getApp(appId) : null;
  if (!app || !pageSlug) return;

  await renameWebPublisherPage(app, pageSlug, title);
  revalidatePath(`/apps/${encodeURIComponent(app.id)}`);
  redirect(`/apps/${encodeURIComponent(app.id)}?page=${encodeURIComponent(pageSlug)}`);
}

export async function WebPublisherPagesPanel({
  app,
  pageStatus,
  selectedPageSlug,
}: WebPublisherPagesPanelProps) {
  const selectedStatus = parsePageStatus(pageStatus);
  const registry = await ensureWebPageRegistry(app);
  const selectedPage = selectWebPage(registry, selectedPageSlug);
  const deployments = listDeployments(app.id);
  const pageViews = registry.pages.map((page) =>
    buildPageView({
      app,
      page,
      sections: filterSectionsForPage(registry.sections, page.slug),
      deployments: deployments.filter((deployment) => deploymentPageSlug(deployment) === page.slug),
    })
  );
  const selectedView =
    pageViews.find((view) => view.page.slug === selectedPage.slug) ?? pageViews[0] ?? null;
  const visible = pageViews.filter(
    (view) => selectedStatus === "all" || selectedStatus === view.status
  );
  const sectionHref = `/tables/${encodeURIComponent(registry.sectionsTableId)}`;
  const pagesHref = `/tables/${encodeURIComponent(registry.pagesTableId)}`;

  return (
    <section className="surface-panel rounded-lg border p-4" aria-labelledby="publisher-pages-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Publisher workspace</Badge>
            {selectedView && <StatusBadge status={selectedView.status} />}
          </div>
          <h2 id="publisher-pages-heading" className="text-base font-medium">
            Pages
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Select the page whose sections, preview, and publish target you want to manage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={createPublisherPageAction}>
            <input type="hidden" name="appId" value={app.id} />
            <Button type="submit" variant="outline" size="sm">
              <FilePlus2 aria-hidden="true" />
              New page
            </Button>
          </form>
          <Button asChild variant="outline" size="sm">
            <Link href={pagesHref}>
              <FileText aria-hidden="true" />
              Pages table
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={sectionHref}>
              <FileText aria-hidden="true" />
              Sections table
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          Filter
        </span>
        {(["all", "published", "draft", "stale", "failed"] as const).map((status) => (
          <Button
            key={status}
            asChild
            variant={selectedStatus === status ? "secondary" : "ghost"}
            size="xs"
          >
            <Link
              href={publisherHref(app.id, {
                page: selectedPage.slug,
                pageStatus: status,
              })}
            >
              {statusLabel(status)}
            </Link>
          </Button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        {visible.length > 0 ? (
          visible.map((view) => {
            const selected = view.page.slug === selectedPage.slug;
            const canDelete = registry.pages.length > 1;
            return (
              <Card key={view.page.slug} className={selected ? "border-primary/50" : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={view.status} />
                        <Badge variant="outline">{view.sectionCount} sections</Badge>
                        <Badge variant="outline">{view.publishedSectionCount} published rows</Badge>
                        {selected && <Badge variant="outline">Selected</Badge>}
                      </div>
                      <CardTitle className="sr-only">{view.title}</CardTitle>
                      <form
                        action={renamePublisherPageAction}
                        className="mt-3 flex max-w-2xl flex-col gap-2 sm:flex-row"
                      >
                        <input type="hidden" name="appId" value={app.id} />
                        <input type="hidden" name="pageSlug" value={view.page.slug} />
                        <Input
                          aria-label={`Page title for ${view.page.slug}`}
                          name="title"
                          defaultValue={view.title}
                          className="h-8 text-sm font-medium"
                        />
                        <Button type="submit" variant="outline" size="sm" className="shrink-0">
                          <Save aria-hidden="true" />
                          Save name
                        </Button>
                      </form>
                      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        {view.subtitle}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        /{view.page.slug}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {view.liveUrl && (
                        <Button asChild size="sm">
                          <a href={view.liveUrl} target="_blank" rel="noreferrer">
                            <ArrowUpRight aria-hidden="true" />
                            Open live
                          </a>
                        </Button>
                      )}
                      <Button asChild variant={selected ? "default" : "outline"} size="sm">
                        <Link href={`${publisherHref(app.id, { page: view.page.slug })}#site-publish-panel`}>
                          <RadioTower aria-hidden="true" />
                          {selected ? "Publish controls" : "Select page"}
                        </Link>
                      </Button>
                      <form action={deletePublisherPageAction}>
                        <input type="hidden" name="appId" value={app.id} />
                        <input type="hidden" name="pageSlug" value={view.page.slug} />
                        <input type="hidden" name="currentPageSlug" value={selectedPage.slug} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          disabled={!canDelete}
                          title={
                            canDelete
                              ? `Delete ${view.title}`
                              : "Create another page before deleting this one."
                          }
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 aria-hidden="true" />
                          Delete page
                        </Button>
                      </form>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <ReadinessCell label="Hero" ok={view.hasHero} />
                    <ReadinessCell label="CTA" ok={view.hasCta} />
                    <ReadinessCell label="Images" ok={view.imageCount > 0} />
                    <ReadinessCell label="Target" ok={Boolean(view.latestDeployment)} />
                  </div>
                  {view.latestFailure?.error && (
                    <p className="mt-3 line-clamp-2 text-xs text-status-failed">
                      {view.latestFailure.error}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed bg-[var(--surface-2)] p-4 text-sm text-muted-foreground">
            No pages match {statusLabel(selectedStatus).toLowerCase()}.
          </div>
        )}
      </div>
    </section>
  );
}

function buildPageView(input: {
  app: AppDetail;
  page: WebPageRecord;
  sections: ParsedTableRow[];
  deployments: DeploymentRow[];
}): PageView {
  const sorted = [...input.sections].sort(
    (a, b) => numberValue(a.data.order) - numberValue(b.data.order)
  );
  const hero = sorted.find((row) => stringValue(row.data.kind) === "hero") ?? sorted[0];
  const cta = sorted.find((row) => stringValue(row.data.kind) === "cta");
  const latestSuccess = input.deployments.find((deployment) => deployment.status === "success") ?? null;
  const latestDeployment = input.deployments[0] ?? null;
  const latestFailure = input.deployments.find((deployment) => deployment.status === "failed") ?? null;
  const latestSourceUpdate = sorted.reduce<Date | null>(
    (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
    null
  );
  const sourceChangedAfterPublish =
    Boolean(latestSourceUpdate && latestSuccess?.finishedAt) &&
    latestSourceUpdate!.getTime() > latestSuccess!.finishedAt!.getTime();
  const failedLatest = latestDeployment?.status === "failed";
  const status: Exclude<PageStatus, "all"> = failedLatest
    ? "failed"
    : sourceChangedAfterPublish
      ? "stale"
      : latestSuccess
        ? "published"
        : "draft";

  return {
    page: input.page,
    title:
      input.page.title ||
      stringValue(hero?.data.heading) ||
      input.app.manifest.view?.bindings.generate?.siteTitle ||
      input.app.name,
    subtitle:
      input.page.description ||
      stringValue(hero?.data.body) ||
      "Structured page sections ready for preview and publish.",
    status,
    sectionCount: sorted.length,
    publishedSectionCount: sorted.filter((row) => stringValue(row.data.status) === "published").length,
    hasHero: Boolean(hero),
    hasCta: Boolean(cta || sorted.some((row) => stringValue(row.data.ctaLabel) || stringValue(row.data.ctaUrl))),
    imageCount: sorted.filter((row) => stringValue(row.data.imageUrl)).length,
    latestDeployment,
    latestFailure,
    liveUrl: latestSuccess?.finalUrl ?? latestSuccess?.url ?? null,
  };
}

function parsePageStatus(value: string | undefined): PageStatus {
  return value === "published" || value === "draft" || value === "stale" || value === "failed"
    ? value
    : "all";
}

function publisherHref(
  appId: string,
  input: { page?: string | null; pageStatus?: PageStatus | null }
) {
  const params = new URLSearchParams();
  if (input.page) params.set("page", input.page);
  if (input.pageStatus) params.set("pageStatus", input.pageStatus);
  const query = params.toString();
  return `/apps/${encodeURIComponent(appId)}${query ? `?${query}` : ""}`;
}

function deploymentPageSlug(deployment: DeploymentRow) {
  return deployment.pageSlug || DEFAULT_WEB_PAGE_SLUG;
}

function statusLabel(status: PageStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function StatusBadge({ status }: { status: Exclude<PageStatus, "all"> }) {
  if (status === "published") {
    return (
      <Badge className="border-status-completed/25 bg-status-completed/15 text-status-completed">
        <BadgeCheck aria-hidden="true" />
        Published
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge className="border-status-failed/25 bg-status-failed/10 text-status-failed">
        <TriangleAlert aria-hidden="true" />
        Failed
      </Badge>
    );
  }
  if (status === "stale") {
    return (
      <Badge className="border-status-warning/25 bg-status-warning/10 text-status-warning">
        <TriangleAlert aria-hidden="true" />
        Stale
      </Badge>
    );
  }
  return <Badge variant="outline">Draft</Badge>;
}

function ReadinessCell({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-[var(--surface-2)] px-2 py-1.5">
      <span
        className={
          ok
            ? "h-2 w-2 rounded-full bg-status-completed"
            : "h-2 w-2 rounded-full bg-status-warning"
        }
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </div>
  );
}
