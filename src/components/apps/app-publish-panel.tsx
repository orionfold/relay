"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  ExternalLink,
  GitBranch,
  Globe2,
  AlertTriangle,
  Loader2,
  Palette,
  Rocket,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STATIC_SITE_SETTINGS,
  STATIC_SITE_SETTING_OPTIONS,
  type StaticSiteSettings,
} from "@/lib/generators/static-site-settings";

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
  finalUrl: string | null;
  commit: string | null;
  artifactHash: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

type TestResult = { status: "ok" | "failed"; error?: string };

type PreviewArtifact = {
  artifactId: string;
  url: string;
  hash: string;
  createdAt: string;
  expiresAt: string;
};

type PreviewStatus = "fresh" | "stale" | "expired";

type SiteSettingsResponse = {
  settings: StaticSiteSettings;
  defaults: StaticSiteSettings;
  templates: StaticSiteTemplateOption[];
};

type StaticSiteTemplateOption = {
  id: string;
  version: string;
  name: string;
  description: string;
  provenance: {
    source: "orionfold-bundled";
    synthetic: true;
    note: string;
  };
  supportedSectionKinds: Array<"hero" | "features" | "cta" | "text">;
};

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
  const [previewing, setPreviewing] = useState(false);
  const [previewFrameLoading, setPreviewFrameLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewArtifact | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("fresh");
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [siteSettings, setSiteSettings] = useState<StaticSiteSettings>(
    DEFAULT_STATIC_SITE_SETTINGS
  );
  const [siteSettingsDraft, setSiteSettingsDraft] = useState<StaticSiteSettings>(
    DEFAULT_STATIC_SITE_SETTINGS
  );
  const [savingSiteSettings, setSavingSiteSettings] = useState(false);
  const [templates, setTemplates] = useState<StaticSiteTemplateOption[]>([]);

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

  async function loadSiteSettings() {
    const result = await fetch(`/api/apps/${encodeURIComponent(appId)}/site-settings`, {
      cache: "no-store",
    }).then((res) => readJson<SiteSettingsResponse>(res));
    setSiteSettings(result.settings);
    setSiteSettingsDraft(result.settings);
    setTemplates(result.templates);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadTargets(), loadDeployments(), loadSiteSettings()])
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
      if (next.status === "ok") toast.success("GitHub Pages target is reachable and writable");
      else toast.error(next.error ?? "GitHub Pages target test failed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish target test failed";
      setTestResults((prev) => ({ ...prev, [targetId]: { status: "failed", error: message } }));
      toast.error(message);
    } finally {
      setTestingId(null);
    }
  }

  const previewExpired = preview ? new Date(preview.expiresAt).getTime() <= Date.now() : false;
  const previewIsExpired = previewExpired || previewStatus === "expired";
  const previewIsStale = previewStatus === "stale";
  const previewPublishBlocked = previewIsExpired || previewIsStale;

  async function refreshPreviewStatus(current: PreviewArtifact) {
    const res = await fetch(
      `/api/apps/${encodeURIComponent(appId)}/preview?artifactId=${encodeURIComponent(
        current.artifactId
      )}`,
      { cache: "no-store" }
    );
    const body = (await res.json().catch(() => ({}))) as {
      stale?: boolean;
      code?: string;
      error?: string;
    };
    if (!res.ok) {
      if (body.code === "PREVIEW_EXPIRED") {
        setPreviewStatus("expired");
        return;
      }
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    setPreviewStatus(body.stale ? "stale" : "fresh");
  }

  useEffect(() => {
    if (!preview) return;

    let cancelled = false;
    const check = () => {
      refreshPreviewStatus(preview).catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Preview status refresh failed");
        }
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    const timer = window.setInterval(check, 5000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [appId, preview]);

  async function handlePreview() {
    setPreviewing(true);
    setError(null);
    try {
      const result = await fetch(`/api/apps/${encodeURIComponent(appId)}/preview`, {
        method: "POST",
      }).then((res) => readJson<PreviewArtifact>(res));
      setPreviewFrameLoading(true);
      setPreview(result);
      setPreviewStatus("fresh");
      toast.success("Preview generated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview generation failed";
      setError(message);
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSaveSiteSettings() {
    setSavingSiteSettings(true);
    setError(null);
    try {
      const result = await fetch(`/api/apps/${encodeURIComponent(appId)}/site-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteSettingsDraft),
      }).then((res) => readJson<SiteSettingsResponse>(res));
      setSiteSettings(result.settings);
      setSiteSettingsDraft(result.settings);
      setTemplates(result.templates);
      if (preview) setPreviewStatus("stale");
      toast.success("Site controls saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Site controls save failed";
      setError(message);
      toast.error(message);
    } finally {
      setSavingSiteSettings(false);
    }
  }

  async function handlePublish(artifactId?: string) {
    if (!selectedTargetId) return;
    setPublishing(true);
    setError(null);
    try {
      const result = await fetch(`/api/apps/${encodeURIComponent(appId)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: selectedTargetId, artifactId }),
      }).then((res) => readJson<{ deployment: Deployment }>(res));
      setDeployments((prev) => [result.deployment, ...prev.filter((d) => d.id !== result.deployment.id)]);
      toast.success(artifactId ? "Preview publish started" : "Publish started");
      await loadDeployments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish failed to start";
      setError(message);
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  }

  const siteSettingsDirty =
    JSON.stringify(siteSettingsDraft) !== JSON.stringify(siteSettings);

  const selectedTemplate = templates.find(
    (template) => template.id === siteSettingsDraft.templateId
  );

  function updateSiteSetting<K extends keyof StaticSiteSettings>(
    key: K,
    value: StaticSiteSettings[K]
  ) {
    setSiteSettingsDraft((prev) => ({ ...prev, [key]: value }));
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handlePreview}
              disabled={previewing}
              className="gap-1.5"
            >
              {previewing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Preview
            </Button>
            <Button
              type="button"
              size="sm"
              variant={preview ? "outline" : "default"}
              onClick={() => handlePublish()}
              disabled={!selectedTargetId || publishing || hasActiveDeployment}
              className="gap-1.5"
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {hasActiveDeployment ? "Publishing…" : preview ? "Publish fresh" : "Publish"}
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

        {preview && (
          <section className="surface-card-muted rounded-lg border p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">Local preview</h3>
                  <Badge
                    variant="outline"
                    className={
                      previewIsExpired || previewIsStale
                        ? "border-status-warning/25 bg-status-warning/10 text-status-warning"
                        : undefined
                    }
                  >
                    {previewIsExpired ? "Expired" : previewIsStale ? "Stale" : "Fresh"}
                  </Badge>
                </div>
                {previewIsStale && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-status-warning">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Source rows changed. Generate a new preview before publishing.
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Hash{" "}
                    <span className="font-mono text-foreground">
                      {preview.hash.slice(0, 12)}
                    </span>
                  </span>
                  <span>{new Date(preview.createdAt).toLocaleString()}</span>
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    View without chrome
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => handlePublish(preview.artifactId)}
                disabled={
                  !selectedTargetId ||
                  publishing ||
                  hasActiveDeployment ||
                  previewPublishBlocked
                }
                className="gap-1.5"
              >
                {publishing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Publish this preview
              </Button>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border bg-background">
              <div className="relative aspect-[16/10] min-h-[320px] w-full">
                {previewFrameLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Loading preview…
                  </div>
                )}
                <iframe
                  key={preview.artifactId}
                  title="Local generated site preview"
                  src={preview.url}
                  className="h-full w-full bg-white"
                  sandbox="allow-same-origin"
                  onLoad={() => setPreviewFrameLoading(false)}
                />
              </div>
            </div>
          </section>
        )}

        <section className="surface-card-muted rounded-lg border p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
                Site controls
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Theme and layout settings used by both preview and publish.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveSiteSettings}
              disabled={!siteSettingsDirty || savingSiteSettings}
              className="gap-1.5"
            >
              {savingSiteSettings ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Save controls
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="site-template">Template</Label>
              <Select
                value={siteSettingsDraft.templateId}
                onValueChange={(value) => updateSiteSetting("templateId", value)}
              >
                <SelectTrigger id="site-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground">
                  {selectedTemplate.description} Provenance: Orionfold bundled
                  synthetic template v{selectedTemplate.version}.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-theme">Theme</Label>
              <Select
                value={siteSettingsDraft.theme}
                onValueChange={(value) =>
                  updateSiteSetting("theme", value as StaticSiteSettings["theme"])
                }
              >
                <SelectTrigger id="site-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATIC_SITE_SETTING_OPTIONS.theme.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-density">Density</Label>
              <Select
                value={siteSettingsDraft.density}
                onValueChange={(value) =>
                  updateSiteSetting("density", value as StaticSiteSettings["density"])
                }
              >
                <SelectTrigger id="site-density">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATIC_SITE_SETTING_OPTIONS.density.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-hero-layout">Hero layout</Label>
              <Select
                value={siteSettingsDraft.heroLayout}
                onValueChange={(value) =>
                  updateSiteSetting("heroLayout", value as StaticSiteSettings["heroLayout"])
                }
              >
                <SelectTrigger id="site-hero-layout">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATIC_SITE_SETTING_OPTIONS.heroLayout.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-accent">Accent</Label>
              <Select
                value={siteSettingsDraft.accent}
                onValueChange={(value) =>
                  updateSiteSetting("accent", value as StaticSiteSettings["accent"])
                }
              >
                <SelectTrigger id="site-accent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATIC_SITE_SETTING_OPTIONS.accent.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-section-style">Section style</Label>
              <Select
                value={siteSettingsDraft.sectionStyle}
                onValueChange={(value) =>
                  updateSiteSetting("sectionStyle", value as StaticSiteSettings["sectionStyle"])
                }
              >
                <SelectTrigger id="site-section-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATIC_SITE_SETTING_OPTIONS.sectionStyle.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
              <div className="min-w-0">
                <Label htmlFor="site-show-ctas">Show CTAs</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Include section action buttons.
                </p>
              </div>
              <Switch
                id="site-show-ctas"
                checked={siteSettingsDraft.showCtas}
                onCheckedChange={(checked) => updateSiteSetting("showCtas", checked)}
              />
            </div>
          </div>
        </section>

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
                <p className="text-xs text-muted-foreground">
                  Token requires GitHub Contents: Read and write permission for this repo.
                </p>
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
                          GitHub Pages
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                      {deployment.finalUrl && deployment.finalUrl !== deployment.url ? (
                        <a
                          href={deployment.finalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Final URL
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      ) : (
                        deployment.status === "success" &&
                        deployment.url && (
                          <span className="text-xs text-muted-foreground">
                            No custom-domain redirect detected
                          </span>
                        )
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
