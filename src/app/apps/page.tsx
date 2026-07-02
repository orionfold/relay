import Link from "next/link";
import { PageShell } from "@/components/shared/page-shell";
import { StatusChip } from "@/components/shared/status-chip";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Package } from "lucide-react";
import { listApps } from "@/lib/apps/registry";
import { listStarters } from "@/lib/apps/starters";
import { StarterTemplateCard } from "@/components/apps/starter-template-card";
import { AppCardDeleteButton } from "@/components/apps/app-card-delete-button";

export const dynamic = "force-dynamic";

export default function AppsPage() {
  const apps = listApps();
  const starters = listStarters();
  const isEmpty = apps.length === 0;

  return (
    <PageShell
      title="Apps"
      description="Composed instances built by describing what you want Orionfold Relay to do."
    >
      {isEmpty ? (
        <EmptyHero starters={starters} />
      ) : (
        <div className="space-y-8">
          <section>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {apps.map((app) => (
                <Card
                  key={app.id}
                  className="relative hover:border-primary/50 transition-colors h-full"
                >
                  <Link
                    href={`/apps/${app.id}`}
                    aria-label={`Open ${app.name}`}
                    className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                  <CardContent className="pointer-events-none relative p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                        <span className="text-sm font-medium truncate">{app.name}</span>
                      </div>
                      <div className="pointer-events-auto -my-1 -mr-1">
                        <AppCardDeleteButton
                          appId={app.id}
                          appName={app.name}
                          tableCount={app.tableCount}
                          scheduleCount={app.scheduleCount}
                          fileCount={app.files.length}
                        />
                      </div>
                    </div>
                    {app.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {app.description}
                      </p>
                    )}
                    {app.primitivesSummary && (
                      <p className="text-[11px] text-muted-foreground/70">
                        {app.primitivesSummary}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <StatusChip status="running" size="sm" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {starters.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-medium">Start from a template</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Each template seeds the chat with a prompt. Edit, confirm, and Orionfold Relay composes the app for you.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {starters.map((s) => (
                  <StarterTemplateCard key={s.id} starter={s} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}

function EmptyHero({ starters }: { starters: ReturnType<typeof listStarters> }) {
  return (
    <div className="space-y-8">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="h-10 w-10 text-primary mb-4" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Teach this instance a new job.</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Describe the thing you do every week. Orionfold Relay composes a profile, blueprint, schedule, and tables into a running app — no code, no deploys.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start in chat →
            </Link>
            {starters.length > 0 && (
              <a
                href="#starters"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Browse starters
              </a>
            )}
            <Link
              href="/packs"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Install a pack
            </Link>
          </div>
        </CardContent>
      </Card>

      {starters.length > 0 && (
        <section id="starters" className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Starters</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Three worked examples Orionfold Relay can compose for you. Click to seed the chat with a prompt.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {starters.map((s) => (
              <StarterTemplateCard key={s.id} starter={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
