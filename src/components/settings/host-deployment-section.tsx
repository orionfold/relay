"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArchiveRestore,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  ExternalLink,
  HardDrive,
  Loader2,
  LockKeyhole,
  MonitorCog,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Square,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import type {
  HostDeploymentDraft,
  HostDeploymentMutation,
  HostDeploymentView,
} from "@/lib/host/deployment/contracts";
import type { CustomerOrientation } from "@/lib/onboarding/orientation";

type DraftInput = Omit<HostDeploymentDraft, "updatedAt">;

const STAGES = ["Placement", "Configure", "Estimate", "Authorize", "Install", "Verify", "Handoff"];

function stageIndex(state: HostDeploymentView | null): number {
  if (!state) return 0;
  if (state.journey.stage === "configure") return 1;
  if (state.journey.stage === "estimated" || state.journey.stage === "preflight_passed") return 2;
  if (state.journey.stage === "authorized") return 3;
  if (state.journey.stage === "installed") return 4;
  if (state.journey.stage === "ready") return 6;
  return 1;
}

function formatBytes(value: number): string {
  return value >= 1024 ** 3 ? `${Math.round(value / 1024 ** 3)} GiB` : `${Math.round(value / 1024 ** 2)} MiB`;
}

function statusVariant(state: string): "success" | "destructive" | "secondary" | "outline" {
  if (["ready", "running", "healthy", "succeeded"].includes(state)) return "success";
  if (["failed", "partial", "error", "degraded", "rollback_partial"].includes(state)) return "destructive";
  if (["stopped", "retained", "installed"].includes(state)) return "secondary";
  return "outline";
}

async function readBody(response: Response): Promise<HostDeploymentView> {
  const body = await response.json().catch(() => null) as (HostDeploymentView & { error?: string; code?: string }) | null;
  if (!response.ok || !body) {
    const message = body?.error ?? `Relay Host request failed (HTTP ${response.status}).`;
    throw new Error(body?.code ? `${body.code}: ${message}` : message);
  }
  return body;
}

export function HostDeploymentSection({
  orientation,
}: {
  orientation?: CustomerOrientation;
}) {
  const [view, setView] = useState<HostDeploymentView | null>(null);
  const [draft, setDraft] = useState<DraftInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [cellId, setCellId] = useState("customer-1");
  const [ownerRef, setOwnerRef] = useState("customer-1");
  const [purgeCell, setPurgeCell] = useState<string | null>(null);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");

  const apply = useCallback((next: HostDeploymentView) => {
    setView(next);
    const { updatedAt: _updatedAt, ...editable } = next.journey.draft;
    setDraft(editable);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      apply(await readBody(await fetch("/api/host-deployment", { cache: "no-store" })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [
    refresh,
    orientation?.license.lifecycle,
    orientation?.entitlements.host,
  ]);

  async function mutate(label: string, mutation: HostDeploymentMutation): Promise<boolean> {
    if (busy) return false;
    setBusy(label);
    setError(null);
    try {
      const next = await readBody(await fetch("/api/host-deployment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
      }));
      apply(next);
      const message = `${label} complete. ${next.journey.lastReasonCode}.`;
      setAnnouncement(message);
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setAnnouncement(`${label} failed. ${message}`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const entitled = view?.license.status === "active";
  const currentStage = stageIndex(view);
  const dirty = useMemo(() => {
    if (!view || !draft) return false;
    const { updatedAt: _updatedAt, ...saved } = view.journey.draft;
    return JSON.stringify(saved) !== JSON.stringify(draft);
  }, [draft, view]);

  if (loading) {
    return (
      <Card className="surface-card">
        <CardHeader><h2 className="text-base font-semibold">Relay Host deployment</h2></CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading Host deployment…
        </CardContent>
      </Card>
    );
  }

  if (!view || !draft) {
    return (
      <Card className="border-status-failed/40">
        <CardHeader><h2 className="text-base font-semibold">Relay Host deployment</h2></CardHeader>
        <CardContent className="space-y-3">
          <p role="alert" className="text-sm text-status-failed">{error ?? "Relay Host deployment did not load."}</p>
          <Button variant="outline" onClick={() => void refresh()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const planDigest = view.journey.planDigest;
  const canPreflight = view.journey.stage === "estimated" && Boolean(planDigest) && !dirty;
  const canAuthorize = view.journey.stage === "preflight_passed" && Boolean(planDigest) && !dirty;
  const canInstall = view.journey.stage === "authorized" && Boolean(planDigest) && !dirty;

  return (
    <Card className="surface-card" id="host-deployment">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Server className="h-5 w-5" aria-hidden="true" /> Relay Host deployment
            </h2>
            <CardDescription>
              {entitled
                ? "Managed Host is unlocked. Run customer-isolated Relay Cells on a device or server you control; your account, bill, data, backups, and keys remain yours."
                : "Optional when you need separate Relay workspaces for customers. Keep using this Relay directly, or preview how a managed Host and Cells would work."}
            </CardDescription>
          </div>
          <Badge variant={view.license.status === "active" ? "success" : view.license.status === "lapsed" ? "destructive" : "outline"}>
            {view.license.status === "active"
              ? "Managed Host unlocked"
              : view.license.status === "lapsed"
                ? "Managed Host term lapsed"
                : view.license.status === "invalid"
                  ? "Host license needs attention"
                  : "Managed Host not included"}
          </Badge>
        </div>
        <div
          aria-label={entitled ? "Deployment progress" : "Optional Host capability preview"}
          className="space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{entitled ? "Your Host setup" : "Optional Host capability preview"}</span>
            {!entitled && (
              <Badge variant="outline">
                Current access: {orientation?.entitlementLabel ?? "Community Edition"}
              </Badge>
            )}
          </div>
          <Progress value={(currentStage / (STAGES.length - 1)) * 100} aria-label={`${entitled ? "Deployment" : "Preview"} step ${currentStage + 1} of ${STAGES.length}`} />
          <ol className="grid grid-cols-4 gap-1 text-[11px] text-muted-foreground sm:grid-cols-7">
            {STAGES.map((stage, index) => (
              <li key={stage} aria-current={index === currentStage ? "step" : undefined} className={index <= currentStage ? "font-medium text-foreground" : ""}>
                {index + 1}. {stage}
              </li>
            ))}
          </ol>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="sr-only" aria-live="polite">{announcement}</p>
        {error && (
          <div role="alert" className="rounded-lg border border-status-failed/40 bg-status-failed/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><TriangleAlert className="h-4 w-4 text-status-failed" aria-hidden="true" />Host action needs attention</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
          </div>
        )}

        <section aria-labelledby="host-placement-heading" className="space-y-3">
          <div>
            <h3 id="host-placement-heading" className="text-base font-semibold">Choose where the Relay Host runs</h3>
            <p className="text-sm text-muted-foreground">A Host is one machine. Each managed Cell is a complete isolated Relay workspace on that Host.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <PlacementCard
              selected={draft.placement === "local"}
              title="Local device"
              icon={<MonitorCog className="h-5 w-5" aria-hidden="true" />}
              description="Use this laptop, workstation or office server. No provider bill; you own availability, networking and recovery."
              facts={["Available in this beta", "One trusted Host administrator", "Direct local or authenticated remote ingress"]}
              disabled={Boolean(view.host)}
              onSelect={() => setDraft({ ...draft, placement: "local", regionRef: "local", exposure: "local", backupProfile: "manual_export" })}
            />
            <PlacementCard
              selected={draft.placement === "cloud_preview"}
              title="Cloud server preview"
              icon={<Cloud className="h-5 w-5" aria-hidden="true" />}
              description="Exercise the cloud plan with a deterministic fake provider. It creates no VM, bill, DNS record or provider credential."
              facts={["Planning simulation only", "No cloud account changes", "Use separate VMs for mutually hostile tenants"]}
              disabled={Boolean(view.host)}
              onSelect={() => setDraft({ ...draft, placement: "cloud_preview", regionRef: "sfo3", exposure: "tailnet", backupProfile: "weekly_provider" })}
            />
          </div>
          <div className="surface-card-muted rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium"><Cloud className="h-4 w-4" aria-hidden="true" />DigitalOcean guided beta</p>
                <p className="mt-1 text-muted-foreground">Run one licensed Relay Host on your own Ubuntu Droplet using the validated manual guide. You own the cloud account, bill, DNS, backups, keys and administration.</p>
              </div>
              <Badge variant="success">Validated topology</Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Proven baseline: 2 vCPU · 4 GiB RAM · 80 GiB disk · authenticated HTTPS. Relay does not request a provider token or create the Droplet.</p>
              <a href="https://github.com/orionfold/relay/blob/main/docs/digitalocean-relay-host.md" target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary underline underline-offset-2">
                Open DigitalOcean guide <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">opens in new tab</span>
              </a>
            </div>
          </div>
          <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Host administrator trust</p>
            <p className="mt-1 text-muted-foreground">The Host administrator can inspect every resident Cell. Put a customer on a separate machine or VM when they do not accept that administrator.</p>
          </div>
        </section>

        {!entitled && (
          <section className="rounded-lg border bg-muted/30 p-4" aria-labelledby="host-license-gate-heading">
            <h3 id="host-license-gate-heading" className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4" aria-hidden="true" />Add managed customer Cells when you need them</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your current access is {orientation?.entitlementLabel ?? "Community Edition"}.
              You can keep running this Relay directly and use free Packs.
              A Host license adds managed customer Cells; comparison, ownership,
              and recovery guidance remain readable before you decide.
            </p>
            {view.license.status === "invalid" || view.license.status === "lapsed" ? (
              <p className="mt-2 text-xs text-status-warning">{view.license.detail}</p>
            ) : null}
            <Button asChild variant="outline" size="sm" className="mt-3"><Link href="#settings-license">Review current access</Link></Button>
          </section>
        )}

        <fieldset disabled={!entitled || busy !== null || Boolean(view.host)} className="space-y-4 disabled:opacity-70">
          <legend className="text-base font-semibold">Configure Host</legend>
          {view.host && <p className="text-sm text-muted-foreground">Installed Host configuration is locked. Placement or capacity changes require a separately confirmed migration or another Host root.</p>}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <Field label="Host ID" htmlFor="host-deployment-host-id">
                <Input id="host-deployment-host-id" value={draft.hostId} onChange={(event) => setDraft({ ...draft, hostId: event.target.value.toLowerCase() })} />
              </Field>
              <Field label="Region" htmlFor="host-deployment-region">
                <select id="host-deployment-region" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.regionRef} onChange={(event) => setDraft({ ...draft, regionRef: event.target.value as DraftInput["regionRef"] })}>
                  {draft.placement === "local" ? <option value="local">This device</option> : <><option value="sfo3">San Francisco</option><option value="nyc3">New York</option><option value="ams3">Amsterdam</option></>}
                </select>
              </Field>
              <Field label="Host size" htmlFor="host-deployment-size">
                <select id="host-deployment-size" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.sizeRef} onChange={(event) => setDraft({ ...draft, sizeRef: event.target.value as DraftInput["sizeRef"] })}>
                  <option value="basic-2gib-1vcpu">2 GiB · 1 vCPU</option>
                  <option value="basic-4gib-2vcpu">4 GiB · 2 vCPU</option>
                  <option value="basic-8gib-4vcpu">8 GiB · 4 vCPU</option>
                  <option value="basic-16gib-8vcpu">16 GiB · 8 vCPU</option>
                </select>
              </Field>
              <Field label="Managed Cells" htmlFor="host-deployment-cells">
                <Input id="host-deployment-cells" type="number" min={1} max={100} value={draft.desiredCells} onChange={(event) => setDraft({ ...draft, desiredCells: Math.max(1, Number(event.target.value) || 1) })} />
              </Field>
              <Field label="Exposure" htmlFor="host-deployment-exposure">
                <select id="host-deployment-exposure" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.exposure} onChange={(event) => setDraft({ ...draft, exposure: event.target.value as DraftInput["exposure"] })}>
                  {draft.placement === "local" && <option value="local">Local only</option>}
                  <option value="tailnet">VPN / tailnet</option>
                  <option value="authenticated_public">Authenticated public ingress</option>
                </select>
              </Field>
              <Field label="Model runtime" htmlFor="host-deployment-runtime">
                <select id="host-deployment-runtime" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.runtimeProfile} onChange={(event) => setDraft({ ...draft, runtimeProfile: event.target.value as DraftInput["runtimeProfile"] })}>
                  <option value="byok_hosted">BYOK hosted API</option>
                  <option value="private_runtime">Private model runtime</option>
                </select>
              </Field>
              <Field label="Recovery" htmlFor="host-deployment-backup">
                <select id="host-deployment-backup" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.backupProfile} onChange={(event) => setDraft({ ...draft, backupProfile: event.target.value as DraftInput["backupProfile"] })}>
                  <option value="manual_export">Encrypted export</option>
                  {draft.placement === "cloud_preview" && <option value="weekly_provider">Weekly provider backup</option>}
                </select>
              </Field>
              <Field label="Expected concurrency" htmlFor="host-deployment-concurrency">
                <select id="host-deployment-concurrency" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.concurrency} onChange={(event) => setDraft({ ...draft, concurrency: event.target.value as DraftInput["concurrency"] })}>
                  <option value="light">Light</option><option value="steady">Steady</option><option value="busy">Busy</option>
                </select>
              </Field>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => void mutate("Save configuration", { action: "save_draft", draft })} disabled={!dirty || busy !== null}>
                  {busy === "Save configuration" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save configuration
                </Button>
                {dirty && <span className="text-xs text-status-warning">Unsaved edits invalidate the prior estimate and authorization.</span>}
              </div>
            </div>

            <EstimatePanel view={view} dirty={dirty} busy={busy} onEstimate={() => void mutate("Estimate", { action: "estimate" })} />
          </div>
        </fieldset>

        {entitled && (
          <section aria-labelledby="host-deploy-actions-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="host-deploy-actions-heading" className="text-base font-semibold">Preflight, authorize and install</h3>
                <p className="text-sm text-muted-foreground">These actions configure this Relay installation or its planning simulation. They never create a cloud VM or request a provider token.</p>
              </div>
              <Badge variant={view.runtimeMode === "preview" ? "outline" : "secondary"}>{view.runtimeMode === "preview" ? "Preview runtime" : "Signed Docker runtime"}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ActionStep icon={<ShieldCheck className="h-4 w-4" />} title="Preflight" detail="License, one-Host admission, placement, estimate and recovery choices." complete={["preflight_passed", "authorized", "installed", "ready"].includes(view.journey.stage)}>
                <Button size="sm" variant="outline" disabled={!canPreflight || busy !== null} onClick={() => void mutate("Preflight", { action: "preflight", planDigest: planDigest! })}>Run preflight</Button>
              </ActionStep>
              <ActionStep icon={<LockKeyhole className="h-4 w-4" />} title="Authorize" detail={draft.placement === "local" ? "Confirm the exact Host changes on this device." : "Confirm a fake provider plan; no credential or VM is created."} complete={["authorized", "installed", "ready"].includes(view.journey.stage)}>
                <Button size="sm" variant="outline" disabled={!canAuthorize || busy !== null} onClick={() => void mutate("Authorize", { action: "authorize", planDigest: planDigest!, confirmed: true })}>Confirm plan</Button>
              </ActionStep>
              <ActionStep icon={<HardDrive className="h-4 w-4" />} title="Install Host" detail="Initialize or reuse the content-free Host registry, then create Cells separately." complete={["installed", "ready"].includes(view.journey.stage)}>
                <Button size="sm" disabled={!canInstall || busy !== null} onClick={() => void mutate("Install Host", { action: "install", planDigest: planDigest! })}>{busy === "Install Host" && <Loader2 className="h-4 w-4 animate-spin" />}Install Host</Button>
              </ActionStep>
            </div>
          </section>
        )}

        {view.host && (
          <HostInventory
            view={view}
            busy={busy}
            cellId={cellId}
            ownerRef={ownerRef}
            onCellId={setCellId}
            onOwnerRef={setOwnerRef}
            onCreate={() => void mutate("Create Cell", { action: "create_cell", operationId: crypto.randomUUID(), cellId, ownerRef })}
            onLifecycle={(id, lifecycle) => void mutate(`${lifecycle} ${id}`, { action: "cell_action", operationId: crypto.randomUUID(), cellId: id, lifecycle })}
            purgeCell={purgeCell}
            purgeConfirmation={purgeConfirmation}
            onPurgeCell={setPurgeCell}
            onPurgeConfirmation={setPurgeConfirmation}
            onPurge={(id) => void mutate(`purge ${id}`, { action: "cell_action", operationId: crypto.randomUUID(), cellId: id, lifecycle: "purge", confirmation: purgeConfirmation }).then((succeeded) => {
              if (succeeded) {
                setPurgeCell(null);
                setPurgeConfirmation("");
              }
            })}
          />
        )}

        <section aria-labelledby="host-capabilities-heading" className="space-y-3">
          <div>
            <h3 id="host-capabilities-heading" className="text-base font-semibold">Lifecycle and recovery capability</h3>
            <p className="text-sm text-muted-foreground">Relay only enables operations whose domain contracts are implemented and verified.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Capability icon={<ArchiveRestore className="h-4 w-4" />} title="Backup, restore and export" status="Available separately" description="Create and verify encrypted, customer-owned recovery before export-and-release." action={<Button asChild variant="outline" size="sm"><Link href="#settings-recovery">Open Encrypted Recovery</Link></Button>} />
            <Capability icon={<RotateCcw className="h-4 w-4" />} title="Upgrade and rollback" status="Not yet enabled" description="A managed Cell-image upgrade contract is required; this UI does not claim a no-op succeeded." />
            <Capability icon={<Network className="h-4 w-4" />} title="Transfer and Fleet control" status="Not yet enabled" description="This Host controls only resident Cells. Cross-Host authority remains a separate future controller." />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function PlacementCard({ selected, title, icon, description, facts, disabled, onSelect }: { selected: boolean; title: string; icon: React.ReactNode; description: string; facts: string[]; disabled: boolean; onSelect: () => void }) {
  return (
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect} data-interactive-surface data-interactive-outline="preserve" className={`rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70 ${selected ? "border-primary bg-primary/8" : "bg-card"}`}>
      <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</span>{selected && <CheckCircle2 className="h-4 w-4 text-status-completed" aria-hidden="true" />}</span>
      <span className="mt-2 block text-sm text-muted-foreground">{description}</span>
      <span className="mt-3 block space-y-1 text-xs text-muted-foreground">{facts.map((fact) => <span key={fact} className="block">• {fact}</span>)}</span>
    </button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

function EstimatePanel({ view, dirty, busy, onEstimate }: { view: HostDeploymentView; dirty: boolean; busy: string | null; onEstimate: () => void }) {
  const estimate = view.journey.estimate;
  return (
    <aside className="surface-card-muted rounded-lg border p-4" aria-labelledby="host-estimate-heading">
      <div className="flex items-center justify-between gap-2"><h3 id="host-estimate-heading" className="flex items-center gap-2 text-sm font-semibold"><CircleDollarSign className="h-4 w-4" aria-hidden="true" />Live estimate</h3>{estimate && <Badge variant="outline">Provisional</Badge>}</div>
      {estimate ? (
        <div className="mt-4 space-y-3">
          <div><p className="text-xs text-muted-foreground">Expected infrastructure monthly</p><p className="text-2xl font-bold">{estimate.monthlyLow === 0 ? "$0 provider bill" : `$${estimate.monthlyLow.toFixed(2)}–$${estimate.monthlyHigh.toFixed(2)}`}</p></div>
          <dl className="grid grid-cols-2 gap-2 text-xs"><dt className="text-muted-foreground">Host count</dt><dd className="text-right font-medium">{estimate.hostCount}</dd><dt className="text-muted-foreground">Requested Cells</dt><dd className="text-right font-medium">{estimate.requestedCells}</dd><dt className="text-muted-foreground">Admitted / Host</dt><dd className="text-right font-medium">{estimate.admittedCellsPerHost}*</dd><dt className="text-muted-foreground">Safety reserve</dt><dd className="text-right font-medium">{estimate.reservePercent}%</dd></dl>
          <p className="text-xs text-muted-foreground">*Provisional until measured. BYOK model/API charges are separate. The provider bill is authoritative.</p>
          <a href={estimate.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">Source snapshot · {estimate.sourceDate}<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">opens in new tab</span></a>
          {view.journey.invalidatedReason && <p className="rounded-md border border-status-warning/40 bg-status-warning/10 p-2 text-xs">{view.journey.invalidatedReason}</p>}
        </div>
      ) : <p className="mt-3 text-sm text-muted-foreground">Save configuration, then calculate the dated Host range and provisional admission.</p>}
      <Button type="button" className="mt-4 w-full" variant="outline" onClick={onEstimate} disabled={dirty || busy !== null}>{busy === "Estimate" && <Loader2 className="h-4 w-4 animate-spin" />}Calculate estimate</Button>
    </aside>
  );
}

function ActionStep({ icon, title, detail, complete, children }: { icon: React.ReactNode; title: string; detail: string; complete: boolean; children: React.ReactNode }) {
  return <div className="surface-card-muted rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-medium">{icon}{title}</p>{complete && <CheckCircle2 className="h-4 w-4 text-status-completed" aria-label="Complete" />}</div><p className="my-2 text-xs text-muted-foreground">{detail}</p>{children}</div>;
}

function HostInventory(props: {
  view: HostDeploymentView; busy: string | null; cellId: string; ownerRef: string;
  onCellId: (value: string) => void; onOwnerRef: (value: string) => void; onCreate: () => void;
  onLifecycle: (id: string, action: "start" | "stop" | "restart" | "retain") => void;
  purgeCell: string | null; purgeConfirmation: string; onPurgeCell: (value: string | null) => void;
  onPurgeConfirmation: (value: string) => void; onPurge: (id: string) => void;
}) {
  const { view } = props;
  return (
    <section aria-labelledby="host-inventory-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="host-inventory-heading" className="text-base font-semibold">Host and Cell inventory</h3><p className="text-sm text-muted-foreground">Host {view.host!.hostId} · Relay {view.host!.supervisorVersion} · {view.runtimeMode === "preview" ? "simulation, no external VM" : "signed Docker runtime"}</p></div>
        <Badge variant={statusVariant(view.host!.actualState)}>{view.host!.actualState}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="CPU" value={`${view.host!.capacity.cpuMillis / 1000} vCPU`} />
        <Metric label="Memory" value={formatBytes(view.host!.capacity.memoryBytes)} />
        <Metric label="Storage ceiling" value={formatBytes(view.host!.capacity.storageBytes)} />
        <Metric label="Safety reserve" value={`${view.host!.capacity.reservePercent}%`} />
      </div>
      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-semibold">Create an isolated Cell</h4>
        <p className="mt-1 text-xs text-muted-foreground">IDs are opaque references, not customer names or email addresses. The artifact is pinned to the accepted public Relay Cell digest.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Cell ID" htmlFor="host-new-cell-id"><Input id="host-new-cell-id" value={props.cellId} onChange={(event) => props.onCellId(event.target.value.toLowerCase())} /></Field>
          <Field label="Owner reference" htmlFor="host-new-owner-ref"><Input id="host-new-owner-ref" value={props.ownerRef} onChange={(event) => props.onOwnerRef(event.target.value.toLowerCase())} /></Field>
          <Button disabled={props.busy !== null || view.license.status !== "active"} onClick={props.onCreate}>{props.busy === "Create Cell" && <Loader2 className="h-4 w-4 animate-spin" />}Create Cell</Button>
        </div>
      </div>
      {view.cells.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No managed Cells yet.</p> : (
        <ul className="space-y-3">
          {view.cells.map((cell) => {
            const canStart = ["stopped", "retained"].includes(cell.state);
            const canStop = cell.state === "running";
            const canRetain = ["running", "stopped"].includes(cell.state);
            return (
              <li key={cell.cellId} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{cell.cellId}</p><p className="text-xs text-muted-foreground">Owner {cell.ownerRef} · port {cell.loopbackPort} · {formatBytes(cell.memoryBytes)} memory · Relay {cell.version}</p></div><div className="flex gap-2"><Badge variant={statusVariant(cell.state)}>{cell.state}</Badge><Badge variant={statusVariant(cell.health)}>{cell.health}</Badge></div></div>
                <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground" title={cell.imageDigest}>{cell.imageDigest}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!canStart || props.busy !== null} onClick={() => props.onLifecycle(cell.cellId, "start")}><Play className="h-3.5 w-3.5" aria-hidden="true" />Start</Button>
                  <Button size="sm" variant="outline" disabled={!canStop || props.busy !== null} onClick={() => props.onLifecycle(cell.cellId, "stop")}><Square className="h-3.5 w-3.5" aria-hidden="true" />Stop</Button>
                  <Button size="sm" variant="outline" disabled={!canStop || props.busy !== null} onClick={() => props.onLifecycle(cell.cellId, "restart")}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Restart</Button>
                  <Button size="sm" variant="outline" disabled={!canRetain || props.busy !== null} onClick={() => props.onLifecycle(cell.cellId, "retain")}><HardDrive className="h-3.5 w-3.5" aria-hidden="true" />Remove, retain data</Button>
                  <Button size="sm" variant="destructive" disabled={props.busy !== null || cell.state === "purged"} onClick={() => { props.onPurgeCell(cell.cellId); props.onPurgeConfirmation(""); }}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Purge</Button>
                </div>
                {props.purgeCell === cell.cellId && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3"><p className="text-sm font-medium">Permanently purge {cell.cellId}?</p><p className="mt-1 text-xs text-muted-foreground">This deletes the derived Cell root. Create and verify recovery first. Existing siblings are not touched.</p><Label className="mt-3 block" htmlFor={`purge-${cell.cellId}`}>Type {cell.cellId} to confirm</Label><div className="mt-1 flex flex-wrap gap-2"><Input id={`purge-${cell.cellId}`} className="max-w-xs" value={props.purgeConfirmation} onChange={(event) => props.onPurgeConfirmation(event.target.value)} /><Button variant="destructive" disabled={props.purgeConfirmation !== cell.cellId || props.busy !== null} onClick={() => props.onPurge(cell.cellId)}>Permanently purge</Button><Button variant="outline" onClick={() => props.onPurgeCell(null)}>Cancel</Button></div></div>}
              </li>
            );
          })}
        </ul>
      )}
      {view.receipts.length > 0 && <details className="rounded-lg border p-3"><summary className="text-sm font-medium">Recent content-free receipts ({view.receipts.length})</summary><ul className="mt-3 space-y-2">{view.receipts.map((receipt) => <li key={receipt.receiptId} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{receipt.cellId ?? "Host"} · {receipt.action} · <span className="font-mono">{receipt.reasonCode}</span></span><Badge variant={statusVariant(receipt.outcome)}>{receipt.outcome}</Badge></li>)}</ul></details>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="surface-card-muted rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>; }

function Capability({ icon, title, status, description, action }: { icon: React.ReactNode; title: string; status: string; description: string; action?: React.ReactNode }) {
  return <div className="surface-card-muted rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-medium">{icon}{title}</p><Badge variant="outline">{status}</Badge></div><p className="my-2 text-xs text-muted-foreground">{description}</p>{action}</div>;
}
