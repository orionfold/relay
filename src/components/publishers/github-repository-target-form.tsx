"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Github, Loader2, LockKeyhole, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type GitHubPublishTarget = {
  id: string;
  appId: string;
  targetType: "github-pages" | "github-repo";
  config: string;
  createdAt: string;
};

type Connection = { connected: boolean; login: string | null; verifiedAt?: string | null };
type Repository = {
  owner: string;
  repo: string;
  fullName: string;
  visibility: "public" | "private";
  defaultBranch: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${response.status}`);
  return body;
}

export function GitHubRepositoryTargetForm({
  appId,
  targetType,
  defaultBranch,
  allowDirectory = false,
  title,
  onCreated,
}: {
  appId: string;
  targetType: "github-pages" | "github-repo";
  defaultBranch: string;
  allowDirectory?: boolean;
  title: string;
  onCreated: (target: GitHubPublishTarget) => void;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selection, setSelection] = useState("");
  const [manual, setManual] = useState(false);
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState(defaultBranch);
  const [directory, setDirectory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/settings/github", { cache: "no-store" })
      .then((response) => readJson<Connection>(response))
      .then(async (status) => {
        if (cancelled) return;
        setConnection(status);
        if (!status.connected) return;
        const rows = await fetch("/api/settings/github/repositories", { cache: "no-store" })
          .then((response) => readJson<Repository[]>(response));
        if (!cancelled) setRepositories(rows);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "GitHub setup failed to load");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(
    () => repositories.find((repository) => repository.fullName === selection) ?? null,
    [repositories, selection]
  );

  function chooseRepository(value: string) {
    setSelection(value);
    if (value === "__manual__") {
      setManual(true);
      setOwner("");
      setRepo("");
      setBranch(defaultBranch);
      return;
    }
    setManual(false);
    const selectedRepo = repositories.find((repository) => repository.fullName === value);
    if (!selectedRepo) return;
    setOwner(selectedRepo.owner);
    setRepo(selectedRepo.repo);
    setBranch(targetType === "github-pages" ? defaultBranch : selectedRepo.defaultBranch);
  }

  async function saveTarget() {
    setSaving(true);
    setError(null);
    try {
      const config = {
        owner: owner.trim(),
        repo: repo.trim(),
        branch: branch.trim() || defaultBranch,
        ...(allowDirectory ? { directory: directory.trim() } : {}),
      };
      const created = await fetch(`/api/apps/${encodeURIComponent(appId)}/publish-targets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, config }),
      }).then((response) => readJson<GitHubPublishTarget>(response));
      onCreated(created);
      setSelection("");
      setManual(false);
      setOwner("");
      setRepo("");
      setBranch(defaultBranch);
      setDirectory("");
      toast.success("GitHub repository target saved");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Repository target save failed";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="surface-card-muted flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading GitHub repositories…</div>;
  }

  if (!connection?.connected) {
    return (
      <div className="surface-card-muted rounded-lg border p-3">
        <div className="flex items-start gap-3">
          <Github className="mt-0.5 h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">Connect GitHub once</h3>
            <p className="mt-1 text-xs text-muted-foreground">The same connection publishes websites and Packs to public or private repositories you can write to.</p>
            <Button asChild size="sm" className="mt-3"><a href="/settings#settings-github">Open GitHub settings <ExternalLink className="h-3.5 w-3.5" /></a></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="surface-card-muted rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Connected as {connection.login ? `@${connection.login}` : "your GitHub account"}. Public and private repositories use the same flow.</p>
        </div>
        <Badge variant="success">GitHub connected</Badge>
      </div>

      <div className="mt-3 space-y-3">
        {repositories.length > 0 && (
          <div className="space-y-1.5">
            <Label>Choose repository</Label>
            <Select value={selection} onValueChange={chooseRepository}>
              <SelectTrigger><SelectValue placeholder="Choose a repository" /></SelectTrigger>
              <SelectContent>
                {repositories.map((repository) => (
                  <SelectItem key={repository.fullName} value={repository.fullName}>
                    {repository.fullName} · {repository.visibility === "public" ? "Public" : "Private"}
                  </SelectItem>
                ))}
                <SelectItem value="__manual__">Enter another repository manually</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {(manual || repositories.length === 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor={`${targetType}-owner-${appId}`}>Owner</Label><Input id={`${targetType}-owner-${appId}`} value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="your-org" /></div>
            <div className="space-y-1.5"><Label htmlFor={`${targetType}-repo-${appId}`}>Repository name</Label><Input id={`${targetType}-repo-${appId}`} value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="repository-name" /></div>
          </div>
        )}

        {selected && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {selected.visibility === "private" ? <LockKeyhole className="h-3.5 w-3.5" /> : <Github className="h-3.5 w-3.5" />}
            <span>{selected.visibility === "public" ? "Public — shareable and eligible for Relay Community review" : "Private — visible only to repository collaborators"}</span>
          </div>
        )}

        <div className={allowDirectory ? "grid gap-3 sm:grid-cols-2" : "space-y-1.5"}>
          <div className="space-y-1.5"><Label htmlFor={`${targetType}-branch-${appId}`}>Branch</Label><Input id={`${targetType}-branch-${appId}`} value={branch} onChange={(event) => setBranch(event.target.value)} /></div>
          {allowDirectory && <div className="space-y-1.5"><Label htmlFor={`${targetType}-directory-${appId}`}>Directory (optional)</Label><Input id={`${targetType}-directory-${appId}`} value={directory} onChange={(event) => setDirectory(event.target.value)} placeholder="packs/my-pack" /></div>}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={saveTarget} disabled={saving || !owner.trim() || !repo.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save repository
          </Button>
        </div>
      </div>
    </section>
  );
}
