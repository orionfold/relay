"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OfMark } from "@/components/shared/of-mark";

type Mode = "login" | "setup" | "recovery";

export function AccessCard({ mode }: { mode: Mode }) {
  const pathname = usePathname();
  const prefix = useMemo(() => pathname.slice(0, pathname.lastIndexOf("/auth/")), [pathname]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [credential, setCredential] = useState("");
  const [deviceName, setDeviceName] = useState("This browser");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  useEffect(() => {
    fetch(`${prefix}/api/auth/status`, { cache: "no-store" })
      .then((response) => response.json())
      .then((status: { configured?: boolean; authenticated?: boolean }) => {
        if (status.authenticated) window.location.assign(`${prefix}/`);
        else if (!status.configured && mode === "login") window.location.assign(`${prefix}/auth/setup`);
        else if (status.configured && mode === "setup") window.location.assign(`${prefix}/auth/login`);
      })
      .catch(() => setError("Relay could not read the access state."));
  }, [mode, prefix]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode !== "login" && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const endpoint = mode === "setup" ? "bootstrap" : mode;
      const body = mode === "login"
        ? { password, deviceName }
        : mode === "setup"
          ? { token: credential, password, deviceName }
          : { recoveryCode: credential, newPassword: password, deviceName };
      const response = await fetch(`${prefix}/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { detail?: string; error?: string; recoveryCodes?: string[] };
      if (!response.ok) throw new Error(result.detail || result.error || "Access was not granted.");
      if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
      else window.location.assign(`${prefix}/`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Access was not granted.");
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <AccessFrame>
        <Card className="surface-card w-full max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-status-completed" />Save recovery codes</CardTitle>
            <CardDescription>Each code works once. They are not stored in your browser and Relay will not show them again.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="grid gap-2 rounded-lg bg-[var(--surface-2)] p-4 font-mono text-sm sm:grid-cols-2">
              {recoveryCodes.map((code) => <li key={code}>{code}</li>)}
            </ol>
            <Button className="w-full" onClick={() => window.location.assign(`${prefix}/`)}>I saved these codes</Button>
          </CardContent>
        </Card>
      </AccessFrame>
    );
  }

  const title = mode === "login" ? "Sign in to Relay" : mode === "setup" ? "Create the first administrator" : "Recover administrator access";
  const description = mode === "login"
    ? "This password approves a revocable session for this browser."
    : mode === "setup"
      ? "Run `relay auth bootstrap` on the Relay server, then enter the single-use credential below."
      : "A recovery code revokes the old password and every existing session.";

  return (
    <AccessFrame>
      <Card className="surface-card w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {mode !== "login" && (
              <div className="space-y-2">
                <Label htmlFor="credential">{mode === "setup" ? "Bootstrap credential" : "Recovery code"}</Label>
                <Input id="credential" autoComplete="one-time-code" value={credential} onChange={(event) => setCredential(event.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">{mode === "recovery" ? "New password" : "Password"}</Label>
              <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 12} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {mode !== "login" && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="device-name">Session name</Label>
              <Input id="device-name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} required />
            </div>
            {error && <p role="alert" className="text-sm text-status-failed">{error}</p>}
            <Button className="w-full" disabled={busy} type="submit">{busy ? "Checking…" : mode === "login" ? "Sign in" : mode === "setup" ? "Create administrator" : "Recover access"}</Button>
            {mode === "login" && <p className="text-center text-xs text-muted-foreground"><Link className="underline underline-offset-4" href={`${prefix}/auth/recovery`}>Use a recovery code</Link></p>}
            {mode === "recovery" && <p className="text-center text-xs text-muted-foreground"><Link className="underline underline-offset-4" href={`${prefix}/auth/login`}>Return to sign in</Link></p>}
          </form>
        </CardContent>
      </Card>
    </AccessFrame>
  );
}

function AccessFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="surface-page flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="flex w-full flex-col items-center gap-6">
        <div className="flex items-center gap-3" aria-label="Orionfold Relay"><OfMark size={40} /><span className="text-xl font-semibold">Orionfold Relay</span></div>
        {children}
      </div>
    </main>
  );
}
