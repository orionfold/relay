"use client";

import { useEffect, useState } from "react";
import {
  CircleSlash,
  ExternalLink,
  Import,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  OpenAIAccountInfo,
  OpenAIRateLimitInfo,
} from "@/lib/settings/openai-auth";
import type { OpenAILoginState } from "@/lib/settings/openai-login-manager";
import type { RuntimeConnectionResult } from "@/lib/agents/runtime/types";

interface OpenAIChatGPTAuthControlProps {
  connected: boolean;
  existingSessionAvailable: boolean;
  existingSessionAdoptable: boolean;
  account: OpenAIAccountInfo | null;
  rateLimits: OpenAIRateLimitInfo | null;
  initialLoginState: OpenAILoginState;
  onChanged: () => Promise<void>;
  onLoginStateChange?: (state: OpenAILoginState) => void;
}

function formatResetAt(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPlanType(value: string | null | undefined) {
  if (!value) return "Unknown";

  switch (value.toLowerCase()) {
    case "prolite":
    case "pro":
      return "Pro";
    case "plus":
      return "Plus";
    case "business":
      return "Business";
    case "enterprise":
      return "Enterprise";
    case "edu":
    case "education":
      return "Education";
    default:
      return value;
  }
}

function failedLoginState(message: string): OpenAILoginState {
  return {
    phase: "failed",
    loginId: null,
    authUrl: null,
    account: null,
    rateLimits: null,
    error: message,
    startedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

async function readLoginResponse(
  response: Response,
  action: string,
): Promise<OpenAILoginState> {
  const text =
    typeof response.text === "function"
      ? await response.text()
      : JSON.stringify(await response.json());
  if (!text.trim()) {
    throw new Error(`${action} returned an empty response.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${action} returned a non-JSON response.`);
  }
  if (!response.ok) {
    const message =
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof parsed.error === "string"
        ? parsed.error
        : `${action} failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("phase" in parsed) ||
    typeof parsed.phase !== "string"
  ) {
    throw new Error(`${action} returned an invalid response.`);
  }
  return parsed as OpenAILoginState;
}

export function OpenAIChatGPTAuthControl({
  connected,
  existingSessionAvailable,
  existingSessionAdoptable,
  account,
  rateLimits,
  initialLoginState,
  onChanged,
  onLoginStateChange,
}: OpenAIChatGPTAuthControlProps) {
  const [loginState, setLoginState] = useState<OpenAILoginState>(initialLoginState);
  const [testResult, setTestResult] = useState<RuntimeConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);

  function updateLoginState(next: OpenAILoginState) {
    setLoginState(next);
    onLoginStateChange?.(next);
  }

  useEffect(() => {
    updateLoginState(initialLoginState);
  }, [initialLoginState]);

  useEffect(() => {
    if (loginState.phase !== "pending") return;

    const interval = window.setInterval(async () => {
      try {
        const res = await fetch("/api/settings/openai/login");
        const next = await readLoginResponse(res, "ChatGPT sign-in status");
        updateLoginState(next);
        if (next.phase !== "pending") {
          window.clearInterval(interval);
          await onChanged();
        }
      } catch (error) {
        window.clearInterval(interval);
        updateLoginState(
          failedLoginState(
            error instanceof Error
              ? error.message
              : "ChatGPT sign-in status could not be read.",
          ),
        );
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [loginState.phase, onChanged]);

  async function handleStartLogin() {
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/openai/login", { method: "POST" });
      const next = await readLoginResponse(res, "ChatGPT sign-in");
      updateLoginState(next);
      if (next.authUrl) {
        window.open(next.authUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      updateLoginState(
        failedLoginState(
          error instanceof Error
            ? error.message
            : "ChatGPT sign-in could not start.",
        ),
      );
    }
  }

  async function handleAdoptExistingSession() {
    setAdopting(true);
    setAdoptionError(null);
    setTestResult(null);
    try {
      const response = await fetch("/api/settings/openai/adopt", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        connected?: boolean;
        error?: string;
      };
      if (!response.ok || payload.connected !== true) {
        throw new Error(
          payload.error ?? "Relay could not use the existing Codex sign-in.",
        );
      }
      await onChanged();
    } catch (error) {
      setAdoptionError(
        error instanceof Error
          ? error.message
          : "Relay could not use the existing Codex sign-in.",
      );
    } finally {
      setAdopting(false);
    }
  }

  async function handleCancelLogin() {
    try {
      const res = await fetch("/api/settings/openai/login", { method: "DELETE" });
      const next = await readLoginResponse(res, "Cancel ChatGPT sign-in");
      updateLoginState(next);
      await onChanged();
    } catch (error) {
      updateLoginState(
        failedLoginState(
          error instanceof Error
            ? error.message
            : "ChatGPT sign-in could not be cancelled.",
        ),
      );
    }
  }

  async function handleLogout() {
    setSigningOut(true);
    try {
      await fetch("/api/settings/openai/logout", { method: "POST" });
      updateLoginState({
        phase: "idle",
        loginId: null,
        authUrl: null,
        account: null,
        rateLimits: null,
        error: null,
        startedAt: null,
        updatedAt: new Date().toISOString(),
      });
      setTestResult(null);
      await onChanged();
    } finally {
      setSigningOut(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime: "openai-codex-app-server" }),
      });
      const result = (await res.json()) as RuntimeConnectionResult;
      setTestResult(result);
      if (result.connected) {
        await onChanged();
      }
    } finally {
      setTesting(false);
    }
  }

  const visibleAccount = account ?? loginState.account;
  const visibleRateLimits = rateLimits ?? loginState.rateLimits;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        ChatGPT mode uses Codex App Server&apos;s browser sign-in flow and keeps the session
        in Orionfold Relay&apos;s isolated Codex home so it does not touch your normal `~/.codex` login.
      </p>

      {!connected && existingSessionAvailable && (
        <div className="surface-card-muted rounded-lg border p-3">
          <div className="flex items-start gap-2">
            <Import
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Existing Codex sign-in found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {existingSessionAdoptable
                  ? "Copy it once into Relay's isolated Codex store. Relay will not change or sign out your normal Codex session."
                  : "Your normal Codex login is stored by the operating system and cannot be copied safely. Sign in below to create Relay's separate session; your normal Codex session remains unchanged."}
              </p>
              {existingSessionAdoptable && (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  disabled={adopting}
                  onClick={handleAdoptExistingSession}
                >
                  {adopting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Verifying…
                    </>
                  ) : (
                    "Use existing Codex sign-in"
                  )}
                </Button>
              )}
              {adoptionError && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {adoptionError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {visibleAccount?.email && (
        <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>{visibleAccount.email}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Plan: {formatPlanType(visibleAccount.planType)}
          </p>
        </div>
      )}

      {visibleRateLimits?.primary && (
        <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
          <p className="text-sm font-medium">Codex rate limits</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {visibleRateLimits.primary.usedPercent ?? 0}% used in the current{" "}
            {visibleRateLimits.primary.windowDurationMins ?? "?"}-minute window
            {formatResetAt(visibleRateLimits.primary.resetsAt)
              ? ` • resets ${formatResetAt(visibleRateLimits.primary.resetsAt)}`
              : ""}
          </p>
        </div>
      )}

      {loginState.phase === "pending" ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Waiting for ChatGPT sign-in
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Complete the browser flow, then return here. This page will update automatically.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {loginState.authUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={loginState.authUrl} target="_blank" rel="noreferrer">
                  Open login page
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleCancelLogin}>
              Cancel sign-in
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!connected && (
            <Button size="sm" onClick={handleStartLogin}>
              Sign in with ChatGPT
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Test connection
          </Button>
          {connected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <LogOut className="mr-1 h-3.5 w-3.5" />
              )}
              Sign out
            </Button>
          )}
        </div>
      )}

      {loginState.phase === "cancelled" && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CircleSlash className="h-4 w-4" />
          <span>ChatGPT sign-in cancelled.</span>
        </p>
      )}

      {loginState.phase === "failed" && loginState.error && (
        <p className="flex items-center gap-1.5 text-sm text-status-failed">
          <XCircle className="h-4 w-4" />
          <span>{loginState.error}</span>
        </p>
      )}

      {testResult && (
        <p
          className={`flex items-center gap-1.5 text-sm ${
            testResult.connected ? "text-success" : "text-status-failed"
          }`}
        >
          {testResult.connected ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>{testResult.connected ? "Connected" : testResult.error ?? "Connection failed"}</span>
        </p>
      )}
    </div>
  );
}
