import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  FileText,
  GalleryHorizontal,
  Globe2,
  Layers3,
  RadioTower,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppDetail, AppManifest } from "@/lib/apps/registry";
import { listRows } from "@/lib/data/tables";
import {
  listDeployments,
  listPublishTargets,
} from "@/lib/publishers/app-publish";
import type { DeploymentRow, PublishTargetRow } from "@/lib/db/schema";
import { ViewKitBadge } from "@/components/apps/view-kit-badge";
import type { ViewKitHeaderMeta } from "@/lib/apps/view-kits/types";

interface WebDesignerShellProps {
  app: AppDetail;
  actions: ReactNode;
  viewKit: ViewKitHeaderMeta;
}

interface ParsedRow {
  id: string;
  data: Record<string, unknown>;
  updatedAt: Date;
}

interface PageCard {
  title: string;
  subtitle: string;
  sourceTableId: string | null;
  sectionCount: number;
  publishedSectionCount: number;
  hasHero: boolean;
  hasCta: boolean;
  imageCount: number;
  latestSourceUpdate: Date | null;
}

export async function WebDesignerShell({
  app,
  actions,
  viewKit,
}: WebDesignerShellProps) {
  const generate = app.manifest.view?.bindings.generate;
  const sourceTableId = generate?.table ?? null;
  const assetTable = findAssetTable(app.manifest);
  const [sections, assets] = await Promise.all([
    sourceTableId ? loadParsedRows(sourceTableId) : Promise.resolve([]),
    assetTable ? loadParsedRows(assetTable.id) : Promise.resolve([]),
  ]);

  const deployments = listDeployments(app.id);
  const targets = listPublishTargets(app.id);
  const latestDeployment = deployments[0] ?? null;
  const latestSuccess = deployments.find((deployment) => deployment.status === "success") ?? null;
  const latestFailure = deployments.find((deployment) => deployment.status === "failed") ?? null;
  const activeDeployments = deployments.filter((deployment) =>
    deployment.status === "pending" || deployment.status === "publishing"
  );
  const page = buildImplicitPage({
    app,
    sourceTableId,
    sections,
  });
  const latestTarget = targets[0] ?? null;
  const publishUrl = latestSuccess?.finalUrl ?? latestSuccess?.url ?? null;
  const sourceChangedAfterPublish =
    Boolean(page.latestSourceUpdate && latestSuccess?.finishedAt) &&
    page.latestSourceUpdate!.getTime() > latestSuccess!.finishedAt!.getTime();

  return (
    <section className="space-y-4" aria-labelledby="web-designer-heading">
      <div className="surface-panel rounded-lg border p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Bundle workspace</Badge>
              <StatusBadge
                status={
                  activeDeployments.length > 0
                    ? "publishing"
                    : sourceChangedAfterPublish
                      ? "stale"
                      : latestSuccess
                        ? "published"
                        : "draft"
                }
              />
            </div>
            <div>
              <h1 id="web-designer-heading" className="text-2xl font-bold">
                {app.name}
              </h1>
              {app.description && (
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  {app.description}
                </p>
              )}
              <ViewKitBadge resolution={viewKit} />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={FileText}
          label="Pages"
          value="1"
          detail={publishUrl ? "Live page tracked" : "Draft page tracked"}
        />
        <MetricCard
          icon={Layers3}
          label="Sections"
          value={String(page.sectionCount)}
          detail={`${page.publishedSectionCount} published rows`}
        />
        <MetricCard
          icon={GalleryHorizontal}
          label="Assets"
          value={String(assets.length)}
          detail={`${countActiveAssets(assets)} ready to use`}
        />
        <MetricCard
          icon={RadioTower}
          label="Deployments"
          value={String(deployments.length)}
          detail={latestFailure ? "Latest failure recorded" : "No open failures"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">Pages</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tracked outputs from Web Publisher. Preview and publish controls live there.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={sourceTableId ? `/tables/${encodeURIComponent(sourceTableId)}` : "#"}>
                  <FileText aria-hidden="true" />
                  Sections
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="surface-card rounded-lg border p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={
                        activeDeployments.length > 0
                          ? "publishing"
                          : sourceChangedAfterPublish
                            ? "stale"
                            : latestSuccess
                              ? "published"
                              : "draft"
                      }
                    />
                    {latestTarget && <Badge variant="outline">{targetLabel(latestTarget)}</Badge>}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-medium">{page.title}</h2>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                      {page.subtitle}
                    </p>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                    <ReadinessCell label="Hero" ok={page.hasHero} />
                    <ReadinessCell label="CTA" ok={page.hasCta} />
                    <ReadinessCell label="Images" ok={page.imageCount > 0} />
                    <ReadinessCell label="Publish" ok={Boolean(latestSuccess)} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {publishUrl && (
                    <Button asChild size="sm">
                      <a href={publishUrl} target="_blank" rel="noreferrer">
                        <Globe2 aria-hidden="true" />
                        Open live
                      </a>
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href="/apps/relay-web-publisher">
                      <RadioTower aria-hidden="true" />
                      Open Publisher
                    </Link>
                  </Button>
                </div>
              </div>
              {latestDeployment && (
                <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  Last deployment:{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(latestDeployment.finishedAt ?? latestDeployment.startedAt)}
                  </span>
                  {latestDeployment.error && (
                    <span className="ml-2 text-status-failed">{latestDeployment.error}</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Asset readiness</CardTitle>
            <p className="text-xs text-muted-foreground">
              Reusable proof, offers, and references from the Web Assets half.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {assets.length === 0 ? (
              <EmptyState label="No assets yet" />
            ) : (
              assets.slice(0, 4).map((asset) => (
                <Link
                  key={asset.id}
                  href={`/tables/${encodeURIComponent(assetTable!.id)}?row=${encodeURIComponent(asset.id)}`}
                  className="surface-card block rounded-lg border p-3 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{stringValue(asset.data.title) || "Untitled asset"}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {stringValue(asset.data.summary) || stringValue(asset.data.source_note) || "No summary"}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{stringValue(asset.data.page_role) || "asset"}</Badge>
                    {stringValue(asset.data.status) && (
                      <Badge variant={stringValue(asset.data.status) === "active" ? "success" : "outline"}>
                        {stringValue(asset.data.status)}
                      </Badge>
                    )}
                  </div>
                </Link>
              ))
            )}
            {assetTable && (
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/tables/${encodeURIComponent(assetTable.id)}`}>
                  <GalleryHorizontal aria-hidden="true" />
                  Asset library
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Publish report</CardTitle>
          <p className="text-xs text-muted-foreground">
            Read-only deployment history. Change targets and publish from Web Publisher.
          </p>
        </CardHeader>
        <CardContent>
          {deployments.length === 0 ? (
            <EmptyState label="No deployments yet" />
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {deployments.slice(0, 6).map((deployment) => (
                <div key={deployment.id} className="surface-card rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <StatusBadge status={deployment.status} />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {deployment.id.slice(0, 8)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(deployment.finishedAt ?? deployment.startedAt)}
                  </p>
                  {(deployment.finalUrl ?? deployment.url) && (
                    <a
                      href={deployment.finalUrl ?? deployment.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <span className="truncate">{deployment.finalUrl ?? deployment.url}</span>
                      <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  )}
                  {deployment.error && (
                    <p className="mt-2 line-clamp-2 text-xs text-status-failed">
                      {deployment.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function buildImplicitPage(input: {
  app: AppDetail;
  sourceTableId: string | null;
  sections: ParsedRow[];
}): PageCard {
  const sorted = [...input.sections].sort(
    (a, b) => numberValue(a.data.order) - numberValue(b.data.order)
  );
  const hero = sorted.find((row) => stringValue(row.data.kind) === "hero") ?? sorted[0];
  const cta = sorted.find((row) => stringValue(row.data.kind) === "cta");
  const latestSourceUpdate = sorted.reduce<Date | null>(
    (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
    null
  );

  return {
    title:
      stringValue(hero?.data.heading) ||
      input.app.manifest.view?.bindings.generate?.siteTitle ||
      input.app.name,
    subtitle:
      stringValue(hero?.data.body) ||
      "Structured page sections ready for preview and publish.",
    sourceTableId: input.sourceTableId,
    sectionCount: sorted.length,
    publishedSectionCount: sorted.filter((row) => stringValue(row.data.status) === "published").length,
    hasHero: Boolean(hero),
    hasCta: Boolean(cta || sorted.some((row) => stringValue(row.data.ctaLabel) || stringValue(row.data.ctaUrl))),
    imageCount: sorted.filter((row) => stringValue(row.data.imageUrl)).length,
    latestSourceUpdate,
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

function findAssetTable(manifest: AppManifest) {
  return manifest.tables.find((table) => {
    const columns = table.columns ?? [];
    return columns.includes("asset_type") && columns.includes("page_role");
  });
}

function countActiveAssets(rows: ParsedRow[]) {
  return rows.filter((row) => stringValue(row.data.status) === "active").length;
}

function targetLabel(target: PublishTargetRow) {
  try {
    const config = JSON.parse(target.config) as Record<string, unknown>;
    const owner = stringValue(config.owner);
    const repo = stringValue(config.repo);
    const branch = stringValue(config.branch) || "gh-pages";
    return owner && repo ? `${owner}/${repo}:${branch}` : target.targetType;
  } catch {
    return target.targetType;
  }
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

function formatDate(value: Date | null) {
  if (!value) return "Not finished";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function StatusBadge({
  status,
}: {
  status: DeploymentRow["status"] | "published" | "draft" | "stale";
}) {
  if (status === "success" || status === "published") {
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
  if (status === "pending" || status === "publishing") {
    return (
      <Badge className="border-status-running/25 bg-status-running/10 text-status-running">
        <RefreshCw aria-hidden="true" />
        Publishing
      </Badge>
    );
  }
  return <Badge variant="outline">Draft</Badge>;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-[var(--surface-2)]">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-[var(--surface-2)] p-4 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
