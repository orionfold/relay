"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Server } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Types ───────────────────────────────────────────────────────────

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

type ConnectionStatus = "idle" | "testing" | "connected" | "failed";

// ── Component ───────────────────────────────────────────────────────

export function OllamaSection() {
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pullModel, setPullModel] = useState("");
  const [pulling, setPulling] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);

  // ── Load settings ───────────────────────────────────────────────

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings/ollama");
        if (res.ok) {
          const data = await res.json();
          if (data.baseUrl) setBaseUrl(data.baseUrl);
        }
      } catch {
        // Settings not yet saved, use defaults
      }
    }
    loadSettings();
  }, []);

  // ── Fetch models ──────────────────────────────────────────────

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/runtimes/ollama");
      if (res.ok) {
        const data = await res.json();
        setModels(data.models ?? []);
        setConnectionStatus("connected");
        setConnectionError(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setConnectionStatus("failed");
        setConnectionError(data.error ?? "Failed to connect");
        setModels([]);
      }
    } catch {
      setConnectionStatus("failed");
      setConnectionError("Cannot reach Ollama API");
      setModels([]);
    }
  }, []);

  // ── Test connection ───────────────────────────────────────────

  async function handleTestConnection() {
    setConnectionStatus("testing");
    setConnectionError(null);
    await fetchModels();
  }

  // ── Save base URL ─────────────────────────────────────────────

  async function handleSaveUrl() {
    setSavingUrl(true);
    try {
      const res = await fetch("/api/settings/ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl }),
      });
      if (res.ok) {
        toast.success("Ollama base URL saved");
        // Re-test connection with new URL
        await fetchModels();
      } else {
        toast.error("Failed to save base URL");
      }
    } finally {
      setSavingUrl(false);
    }
  }

  // ── Pull model ────────────────────────────────────────────────

  async function handlePullModel() {
    if (!pullModel.trim()) return;
    setPulling(true);
    try {
      const res = await fetch("/api/runtimes/ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", model: pullModel.trim() }),
      });
      if (res.ok) {
        toast.success(`Model "${pullModel.trim()}" pulled successfully`);
        setPullModel("");
        await fetchModels();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to pull model");
      }
    } finally {
      setPulling(false);
    }
  }

  // ── Format file size ──────────────────────────────────────────

  function formatSize(bytes: number): string {
    if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`;
    return `${(bytes / 1e9).toFixed(1)} GB`;
  }

  // ── Connection status dot ─────────────────────────────────────

  const statusDot =
    connectionStatus === "connected"
      ? "bg-success"
      : connectionStatus === "failed"
        ? "bg-destructive"
        : connectionStatus === "testing"
          ? "bg-warning animate-pulse"
          : "border-2 border-muted-foreground/40";

  return (
    <Card id="settings-ollama" className="surface-card scroll-mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Ollama (Local Models)
        </CardTitle>
        <CardDescription>
          Run models locally with Ollama. Free, private, no API key required.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Base URL */}
        <div className="space-y-2">
          <Label htmlFor="ollama-url">Base URL</Label>
          <div className="flex gap-2">
            <Input
              id="ollama-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveUrl}
              disabled={savingUrl}
            >
              {savingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>

        {/* Connection test */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={connectionStatus === "testing"}
          >
            {connectionStatus === "testing" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Test Connection
          </Button>

          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
            <span className="text-sm text-muted-foreground">
              {connectionStatus === "connected" && `Connected. ${models.length} model${models.length !== 1 ? "s" : ""} available`}
              {connectionStatus === "failed" && (connectionError ?? "Not connected")}
              {connectionStatus === "testing" && "Testing..."}
              {connectionStatus === "idle" && "Not tested"}
            </span>
          </div>
        </div>

        {/* Available models list */}
        {models.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Available Models
            </p>
            <div className="rounded-xl border border-border/60 divide-y divide-border/40">
              {models.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="text-sm font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatSize(m.size)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              To set a default Ollama model for chat, use the Chat section above.
            </p>
          </div>
        )}

        {/* Pull model */}
        <div className="space-y-2">
          <Label htmlFor="ollama-pull">Pull a Model</Label>
          <div className="flex gap-2">
            <Input
              id="ollama-pull"
              value={pullModel}
              onChange={(e) => setPullModel(e.target.value)}
              placeholder="e.g., llama3.2, mistral, codellama"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePullModel();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handlePullModel}
              disabled={pulling || !pullModel.trim()}
            >
              {pulling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Pull
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Download models from the Ollama library. This may take several minutes for large models.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
