import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  FilePlus2,
  FileText,
  Filter,
  RadioTower,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppDetail } from "@/lib/apps/registry";
import { listRows } from "@/lib/data/tables";
import { listDeployments } from "@/lib/publishers/app-publish";
import type { DeploymentRow } from "@/lib/db/schema";

type PageStatus = "all" | "published" | "draft" | "stale" | "failed";

interface WebPublisherPagesPanelProps {
  app: AppDetail;
  pageStatus?: string;
}

interface ParsedRow {
  id: string;
  data: Record<string, unknown>;
  updatedAt: Date;
}

export async function WebPublisherPagesPanel({
  app,
  pageStatus,
}: WebPublisherPagesPanelProps) {
  const selectedStatus = parsePageStatus(pageStatus);
  const sourceTableId = app.manifest.view?.bindings.generate?.table ?? null;
  const [sections, deployments] = await Promise.all([
    sourceTableId ? loadParsedRows(sourceTableId) : Promise.resolve([]),
    Promise.resolve(listDeployments(app.id)),
  ]);

  const latestSuccess = deployments.find((deployment) => deployment.status === "success") ?? null;
  const latestDeployment = deployments[0] ?? null;
  const latestFailure = deployments.find((deployment) => deployment.status === "failed") ?? null;
  const page = buildImplicitPage({ app, sourceTableId, sections, latestSuccess, latestDeployment });
  const visible = selectedStatus === "all" || selectedStatus === page.status;
  const sectionHref = sourceTableId ? `/tables/${encodeURIComponent(sourceTableId)}` : "#";

  return (
    <section className="surface-panel rounded-lg border p-4" aria-labelledby="publisher-pages-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Publisher workspace</Badge>
            <StatusBadge status={page.status} />
          </div>
          <h2 id="publisher-pages-heading" className="text-base font-medium">
            Pages
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Select the page whose sections, preview, and publish target you want to manage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled title="Multi-page creation requires the upcoming web_pages registry.">
            <FilePlus2 aria-hidden="true" />
            New page
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
            <Link href={`/apps/${encodeURIComponent(app.id)}?pageStatus=${status}`}>
              {statusLabel(status)}
            </Link>
          </Button>
        ))}
      </div>

      <div className="mt-4">
        {visible ? (
          <Card className="border-primary/25">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={page.status} />
                    <Badge variant="outline">{page.sectionCount} sections</Badge>
                    <Badge variant="outline">{page.publishedSectionCount} published rows</Badge>
                  </div>
                  <CardTitle className="mt-3 truncate text-base">{page.title}</CardTitle>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    {page.subtitle}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {page.liveUrl && (
                    <Button asChild size="sm">
                      <a href={page.liveUrl} target="_blank" rel="noreferrer">
                        <ArrowUpRight aria-hidden="true" />
                        Open live
                      </a>
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href="#site-publish-panel">
                      <RadioTower aria-hidden="true" />
                      Publish controls
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <ReadinessCell label="Hero" ok={page.hasHero} />
                <ReadinessCell label="CTA" ok={page.hasCta} />
                <ReadinessCell label="Images" ok={page.imageCount > 0} />
                <ReadinessCell label="Target" ok={Boolean(page.latestDeployment)} />
              </div>
              {latestFailure?.error && (
                <p className="mt-3 line-clamp-2 text-xs text-status-failed">
                  {latestFailure.error}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border border-dashed bg-[var(--surface-2)] p-4 text-sm text-muted-foreground">
            No pages match {statusLabel(selectedStatus).toLowerCase()}.
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        This pack currently publishes one implicit page from the section table. Multi-page creation needs a page registry so each page has its own slug, section set, preview, and publish state.
      </p>
    </section>
  );
}

function buildImplicitPage(input: {
  app: AppDetail;
  sourceTableId: string | null;
  sections: ParsedRow[];
  latestSuccess: DeploymentRow | null;
  latestDeployment: DeploymentRow | null;
}) {
  const sorted = [...input.sections].sort(
    (a, b) => numberValue(a.data.order) - numberValue(b.data.order)
  );
  const hero = sorted.find((row) => stringValue(row.data.kind) === "hero") ?? sorted[0];
  const cta = sorted.find((row) => stringValue(row.data.kind) === "cta");
  const latestSourceUpdate = sorted.reduce<Date | null>(
    (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
    null
  );
  const sourceChangedAfterPublish =
    Boolean(latestSourceUpdate && input.latestSuccess?.finishedAt) &&
    latestSourceUpdate!.getTime() > input.latestSuccess!.finishedAt!.getTime();
  const failedLatest = input.latestDeployment?.status === "failed";
  const status: Exclude<PageStatus, "all"> = failedLatest
    ? "failed"
    : sourceChangedAfterPublish
      ? "stale"
      : input.latestSuccess
        ? "published"
        : "draft";

  return {
    title:
      stringValue(hero?.data.heading) ||
      input.app.manifest.view?.bindings.generate?.siteTitle ||
      input.app.name,
    subtitle:
      stringValue(hero?.data.body) ||
      "Structured page sections ready for preview and publish.",
    sourceTableId: input.sourceTableId,
    status,
    sectionCount: sorted.length,
    publishedSectionCount: sorted.filter((row) => stringValue(row.data.status) === "published").length,
    hasHero: Boolean(hero),
    hasCta: Boolean(cta || sorted.some((row) => stringValue(row.data.ctaLabel) || stringValue(row.data.ctaUrl))),
    imageCount: sorted.filter((row) => stringValue(row.data.imageUrl)).length,
    latestDeployment: input.latestDeployment,
    liveUrl: input.latestSuccess?.finalUrl ?? input.latestSuccess?.url ?? null,
  };
}

async function loadParsedRows(tableId: string): Promise<ParsedRow[]> {
  const rows = await listRows(tableId, { limit: 100 });
  return rows.flatMap((row) => {
    try {
      const data = JSON.parse(row.data) as unknown;
      if (!data || typeof data !== "object" || Array.isArray(data)) return [];
      return [{ id: row.id, data: data as Record<string, unknown>, updatedAt: row.updatedAt }];
    } catch {
      return [];
    }
  });
}

function parsePageStatus(value: string | undefined): PageStatus {
  return value === "published" || value === "draft" || value === "stale" || value === "failed"
    ? value
    : "all";
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
