import Link from "next/link";
import { PageShell } from "@/components/shared/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Boxes,
  Briefcase,
  Building2,
  Check,
  Lock,
  Package,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listApps } from "@/lib/apps/registry";
import { listPackTemplates, type PackTemplate } from "@/lib/packs/catalog";
import { packPrice, type PackPrice } from "@/lib/packs/format";
import { packUpdateAvailability } from "@/lib/packs/update";
import { changelogWindow } from "@/lib/licensing/recap";
import { PackInstallButton } from "@/components/packs/pack-install-button";
import { PackUpdateButton } from "@/components/packs/pack-update-button";

export const dynamic = "force-dynamic";

/**
 * Local-first bundled-pack browser (NOT a marketplace — feature-cut fence).
 * Premium packs are visible-but-locked (D6): every user sees what exists,
 * what it materializes, and what it costs; only the content install is gated.
 * A locked premium pack renders as a full-width feature panel — the sales
 * copy and the two-phase offer are the conversion surface (#20/#21).
 */

/** Bundled icon names (pack.yaml `icon:`) → lucide glyphs. Never remote. */
const PACK_ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  "building-2": Building2,
};

function packIcon(template: PackTemplate): LucideIcon {
  const iconName = template.meta?.icon;
  if (iconName && PACK_ICONS[iconName]) return PACK_ICONS[iconName];
  return template.meta?.entitlement ? Lock : Package;
}

type PackFilter = "all" | "free" | "premium";

function resolveFilter(raw: string | string[] | undefined): PackFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "free" || v === "premium" ? v : "all";
}

export default async function PacksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const params = await searchParams;
  const filter = resolveFilter(params.filter);
  const templates = listPackTemplates();
  const installedIds = new Set(listApps().map((a) => a.id));

  const isPremium = (t: PackTemplate) => Boolean(t.meta?.entitlement);
  // Corrupt templates ignore the filter — a packaging bug must stay visible.
  const visible = templates.filter(
    (t) =>
      t.error ||
      filter === "all" ||
      (filter === "premium" ? isPremium(t) : !isPremium(t))
  );
  const featured = visible.filter(
    (t) => !t.error && isPremium(t) && !installedIds.has(t.id)
  );
  const standard = visible.filter((t) => !featured.includes(t));
  const counts: Record<PackFilter, number> = {
    all: templates.length,
    free: templates.filter((t) => !t.error && !isPremium(t)).length,
    premium: templates.filter((t) => !t.error && isPremium(t)).length,
  };

  return (
    <PageShell
      title="Packs"
      description="Vertical content bundles. An app, profiles, blueprints, tables, and seed data installed in one step."
      filters={
        templates.length > 1 ? (
          <FilterChips active={filter} counts={counts} />
        ) : undefined
      }
    >
      {templates.length === 0 ? (
        <EmptyHero />
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {filter} packs in this build.{" "}
          <Link
            href="/packs"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Show all packs
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          {featured.map((t) => (
            <FeaturedPackCard key={t.id} template={t} />
          ))}
          {standard.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {standard.map((t) => (
                <PackCard
                  key={t.id}
                  template={t}
                  installed={installedIds.has(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

function FilterChips({
  active,
  counts,
}: {
  active: PackFilter;
  counts: Record<PackFilter, number>;
}) {
  const chips: Array<{ value: PackFilter; label: string; href: string }> = [
    { value: "all", label: "All", href: "/packs" },
    { value: "free", label: "Free", href: "/packs?filter=free" },
    { value: "premium", label: "Premium", href: "/packs?filter=premium" },
  ];
  return (
    <nav aria-label="Filter packs" className="flex items-center gap-2">
      {chips.map((c) => (
        <Link
          key={c.value}
          href={c.href}
          aria-current={active === c.value ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            active === c.value
              ? "border-transparent bg-primary text-primary-foreground"
              : "surface-control text-muted-foreground hover:text-foreground"
          )}
        >
          {c.label}
          <span
            className={cn(
              "tabular-nums",
              active === c.value
                ? "text-primary-foreground/70"
                : "text-muted-foreground/70"
            )}
          >
            {counts[c.value]}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Two-phase offer: founding intro leads, list price stays as the anchor. */
function OfferPrice({ price }: { price: PackPrice }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight">
          {price.intro ?? price.list}
        </span>
        {price.intro && (
          <span className="text-sm text-muted-foreground line-through">
            {price.list}
          </span>
        )}
      </div>
      {price.note && (
        <p className="mt-1 text-xs text-muted-foreground">{price.note}</p>
      )}
    </div>
  );
}

/**
 * Cross-pack relationship line (free↔paid). Additive framing only — the packs
 * coexist. A link (internal path or purchase URL) is rendered when `href` is
 * set; otherwise the text stands alone. Same copy source on every card variant.
 */
function RelatedNote({
  related,
}: {
  related: NonNullable<PackTemplate["meta"]>["related"];
}) {
  if (!related) return null;
  const isInternal = related.href?.startsWith("/");
  return (
    <p className="text-xs text-muted-foreground">
      {related.text}
      {related.href &&
        (isInternal ? (
          <>
            {" "}
            <Link
              href={related.href}
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              See packs →
            </Link>
          </>
        ) : (
          <>
            {" "}
            <a
              href={related.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              Learn more →
            </a>
          </>
        ))}
    </p>
  );
}

/**
 * Locked premium pack — the conversion hero. Full sales copy at a readable
 * measure (never clamped), offer rail with the two-phase price + CTAs.
 */
function FeaturedPackCard({ template }: { template: PackTemplate }) {
  const meta = template.meta!;
  const Icon = packIcon(template);
  const price = packPrice(meta);

  return (
    <Card
      tone="pack"
      emphasis="featured"
      watermark={Icon}
      className="relative transition-colors"
    >
      <CardContent className="relative p-4 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <div className="surface-card-muted flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">
                  {meta.name}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Premium
                  </Badge>
                  {template.primitivesSummary && (
                    <span className="text-[11px] text-muted-foreground/70">
                      {template.primitivesSummary}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {meta.description && (
              <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                {meta.description}
              </p>
            )}
            {meta.related && <RelatedNote related={meta.related} />}
          </div>

          <div className="surface-card-muted flex flex-col gap-4 rounded-lg border p-4 lg:self-start">
            {price && <OfferPrice price={price} />}
            <div className="space-y-2">
              <PackInstallButton
                packId={template.id}
                packName={meta.name}
                premium
              />
              {meta.purchaseUrl && (
                <a
                  href={meta.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs font-medium text-foreground underline underline-offset-2 hover:text-primary"
                >
                  Get license →
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PackCard({
  template,
  installed,
}: {
  template: PackTemplate;
  installed: boolean;
}) {
  if (template.error) {
    // A corrupt BUNDLED template is a packaging bug — surface it, never hide it.
    return (
      <Card className="h-full border-destructive/50">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <TriangleAlert
              className="h-4 w-4 text-destructive shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm font-medium truncate">{template.id}</span>
          </div>
          <p className="text-xs text-destructive/90 break-words">
            Bundled pack failed to load: {template.error}
          </p>
        </CardContent>
      </Card>
    );
  }

  const meta = template.meta!;
  const premium = Boolean(meta.entitlement);
  const Icon = packIcon(template);
  const price = packPrice(meta);

  return (
    <Card
      tone="pack"
      watermark={Icon}
      className="relative h-full hover:border-primary/50 transition-colors"
    >
      <CardContent className="relative flex h-full flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-sm font-medium truncate">{meta.name}</span>
          {premium && !installed && (
            <Badge variant="outline" className="shrink-0">
              {price?.intro ?? price?.list ?? "Premium"}
            </Badge>
          )}
        </div>

        {meta.description && (
          <p className="text-xs text-muted-foreground line-clamp-3">
            {meta.description}
          </p>
        )}
        {template.primitivesSummary && (
          <p className="text-[11px] text-muted-foreground/70">
            {template.primitivesSummary}
          </p>
        )}
        {meta.related && <RelatedNote related={meta.related} />}

        <div className="mt-auto">
          {installed ? (
            <InstalledActions template={template} />
          ) : (
            <div className="flex items-end justify-between gap-2 pt-1">
              <PackInstallButton
                packId={template.id}
                packName={meta.name}
                premium={premium}
              />
              {premium && meta.purchaseUrl && (
                <a
                  href={meta.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-foreground underline underline-offset-2 hover:text-primary shrink-0"
                >
                  Get license →
                </a>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InstalledActions({ template }: { template: PackTemplate }) {
  // Server-side: one comparison source (packUpdateAvailability) drives the
  // update affordance here, in `pack list`, and in the update API alike (D7).
  const avail = packUpdateAvailability(template.id);

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Installed
          {avail.installedVersion ? ` v${avail.installedVersion}` : ""}
        </span>
        <Link
          href={`/apps/${template.id}`}
          className="text-xs font-medium text-foreground hover:text-primary"
        >
          Open app →
        </Link>
      </div>
      {avail.updateAvailable && avail.availableVersion && (
        <>
          <PackUpdateButton
            packId={template.id}
            packName={template.meta!.name}
            newVersion={avail.availableVersion}
          />
          {/* Value-recap one-liner: what the pending update contains, from the
              pack's own changelog — same source as license status + the 402. */}
          {changelogWindow(
            template.meta!.changelog,
            avail.installedVersion,
            avail.availableVersion
          ).map((p) => (
            <p key={p.version} className="text-xs text-muted-foreground">
              v{p.version} — {p.note}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function EmptyHero() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Boxes className="h-10 w-10 text-primary mb-4" aria-hidden="true" />
        <h2 className="text-lg font-semibold">No packs bundled in this build.</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Packs ship inside the Relay package. You can still install one from a
          folder or git URL with{" "}
          <code className="font-mono text-xs">relay pack add &lt;path|git-url&gt;</code>.
        </p>
      </CardContent>
    </Card>
  );
}
