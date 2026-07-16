import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RecentFeature } from "@/lib/dashboard/recent-features";

export function RecentFeaturesModule({
  features,
}: {
  features: readonly RecentFeature[];
}) {
  if (features.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No recent feature launches.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {features.map((feature, index) => (
        <div
          key={feature.id}
          className="border-b border-border/50 py-2.5 last:border-b-0"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="surface-card-muted mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium">{feature.title}</p>
                {index === 0 && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    New
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {feature.summary}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <time
                  dateTime={feature.launchedAt}
                  className="text-[10px] text-muted-foreground"
                >
                  {new Date(`${feature.launchedAt}T00:00:00`).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric" }
                  )}
                </time>
                <Link
                  href={feature.href}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  {feature.actionLabel}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
