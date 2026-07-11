"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/**
 * Settings → License — the web face of the ONE license store (D7): the same
 * files `relay license status` and the CLI banner read. Activation here is
 * paste/upload (the fulfilment email's file), verified offline server-side.
 * Removing a license never touches installed packs (D4) — the confirm copy
 * says exactly that.
 */

interface StoredLicenseInfo {
  licenseId: string;
  filePath: string;
  valid: boolean;
  reason?: string;
  issuedTo: { email?: string; name?: string; org?: string };
  issuedAt?: string;
  expiresAt?: string;
  seats?: number;
  entitlements: string[];
}

/** Same precedence as the CLI banner: org → name → email. */
function identityLabel(who: StoredLicenseInfo["issuedTo"]): string {
  return who.org ?? who.name ?? who.email ?? "(no identity on license)";
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function formatDate(iso: string): string {
  // License dates are calendar dates stored as midnight-UTC instants
  // (e.g. "2026-07-03T00:00:00Z"). Format in UTC so a customer in a
  // behind-UTC timezone doesn't see the date shift one day earlier than
  // the license file and their purchase email say.
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function LicenseSection() {
  const [licenses, setLicenses] = useState<StoredLicenseInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<StoredLicenseInfo | null>(null);
  const [removing, setRemoving] = useState<StoredLicenseInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchLicenses = useCallback(async () => {
    try {
      const res = await fetch("/api/license");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setLoadError(body?.error ?? `Could not read the license store (HTTP ${res.status}).`);
        return;
      }
      const data = await res.json();
      setLicenses(data.licenses ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    fetchLicenses();
  }, [fetchLicenses]);

  const activate = async (text: string) => {
    setActivateError(null);
    let envelope: unknown;
    try {
      envelope = JSON.parse(text);
    } catch {
      setActivateError(
        "That doesn't parse as JSON. Paste the full contents of the .license.json file from your fulfilment email."
      );
      return;
    }
    setActivating(true);
    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setActivateError(body?.error ?? `Activation failed (HTTP ${res.status}).`);
        return;
      }
      setCeremony(body as StoredLicenseInfo);
      setPasted("");
      await fetchLicenses();
    } catch (err) {
      setActivateError(err instanceof Error ? err.message : String(err));
    } finally {
      setActivating(false);
    }
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    activate(await file.text());
    // Allow re-choosing the same file after an error.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const remove = async (license: StoredLicenseInfo) => {
    try {
      const res = await fetch(
        `/api/license/${encodeURIComponent(license.licenseId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error("Could not remove license", {
          description: body?.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      toast.success(`Removed license ${license.licenseId}`, {
        description: "Installed packs stay installed.",
      });
      setCeremony(null);
      await fetchLicenses();
    } catch (err) {
      toast.error("Could not remove license", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Card id="license" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          License
        </CardTitle>
        <CardDescription>
          Licenses are verified offline and stored on this machine — the CLI
          banner, <code className="font-mono text-xs">relay license status</code>,
          and this page all read the same store. Installed packs are yours
          forever; a license only gates new premium installs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ceremony && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold">
                You&apos;re licensed. Thank you, {identityLabel(ceremony.issuedTo)}.
              </span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                Unlocked:{" "}
                {ceremony.entitlements.length
                  ? ceremony.entitlements.join(", ")
                  : "(no entitlements listed)"}
              </li>
              <li>License ID: {ceremony.licenseId}</li>
              <li>
                Stored at{" "}
                <code className="font-mono">{ceremony.filePath}</code> — keep
                the original file from your email as a backup.
              </li>
            </ul>
          </div>
        )}

        {loadError ? (
          <p className="text-sm text-destructive">
            Could not read the license store: {loadError}
          </p>
        ) : licenses === null ? (
          <p className="text-sm text-muted-foreground">Reading license store…</p>
        ) : licenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No license on this machine — you&apos;re running the free engine
            (Community Edition). Premium packs on the{" "}
            <Link href="/packs" className="font-medium text-foreground hover:text-primary underline underline-offset-2">
              Packs
            </Link>{" "}
            page show what a license unlocks.
          </p>
        ) : (
          <ul className="space-y-3">
            {licenses.map((l) => (
              <li
                key={l.licenseId}
                className="rounded-md border p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {l.valid ? (
                      <ShieldCheck
                        className="h-4 w-4 text-primary shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <TriangleAlert
                        className="h-4 w-4 text-destructive shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-sm font-medium truncate">
                      Licensed to {identityLabel(l.issuedTo)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoving(l)}
                    aria-label={`Remove license ${l.licenseId}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {l.entitlements.map((e) => (
                    <Badge key={e} variant="outline" className="font-mono text-[10px]">
                      {e}
                    </Badge>
                  ))}
                  {typeof l.seats === "number" && (
                    <Badge variant="outline" className="text-[10px]">
                      {l.seats} seat{l.seats === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {l.licenseId}
                  {l.issuedAt ? ` · issued ${formatDate(l.issuedAt)}` : ""}
                  {l.expiresAt ? ` · renews ${formatDate(l.expiresAt)}` : ""}
                </p>
                {!l.valid && l.reason && (
                  <p className="text-xs text-destructive">{l.reason}</p>
                )}
                {l.valid &&
                  l.expiresAt &&
                  daysUntil(l.expiresAt) <= 30 &&
                  daysUntil(l.expiresAt) >= 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Renewal in {daysUntil(l.expiresAt)} day
                      {daysUntil(l.expiresAt) === 1 ? "" : "s"} — installed
                      packs stay yours either way; renewing keeps new premium
                      installs and updates flowing.
                    </p>
                  )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Activate a license</p>
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='Paste the contents of your .license.json file — { "payload": ..., "signature": ... }'
            rows={4}
            className="font-mono text-xs"
            aria-label="License file contents"
          />
          {activateError && (
            <p className="text-xs text-destructive">{activateError}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => activate(pasted)}
              disabled={activating || pasted.trim().length === 0}
            >
              {activating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              )}
              {activating ? "Verifying…" : "Activate"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={activating}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.license.json,application/json"
              className="hidden"
              onChange={(e) => onFileChosen(e.target.files?.[0])}
              aria-label="Upload license file"
            />
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Remove license ${removing?.licenseId ?? ""}?`}
        description="Installed packs stay installed — removing a license only affects future premium installs and updates. You can re-activate any time from your license file."
        confirmLabel="Remove license"
        destructive
        onConfirm={() => {
          if (removing) remove(removing);
          setRemoving(null);
        }}
      />
    </Card>
  );
}
