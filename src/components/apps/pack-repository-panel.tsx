"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  Globe2,
  LockKeyhole,
  Loader2,
  Package,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GitHubRepositoryTargetForm } from "@/components/publishers/github-repository-target-form";

type PublishTarget = {
  id: string;
  appId: string;
  targetType: "github-pages" | "github-repo";
  config: string;
  createdAt: string;
};

type Deployment = {
  id: string;
  targetId: string;
  status: "pending" | "publishing" | "success" | "failed";
  url: string | null;
  commit: string | null;
  artifactHash: string | null;
  error: string | null;
};

type PackPreview = {
  packId: string;
  version: string;
  hash: string;
  sampleRowsIncluded: number;
  files: Array<{ path: string; bytes: number }>;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Request failed: ${response.status}`
    );
  }
  return body;
}

function targetLabel(target: PublishTarget): string {
  try {
    const config = JSON.parse(target.config) as Record<string, unknown>;
    const owner = typeof config.owner === "string" ? config.owner : "owner";
    const repo = typeof config.repo === "string" ? config.repo : "repo";
    const branch = typeof config.branch === "string" ? config.branch : "main";
    const directory = typeof config.directory === "string" && config.directory
      ? `/${config.directory}`
      : "";
    return `${owner}/${repo}:${branch}${directory}`;
  } catch {
    return target.id;
  }
}

export function PackRepositoryPanel({
  appId,
}: {
  appId: string;
}) {
  const [targets, setTargets] = useState<PublishTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [includeSampleData, setIncludeSampleData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PackPreview | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repositoryVisibility, setRepositoryVisibility] = useState<"public" | "private" | null>(null);
  const [preparingCommunity, setPreparingCommunity] = useState(false);
  const [communitySubmissionUrl, setCommunitySubmissionUrl] = useState<string | null>(null);

  async function loadTargets() {
    const rows = await fetch(`/api/apps/${encodeURIComponent(appId)}/publish-targets`, {
      cache: "no-store",
    }).then((response) => readJson<PublishTarget[]>(response));
    const repoTargets = rows.filter((target) => target.targetType === "github-repo");
    setTargets(repoTargets);
    setSelectedTargetId((current) =>
      current && repoTargets.some((target) => target.id === current)
        ? current
        : repoTargets[0]?.id ?? null
    );
  }

  useEffect(() => {
    let cancelled = false;
    loadTargets()
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Targets failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  useEffect(() => {
    if (!deployment || !["pending", "publishing"].includes(deployment.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await fetch(
          `/api/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deployment.id)}`,
          { cache: "no-store" }
        ).then((response) => readJson<Deployment>(response));
        setDeployment(current);
        if (current.status === "success") toast.success("Pack published to GitHub");
        if (current.status === "failed") toast.error(current.error ?? "Pack publish failed");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Deployment refresh failed");
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [appId, deployment?.id, deployment?.status]);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? null,
    [selectedTargetId, targets]
  );

  useEffect(() => {
    setRepositoryVisibility(null);
    setCommunitySubmissionUrl(null);
  }, [selectedTargetId]);

  async function testTarget() {
    if (!selectedTargetId) return;
    setTesting(true);
    setError(null);
    try {
      const result = await fetch(
        `/api/apps/${encodeURIComponent(appId)}/publish-targets/${encodeURIComponent(selectedTargetId)}/test`,
        { method: "POST" }
      ).then((response) =>
        readJson<{ testStatus: "ok" | "failed"; error?: string; details?: { visibility?: "public" | "private" } }>(response)
      );
      if (result.testStatus !== "ok") throw new Error(result.error ?? "Repository test failed");
      setRepositoryVisibility(result.details?.visibility ?? null);
      toast.success(`${result.details?.visibility === "public" ? "Public" : result.details?.visibility === "private" ? "Private" : "GitHub"} repository is reachable and writable`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Repository test failed";
      setError(message);
      toast.error(message);
    } finally {
      setTesting(false);
    }
  }

  async function downloadPack() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(appId)}/pack/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeSampleData }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Export failed: ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${appId}.tgz`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Portable pack downloaded");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Pack export failed";
      setError(message);
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }

  async function inspectPack() {
    setPreviewing(true);
    setError(null);
    try {
      const result = await fetch(`/api/apps/${encodeURIComponent(appId)}/pack/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeSampleData }),
      }).then((response) => readJson<PackPreview>(response));
      setPreview(result);
      toast.success("Pack file preview is ready");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Pack inspection failed";
      setError(message);
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  }

  async function prepareCommunitySubmission() {
    if (!selectedTargetId || !preview) return;
    setPreparingCommunity(true);
    setError(null);
    try {
      const result = await fetch(
        `/api/apps/${encodeURIComponent(appId)}/pack/community-submission`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetId: selectedTargetId, expectedHash: preview.hash }),
        }
      ).then((response) => readJson<{ url: string }>(response));
      setCommunitySubmissionUrl(result.url);
      toast.success("Community review request is ready");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Community submission failed";
      setError(message);
      toast.error(message);
    } finally {
      setPreparingCommunity(false);
    }
  }

  async function publishPack() {
    if (!selectedTargetId) return;
    setConfirmOpen(false);
    setPublishing(true);
    setError(null);
    try {
      const result = await fetch(`/api/apps/${encodeURIComponent(appId)}/pack/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: selectedTargetId,
          confirm: true,
          includeSampleData,
          expectedHash: preview?.hash,
        }),
      }).then((response) => readJson<{ deployment: Deployment }>(response));
      setDeployment(result.deployment);
      toast.success("Pack publish started");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Pack publish failed";
      setError(message);
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Card className="surface-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" aria-hidden="true" />
              Pack repository
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Export this app as a portable Relay Pack, publish it to your own public or private GitHub repository, or submit a public release for Relay Community review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={inspectPack}
              disabled={previewing}
              className="gap-1.5"
            >
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
              Preview files
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadPack}
              disabled={exporting}
              className="gap-1.5"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download .tgz
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!selectedTargetId || !preview || publishing}
              className="gap-1.5"
            >
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
              Publish pack
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="surface-card-muted rounded-lg border p-3">
            <LockKeyhole className="h-4 w-4 text-primary" />
            <h3 className="mt-2 text-sm font-medium">Private repository</h3>
            <p className="mt-1 text-xs text-muted-foreground">Share the Pack only with collaborators you authorize in GitHub.</p>
          </div>
          <div className="surface-card-muted rounded-lg border p-3">
            <Globe2 className="h-4 w-4 text-primary" />
            <h3 className="mt-2 text-sm font-medium">Public repository</h3>
            <p className="mt-1 text-xs text-muted-foreground">Anyone can inspect and install it by URL as community-unverified.</p>
          </div>
          <div className="surface-card-muted rounded-lg border p-3">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="mt-2 text-sm font-medium">Relay Community</h3>
            <p className="mt-1 text-xs text-muted-foreground">Publish publicly first, then submit the creator-owned repository for review and indexing.</p>
          </div>
        </section>

        <section className="surface-card-muted rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Data boundary</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Structure is included. Live rows stay local unless you explicitly include a small sample.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`pack-sample-data-${appId}`} className="text-xs">Include up to 25 rows/table</Label>
              <Switch
                id={`pack-sample-data-${appId}`}
                checked={includeSampleData}
                onCheckedChange={(checked) => {
                  setIncludeSampleData(checked);
                  setPreview(null);
                }}
              />
            </div>
          </div>
        </section>

        {preview && (
          <section className="surface-card-muted rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Files that will leave this machine</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {preview.files.length} files · hash <span className="font-mono">{preview.hash.slice(0, 12)}</span> · {preview.sampleRowsIncluded} sample rows
                </p>
              </div>
              <Badge variant="outline">Previewed</Badge>
            </div>
            <ul className="mt-3 max-h-48 space-y-1 overflow-auto rounded-md border bg-[var(--surface-1)] p-2 font-mono text-xs">
              {preview.files.map((file) => (
                <li key={file.path} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{file.path}</span>
                  <span className="shrink-0 text-muted-foreground">{file.bytes} B</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="surface-card-muted rounded-lg border p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                Saved repository
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                The repository uses your shared GitHub connection from Settings; credentials never enter chat.
              </p>
            </div>
            {selectedTarget && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">{targetLabel(selectedTarget)}</Badge>
                {repositoryVisibility && <Badge variant={repositoryVisibility === "public" ? "success" : "secondary"} className="capitalize">{repositoryVisibility}</Badge>}
                <Button size="sm" variant="outline" onClick={testTarget} disabled={testing}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test"}
                </Button>
              </div>
            )}
          </div>
          {!loading && targets.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {targets.map((target) => (
                <Button
                  key={target.id}
                  size="sm"
                  variant={target.id === selectedTargetId ? "default" : "outline"}
                  onClick={() => setSelectedTargetId(target.id)}
                >
                  {targetLabel(target)}
                </Button>
              ))}
            </div>
          )}
        </section>

        <GitHubRepositoryTargetForm
          appId={appId}
          targetType="github-repo"
          defaultBranch="main"
          allowDirectory
          title="Add your GitHub repository"
          onCreated={(created) => {
            setTargets((current) => [created, ...current]);
            setSelectedTargetId(created.id);
            setRepositoryVisibility(null);
          }}
        />

        {deployment && (
          <section className="surface-card-muted rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              {deployment.status === "success" ? (
                <Badge variant="success"><CheckCircle2 />Published</Badge>
              ) : deployment.status === "failed" ? (
                <Badge variant="destructive"><XCircle />Failed</Badge>
              ) : (
                <Badge><Loader2 className="animate-spin" />Publishing</Badge>
              )}
              {deployment.commit && <span className="font-mono text-xs">{deployment.commit.slice(0, 12)}</span>}
              {deployment.url && (
                <a href={deployment.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Open repository <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {deployment.error && <p className="mt-2 text-xs text-destructive">{deployment.error}</p>}
          </section>
        )}

        <section className="surface-card-muted rounded-lg border p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4 text-primary" />Submit to Relay Community</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Community review requires this exact Pack in a public repository at pack.yaml on its default branch. Relay submits a link; ownership and hosting stay with you.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={prepareCommunitySubmission}
                disabled={
                  preparingCommunity ||
                  repositoryVisibility !== "public" ||
                  !preview ||
                  deployment?.status !== "success" ||
                  deployment.targetId !== selectedTargetId ||
                  deployment.artifactHash !== preview.hash
                }
              >
                {preparingCommunity ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                Prepare submission
              </Button>
              {communitySubmissionUrl && (
                <Button asChild size="sm">
                  <a href={communitySubmissionUrl} target="_blank" rel="noreferrer">Open review request <ExternalLink className="h-3.5 w-3.5" /></a>
                </Button>
              )}
            </div>
          </div>
          {repositoryVisibility === "private" && <p className="mt-2 text-xs text-status-warning">This repository remains private. Choose or create a public repository to submit the Pack to Relay Community.</p>}
          {!repositoryVisibility && selectedTarget && <p className="mt-2 text-xs text-muted-foreground">Test the selected repository to confirm whether it is public or private.</p>}
        </section>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Publish this Relay Pack?"
        description={`Relay will write the ${preview?.files.length ?? 0} previewed pack files (hash ${preview?.hash.slice(0, 12) ?? "unknown"}) to ${selectedTarget ? targetLabel(selectedTarget) : "the selected repository"}. ${includeSampleData ? `The preview includes ${preview?.sampleRowsIncluded ?? 0} sample rows.` : "Live table rows will remain local."}`}
        confirmLabel="Publish pack"
        onConfirm={publishPack}
      />
    </Card>
  );
}
