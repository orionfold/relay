import { CheckCircle2, CircleX, GitBranch, Info } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyViewDeclarationButton } from "@/components/apps/copy-view-declaration-button";
import { PageShell } from "@/components/shared/page-shell";
import { getApp } from "@/lib/apps/registry";
import { explicitViewYaml, resolveKitSelection } from "@/lib/apps/view-kits/inference";
import { loadColumnSchemas } from "@/lib/apps/view-kits";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { getSetting } from "@/lib/settings/helpers";

export const dynamic = "force-dynamic";

export default async function AppInferencePage({ params }: { params: Promise<{ id: string }> }) {
  const enabled = (await getSetting(SETTINGS_KEYS.APPS_SHOW_INFERENCE_DIAGNOSTICS)) === "true";
  if (!enabled) notFound();

  const { id } = await params;
  const app = getApp(id);
  if (!app) notFound();

  const columns = await loadColumnSchemas(app.manifest);
  const trace = resolveKitSelection(app.manifest, columns);
  const snippet = explicitViewYaml(trace.kit);

  return (
    <PageShell
      title="View-kit diagnostics"
      description={`Why ${app.name} uses the ${trace.kit} view`}
      backHref={`/apps/${app.id}`}
      backLabel={app.name}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{trace.kit} view</Badge>
                <Badge variant={trace.source === "explicit" ? "secondary" : "outline"}>
                  {trace.source === "explicit" ? "Explicit selection" : "Inferred selection"}
                </Badge>
              </div>
              <CardTitle className="pt-2">{trace.selectedRule}</CardTitle>
              <CardDescription>{trace.explanation}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Rules are evaluated top-to-bottom. The first match wins; there is no scoring, telemetry learning, or fuzzy ranking.
              </p>
              <div className="space-y-2" aria-label="View-kit rule trace">
                {trace.candidates.map((candidate) => (
                  <div
                    key={candidate.ruleId}
                    className={`rounded-lg border p-3 ${candidate.selected ? "border-primary bg-[var(--wash-1)]" : "border-[var(--border-subtle)] bg-[var(--surface-2)]"}`}
                  >
                    <div className="flex items-start gap-2">
                      {candidate.selected ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : (
                        <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {candidate.kit} · {candidate.selected ? "selected" : candidate.matched ? "matched after winner" : "not matched"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{candidate.condition}</p>
                        <p className="mt-1 text-xs">{candidate.explanation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {trace.probes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitBranch className="h-4 w-4" aria-hidden="true" />
                  Probe evidence
                </CardTitle>
                <CardDescription>Inputs read from this app&apos;s manifest and hero-table schema.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {trace.probes.map((probe) => (
                    <div key={probe.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-sm font-medium">{probe.label}</dt>
                        <dd className="text-xs font-medium text-muted-foreground">{probe.value ? "Yes" : "No"}</dd>
                      </div>
                      <dd className="mt-1 text-xs text-muted-foreground">
                        {probe.evidence.length > 0 ? probe.evidence.join(", ") : "No matching evidence"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Make this selection explicit</CardTitle>
              <CardDescription>
                Add this declaration to the app manifest when the resolved kit is the intended permanent choice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] p-3 text-xs"><code>{snippet}</code></pre>
              <CopyViewDeclarationButton value={snippet} />
              <div className="flex gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                <p>This copies text only. Relay does not change the manifest or make the kit user-switchable.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
