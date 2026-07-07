"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Globe2,
  Loader2,
  Rocket,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PublishTarget = {
  id: string;
  appId: string;
  targetType: "github-pages";
  config: string;
  createdAt: string;
};

type Deployment = {
  id: string;
  appId: string;
  targetId: string;
  status: "pending" | "publishing" | "success" | "failed";
  url: string | null;
  commit: string | null;
  artifactHash: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

type TestResult = { status: "ok" | "failed"; error?: string };

interface AppPublishPanelProps {
  appId: string;
  targetType: "github-pages";
  generatorType: string;
  sourceTable: string;
}

const EMPTY_FORM = {
  owner: "",
  repo: "",
  branch: "gh-pages",
  githubToken: "",
};

function readTargetConfig(target: PublishTarget) {
  try {
    const parsed = JSON.parse(target.config) as Record<string, unknown>;
    return {
      owner: typeof parsed.owner === "string" ? parsed.owner : "",
      repo: typeof parsed.repo === "string" ? parsed.repo : "",
      branch: typeof parsed.branch === "string" ? parsed.branch : "gh-pages",
      githubToken: typeof parsed.githubToken === "string" ? parsed.githubToken : "",
    };
  } catch {
    return { owner: "", repo: "", branch: "gh-pages", githubToken: "" };
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

function DeploymentBadge({ status }: { status: Deployment["status"] }) {
  if (status === "success") {
    return (
      <Badge variant="success">
        <CheckCircle2 aria-hidden="true" />
        Success
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive">
        <XCircle aria-hidden="true" />
        Failed
      </Badge>
    );
  }
  if (status === "publishing") {
    return (
      <Badge>
        <Loader2 className="animate-spin" aria-hidden="true" />
        Publishing
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-status-warning/25 bg-status-warning/10 text-status-warning"
    >
      Pending
    </Badge>
  );
}

export function AppPublishPanel({
  appId,
  targetType,
  generatorType,
  sourceTable,
}: AppPublishPanelProps) {
  const [targets, setTargets] = useState<PublishTarget[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  async function loadTargets() {
    const rows = await fetch(`/api/apps/${encodeURIComponent(appId)}/publish-targets`, {
      cache: "no-store",
    }).then((res) => readJson<PublishTarget[]>(res));
    setTargets(rows);
    setSelectedTargetId((current) => current ?? rows[0]?.id ?? null);
  }

  async function loadDeployments() {
    const rows = await fetch(`/api/apps/${encodeURIComponent(appId)}/deployments`, {
      cache: "no-store",
    }).then((res) => readJson<Deployment[]>(res));
    setDeployments(rows);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadTargets(), loadDeployments()])
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Publish data failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const hasActiveDeployment = deployments.some(
    (deployment) =>
      deployment.targetId === selectedTargetId &&
      (deployment.status === "pending" || deployment.status === "publishing")
  );

  const failedDeployments = useMemo(
    () => deployments.filter((deployment) => deployment.status === "failed" && deployment.error),
    [deployments]
  );

  useEffect(() => {
    if (!deployments.some((deployment) => deployment.status === "pending" || deployment.status === "publishing")) {
      return;
    }
    const timer = window.setInterval(() => {
      loadDeployments().catch((err) =>
        setError(err instanceof Error ? err.message : "Deployment refresh failed")
      );
    }, 3000);
    return () => window.clearInterval(timer);
  }, [appId, deployments]);

  async function handleCreateTarget() {
    setSaving(true);
    setError(null);
    try {
      const created = await fetch(`/api/apps/${encodeURIComponent(appId)}/publish-targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          config: {
            owner: form.owner.trim(),
            repo: form.repo.trim(),
            branch: form.branch.trim() || "gh-pages",
            githubToken: form.githubToken.trim(),
          },
        }),
      }).then((res) => readJson<PublishTarget>(res));
      setTargets((prev) => [created, ...prev]);
      setSelectedTargetId(created.id);
      setForm(EMPTY_FORM);
      toast.success("Publish target saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish target save failed";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestTarget(targetId: string) {
    setTestingId(targetId);
    setError(null);
    try {
      const result = await fetch(
        `/api/apps/${encodeURIComponent(appId)}/publish-targets/${encodeURIComponent(targetId)}/test`,
        { method: "POST" }
      ).then((res) => readJson<{ testStatus: "ok" | "failed"; error?: string }>(res));
      const next = { status: result.testStatus, error: result.error };
      setTestResults((prev) => ({ ...prev, [targetId]: next }));
      if (next.status === "ok") toast.success("GitHub Pages target is reachable");
      else toast.error(next.error ?? "GitHub Pages target test failed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish target test failed";
      setTestResults((prev) => ({ ...prev, [targetId]: { status: "failed", error: message } }));
      toast.error(message);
    } finally {
      setTestingId(null);
    }
  }

  async function handlePublish() {
    if (!selectedTargetId) return;
    setPublishing(true);
    setError(null);
    try {
      const result = await fetch(`/api/apps/${encodeURIComponent(appId)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: selectedTargetId }),
      }).then((res) => readJson<{ deployment: Deployment }>(res));
      setDeployments((prev) => [result.deployment, ...prev.filter((d) => d.id !== result.deployment.id)]);
      toast.success("Publish started");
      await loadDeployments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish failed to start";
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
              <Rocket className="h-4 w-4 text-primary" aria-hidden="true" />
              Publish
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono">{generatorType}</span> from{" "}
              <span className="font-mono">{sourceTable}</span> to GitHub Pages.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handlePublish}
            disabled={!selectedTargetId || publishing || hasActiveDeployment}
            className="gap-1.5"
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {hasActiveDeployment ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">Targets</h3>
              {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
            </div>
            {targets.length === 0 && !loading ? (
              <div className="surface-card-muted rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No publish target yet.
              </div>
            ) : (
              <div className="space-y-2">
                {targets.map((target) => {
                  const config = readTargetConfig(target);
                  const selected = target.id === selectedTargetId;
                  const testResult = testResults[target.id];
                  return (
                    <div
                      key={target.id}
                      className={cn(
                        "surface-card-muted rounded-lg border p-3 transition-colors",
                        selected && "border-primary"
                      )}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedTargetId(target.id)}
                          className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Globe2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            <span className="truncate text-sm font-medium">
                              {config.owner}/{config.repo}
                            </span>
                            {selected && <Badge variant="outline">Selected</Badge>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <GitBranch className="h-3 w-3" aria-hidden="true" />
                              {config.branch}
                            </span>
                            <span>{config.githubToken || "token saved"}</span>
                          </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          {testResult && (
                            <Badge variant={testResult.status === "ok" ? "success" : "destructive"}>
                              {testResult.status === "ok" ? "Reachable" : "Failed"}
                            </Badge>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleTestTarget(target.id)}
                            disabled={testingId === target.id}
                          >
                            {testingId === target.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Test
                          </Button>
                        </div>
                      </div>
                      {testResult?.status === "failed" && testResult.error && (
                        <p className="mt-2 text-xs text-destructive">{testResult.error}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="surface-card-muted rounded-lg border p-3">
            <h3 className="text-sm font-medium">New GitHub Pages Target</h3>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="publish-owner">Owner</Label>
                  <Input
                    id="publish-owner"
                    value={form.owner}
                    onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
                    placeholder="acme"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="publish-repo">Repo</Label>
                  <Input
                    id="publish-repo"
                    value={form.repo}
                    onChange={(event) => setForm((prev) => ({ ...prev, repo: event.target.value }))}
                    placeholder="site"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="publish-branch">Branch</Label>
                <Input
                  id="publish-branch"
                  value={form.branch}
                  onChange={(event) => setForm((prev) => ({ ...prev, branch: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="publish-token">GitHub token</Label>
                <Input
                  id="publish-token"
                  type="password"
                  value={form.githubToken}
                  onChange={(event) => setForm((prev) => ({ ...prev, githubToken: event.target.value }))}
                  placeholder="ghp_..."
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={handleCreateTarget}
                disabled={saving || !form.owner.trim() || !form.repo.trim() || !form.githubToken.trim()}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Save target
              </Button>
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Deployments</h3>
          {failedDeployments.length > 0 && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {failedDeployments[0].error}
            </div>
          )}
          {deployments.length === 0 ? (
            <div className="surface-card-muted rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No deployments yet.
            </div>
          ) : (
            <div className="surface-scroll overflow-hidden rounded-lg border">
              {deployments.slice(0, 5).map((deployment) => (
                <div
                  key={deployment.id}
                  className="flex flex-col gap-2 border-b px-3 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <DeploymentBadge status={deployment.status} />
                      <span className="font-mono text-xs text-muted-foreground">
                        {deployment.id.slice(0, 8)}
                      </span>
                      {deployment.url && (
                        <a
                          href={deployment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Open
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                    {deployment.error && (
                      <p className="mt-1 text-xs text-destructive">{deployment.error}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(deployment.startedAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
