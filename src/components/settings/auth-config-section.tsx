"use client";

import { useState, useEffect, useCallback } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AuthMethodSelector } from "./auth-method-selector";
import { ApiKeyForm } from "./api-key-form";
import { AuthStatusBadge } from "./auth-status-badge";
import { ConnectionTestControl } from "./connection-test-control";
import type { AuthMethod, ApiKeySource } from "@/lib/constants/settings";
import {
  DEFAULT_AGENT_RUNTIME,
  getRuntimeCatalogEntry,
} from "@/lib/agents/runtime/catalog";

interface AuthSettings {
  method: AuthMethod;
  hasKey: boolean;
  apiKeySource: ApiKeySource;
}

export function AuthConfigSection() {
  const runtime = getRuntimeCatalogEntry(DEFAULT_AGENT_RUNTIME);
  const [settings, setSettings] = useState<AuthSettings>({
    method: "oauth",
    hasKey: false,
    apiKeySource: "unknown",
  });
  const [connected, setConnected] = useState(false);
  const [testControlKey, setTestControlKey] = useState(0);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const data = await res.json();
      setSettings(data);
      setConnected(data.hasKey || data.apiKeySource === "oauth");
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleMethodChange(method: AuthMethod) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });
    if (res.ok) {
      const data = await res.json();
      setSettings(data);
      setConnected(data.hasKey || data.apiKeySource === "oauth");
      setTestControlKey((current) => current + 1);
    }
  }

  async function handleSaveKey(apiKey: string) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "api_key", apiKey }),
    });
    if (res.ok) {
      const data = await res.json();
      setSettings(data);
      setConnected(true);
    }
  }

  async function handleTestConnection() {
    const res = await fetch("/api/settings/test", { method: "POST" });
    const data = await res.json();
    setConnected(data.connected);
    if (data.connected) {
      const source = data.apiKeySource || "unknown";
      setSettings((prev) => ({ ...prev, apiKeySource: source as ApiKeySource }));
    } else {
      setSettings((prev) => ({ ...prev, apiKeySource: "unknown" }));
    }
    return data;
  }

  return (
    <Card className="surface-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Authentication</CardTitle>
            <CardDescription>
              Configure how Orionfold Relay connects to the {runtime.label} runtime
            </CardDescription>
          </div>
          <AuthStatusBadge connected={connected} apiKeySource={settings.apiKeySource} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <AuthMethodSelector value={settings.method} onChange={handleMethodChange} />

        {settings.method === "api_key" && (
          <>
            <Separator />
            <ApiKeyForm
              key={`api-key-form-${testControlKey}`}
              hasKey={settings.hasKey}
              onSave={handleSaveKey}
              onTest={handleTestConnection}
            />
            {settings.apiKeySource === "env" && (
              <p className="text-xs text-muted-foreground">
                Currently using API key from environment variable (ANTHROPIC_API_KEY).
                You can optionally save a managed key above to override it.
              </p>
            )}
          </>
        )}

        {settings.method === "oauth" && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Supports resume, approvals, MCP passthrough, task assist, and profile smoke tests.
              </p>
              <p className="text-sm text-muted-foreground">
                OAuth mode uses the Claude Agent SDK&apos;s built-in authentication flow.
                Requires an active Claude Max or Pro subscription.
              </p>
              <ConnectionTestControl
                key={`oauth-test-${testControlKey}`}
                onTest={handleTestConnection}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
