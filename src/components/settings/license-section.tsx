"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { CustomerOrientation } from "@/lib/onboarding/orientation";
import { INSTANCE_IDENTITY_CHANGED_EVENT } from "@/lib/onboarding/events";

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

function entitlementName(entitlement: string): string {
  if (entitlement === "product:orionfold-relay") return "All premium Packs";
  if (entitlement === "product:relay-host") return "Managed Relay Host";
  return entitlement;
}

function renewalContinuity(entitlements: string[]): string {
  const packs = entitlements.includes("product:orionfold-relay");
  const host = entitlements.includes("product:relay-host");
  if (packs && host) {
    return "Installed Packs and existing managed Cells stay available; renewing keeps premium installs, updates, and managed-Cell expansion open.";
  }
  if (host) {
    return "Existing managed Cells stay available; renewing keeps managed-Cell expansion open.";
  }
  return "Installed Packs stay available; renewing keeps premium installs and updates open.";
}

export function LicenseSection({
  orientation,
}: {
  orientation?: CustomerOrientation;
}) {
  const router = useRouter();
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
      router.refresh();
      window.dispatchEvent(new Event(INSTANCE_IDENTITY_CHANGED_EVENT));
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
        description: "Installed Packs and existing managed Cells stay in place.",
      });
      setCeremony(null);
      await fetchLicenses();
      router.refresh();
      window.dispatchEvent(new Event(INSTANCE_IDENTITY_CHANGED_EVENT));
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
          See what this Relay can use now, who it is licensed to, and what
          remains available if a term ends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {orientation && (
          <section
            className="surface-card-muted rounded-lg border p-4"
            aria-labelledby="current-relay-access-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="current-relay-access-heading" className="text-sm font-semibold">
                  Current access
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {orientation.license.detail}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    orientation.license.lifecycle === "active" ||
                    orientation.license.lifecycle === "expiring"
                      ? "success"
                      : orientation.license.lifecycle === "invalid" ||
                          orientation.license.lifecycle === "read_error"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {orientation.entitlementLabel}
                </Badge>
                {orientation.license.licensee && (
                  <Badge variant="outline">
                    Licensed to {orientation.license.licensee}
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant={orientation.entitlements.packs ? "success" : "outline"}>
                Premium Packs {orientation.entitlements.packs ? "unlocked" : "not unlocked"}
              </Badge>
              <Badge variant={orientation.entitlements.host ? "success" : "outline"}>
                Managed Host {orientation.entitlements.host ? "unlocked" : "optional"}
              </Badge>
            </div>
          </section>
        )}

        {ceremony && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold">
                License activated for {identityLabel(ceremony.issuedTo)}
              </span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>
                Unlocked:{" "}
                {ceremony.entitlements.length
                  ? ceremony.entitlements.map(entitlementName).join(", ")
                  : "(no entitlements listed)"}
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
          orientation ? null : (
            <p className="text-sm text-muted-foreground">
              Community Edition is active. You can use core Relay and install
              free Packs without a license. The{" "}
              <Link href="/packs" className="font-medium text-foreground hover:text-primary underline underline-offset-2">
                Packs
              </Link>{" "}
              page also shows what the one premium-Packs license unlocks.
            </p>
          )
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
                    <Badge key={e} variant="outline" className="text-[10px]">
                      {entitlementName(e)}
                    </Badge>
                  ))}
                  {typeof l.seats === "number" && (
                    <Badge variant="outline" className="text-[10px]">
                      {l.seats} seat{l.seats === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {l.valid ? "Active" : "Needs attention"}
                  {l.expiresAt ? ` · term ends ${formatDate(l.expiresAt)}` : ""}
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
                      {daysUntil(l.expiresAt) === 1 ? "" : "s"} —{" "}
                      {renewalContinuity(l.entitlements)}
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

        <details className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
          <summary className="font-medium text-foreground">
            Technical and trust details
          </summary>
          <div className="mt-3 space-y-2 leading-relaxed">
            <p>
              Relay verifies signed license files offline on this machine. The
              CLI banner, <code className="font-mono">relay license status</code>,
              and this page use the same local store.
            </p>
            <p>
              Removing a license does not remove installed Packs or stop
              existing managed Cells. It prevents new premium installs,
              updates, and managed-Cell expansion until a current license is
              activated.
            </p>
            {licenses?.map((license) => (
              <p key={license.licenseId} className="break-all font-mono text-[11px]">
                {license.licenseId} · {license.filePath}
              </p>
            ))}
          </div>
        </details>
      </CardContent>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Remove license ${removing?.licenseId ?? ""}?`}
        description="Installed Packs and existing managed Cells stay in place. Removing a current license prevents new premium installs, updates, and managed-Cell expansion until you activate a current license again."
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
