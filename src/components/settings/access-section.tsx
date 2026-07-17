"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Session = {
  id: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  current?: boolean;
};

type Event = {
  id: string;
  eventType: string;
  reasonCode: string;
  createdAt: number;
};

export function AccessSection() {
  const [profile, setProfile] = useState<string>("trusted-local");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const statusResponse = await fetch("/api/auth/status", { cache: "no-store" });
      const status = (await statusResponse.json()) as { exposureProfile: string };
      setProfile(status.exposureProfile);
      if (status.exposureProfile === "trusted-local") return;
      const [sessionResponse, eventResponse] = await Promise.all([
        fetch("/api/auth/sessions", { cache: "no-store" }),
        fetch("/api/auth/events?limit=12", { cache: "no-store" }),
      ]);
      if (!sessionResponse.ok || !eventResponse.ok) throw new Error("Access receipts could not be loaded.");
      setSessions(((await sessionResponse.json()) as { sessions: Session[] }).sessions);
      setEvents(((await eventResponse.json()) as { events: Event[] }).events);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Access state could not be loaded.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function revoke(sessionId: string) {
    const response = await fetch("/api/auth/sessions", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (!response.ok) {
      setError("The session could not be revoked.");
      return;
    }
    const current = sessions.find((session) => session.id === sessionId)?.current;
    if (current) window.location.assign("/auth/login");
    else void load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/auth/login");
  }

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Access & sessions</CardTitle>
        <CardDescription>
          {profile === "trusted-local"
            ? "Trusted-local Relay stays loopback-only and does not require a browser session. Authenticated profiles are selected when the server starts."
            : `This Cell is protected by the ${profile} profile. Password sign-in approves one revocable browser session.`}
        </CardDescription>
      </CardHeader>
      {profile !== "trusted-local" && (
        <CardContent className="space-y-5">
          {error && <p role="alert" className="text-sm text-status-failed">{error}</p>}
          <div className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Approved browser sessions</h3><Button size="sm" variant="outline" onClick={logout}><LogOut className="h-4 w-4" />Sign out</Button></div>
            <div className="divide-y divide-border rounded-lg border bg-[var(--surface-2)]">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center gap-3 p-3">
                  <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">{session.deviceName}{session.current && <Badge variant="outline">Current</Badge>}</div>
                    <p className="text-xs text-muted-foreground">Expires {new Date(session.expiresAt).toLocaleString()}</p>
                  </div>
                  <Button aria-label={`Revoke ${session.deviceName}`} size="icon" variant="ghost" onClick={() => revoke(session.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Recent access receipts</h3>
            <div className="divide-y divide-border rounded-lg border bg-[var(--surface-2)]">
              {events.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-4 p-3 text-xs">
                  <span className="font-mono">{event.reasonCode}</span>
                  <time className="text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</time>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
