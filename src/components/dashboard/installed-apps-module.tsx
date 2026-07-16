import Link from "next/link";
import { Boxes } from "lucide-react";
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
    <div className="grid gap-2 sm:grid-cols-2">
      {apps.slice(0, 6).map((app) => (
        <Link
          key={app.id}
          href={`/apps/${app.id}`}
          data-interactive-surface=""
          data-interactive-outline="preserve"
          className="interactive-list-item surface-card-muted rounded-md border p-3"
        >
          <p className="truncate text-sm font-medium">{app.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {app.primitivesSummary}
          </p>
        </Link>
      ))}
    </div>
  );
}
