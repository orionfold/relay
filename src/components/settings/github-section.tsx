"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Github, Loader2, PlugZap, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Connection = {
  connected: boolean;
  login: string | null;
  source: "settings" | "environment" | null;
  tokenHint: string | null;
  verifiedAt: string | null;
};

const DISCONNECTED: Connection = { connected: false, login: null, source: null, tokenHint: null, verifiedAt: null };

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${response.status}`);
  return body;
}

export function GitHubSection() {
  const [connection, setConnection] = useState<Connection>(DISCONNECTED);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConnection(await fetch("/api/settings/github", { cache: "no-store" }).then((r) => readJson<Connection>(r)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "GitHub connection failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    setSaving(true);
    try {
      const result = await fetch("/api/settings/github", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }).then((r) => readJson<Connection>(r));
      setConnection(result);
      setToken("");
      toast.success(`GitHub connected${result.login ? ` as ${result.login}` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "GitHub connection failed");
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    setSaving(true);
    try {
      const result = await fetch("/api/settings/github", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verify: true }),
      }).then((r) => readJson<Connection>(r));
      setConnection(result);
      toast.success("GitHub connection verified");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "GitHub verification failed");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    try {
      await fetch("/api/settings/github", { method: "DELETE" }).then((r) => readJson<Connection>(r));
      setConnection(DISCONNECTED);
      toast.success("Saved GitHub connection removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "GitHub disconnect failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Github className="h-5 w-5" />GitHub</CardTitle>
        <CardDescription>
          Connect once, then reuse the same account for public or private Pack repositories and GitHub Pages publishing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="surface-card-muted rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Connection</span>
                {loading ? <Badge variant="outline">Checking…</Badge> : connection.connected ? <Badge variant="success">Configured</Badge> : <Badge variant="secondary">Not connected</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {connection.connected
                  ? `${connection.login ? `@${connection.login}` : "GitHub account"} · ${connection.tokenHint ?? "credential available"} · ${connection.source === "environment" ? "GITHUB_TOKEN environment variable" : "encrypted in Relay settings"}${connection.verifiedAt ? ` · verified ${new Date(connection.verifiedAt).toLocaleString()}` : " · verification required"}`
                  : "Relay will never return the token to the browser or expose it to chat."}
              </p>
            </div>
            {connection.connected && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={verify} disabled={saving}>Verify</Button>
                {connection.source === "settings" && <Button size="sm" variant="outline" onClick={disconnect} disabled={saving}><Unplug className="h-3.5 w-3.5" />Disconnect</Button>}
              </div>
            )}
          </div>
        </div>

        {connection.source !== "environment" && (
          <div className="space-y-2">
            <Label htmlFor="github-token">{connection.connected ? "Replace fine-grained token" : "Fine-grained token"}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="github-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Contents: Read and write" autoComplete="off" />
              <Button onClick={connect} disabled={saving || !token.trim()} className="shrink-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Save and verify
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Grant repository Contents read/write access only to repositories Relay should publish. Repository visibility remains your GitHub setting.
            </p>
          </div>
        )}

        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Create a fine-grained GitHub token <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
  );
}
