import Link from "next/link";
import { PageShell } from "@/components/shared/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Boxes, Check, Lock, Package, TriangleAlert } from "lucide-react";
import { listApps } from "@/lib/apps/registry";
import { listPackTemplates, type PackTemplate } from "@/lib/packs/catalog";
import { packUpdateAvailability } from "@/lib/packs/update";
import { changelogWindow } from "@/lib/licensing/recap";
import { PackInstallButton } from "@/components/packs/pack-install-button";
import { PackUpdateButton } from "@/components/packs/pack-update-button";

export const dynamic = "force-dynamic";

/**
 * Local-first bundled-pack browser (NOT a marketplace — feature-cut fence).
 * Premium packs are visible-but-locked (D6): every user sees what exists,
 * what it materializes, and what it costs; only the content install is gated.
 */
export default function PacksPage() {
  const templates = listPackTemplates();
  const installedIds = new Set(listApps().map((a) => a.id));

  return (
    <PageShell
      title="Packs"
      description="Vertical content bundles — an app, profiles, blueprints, tables, and seed data installed in one step."
    >
      {templates.length === 0 ? (
        <EmptyHero />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <PackCard key={t.id} template={t} installed={installedIds.has(t.id)} />
          ))}
        </div>
      )}
    </PageShell>
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

  return (
    <Card className="relative h-full hover:border-primary/50 transition-colors">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {premium ? (
              <Lock
                className="h-4 w-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Package
                className="h-4 w-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="text-sm font-medium truncate">{meta.name}</span>
          </div>
          {premium && !installed && (
            <Badge variant="outline" className="shrink-0">
              {meta.price ?? "Premium"}
            </Badge>
          )}
        </div>

        {meta.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {meta.description}
          </p>
        )}
        {template.primitivesSummary && (
          <p className="text-[11px] text-muted-foreground/70">
            {template.primitivesSummary}
          </p>
        )}

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
