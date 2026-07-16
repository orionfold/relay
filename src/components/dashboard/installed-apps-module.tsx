import Link from "next/link";
import { Boxes, PackageCheck } from "lucide-react";
import type { AppSummary } from "@/lib/apps/registry";

export function InstalledAppsModule({ apps }: { apps: AppSummary[] }) {
  if (apps.length === 0) {
    return (
      <div className="py-4 text-center">
        <Boxes className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No Packs or apps installed.</p>
        <Link href="/packs" className="mt-2 inline-block text-xs text-primary underline">
          Browse Packs
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {apps.slice(0, 5).map((app) => (
        <Link
          key={app.id}
          href={`/apps/${app.id}`}
          data-interactive-surface=""
          data-interactive-outline="preserve"
          className="interactive-list-item -mx-1 flex min-w-0 items-center gap-3 rounded-md px-1 py-2"
        >
          <span className="surface-card-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md border">
            <PackageCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{app.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {app.primitivesSummary}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
