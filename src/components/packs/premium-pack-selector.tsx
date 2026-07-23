"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Package,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  PackDecisionSummary,
  PremiumCatalogOffer,
} from "@/lib/packs/catalog-offer";
import type { LicenseLifecycle } from "@/lib/onboarding/orientation";

const SELECTION_KEY = "relay:premium-pack-selection:v1";

export interface SelectablePremiumPack {
  id: string;
  name: string;
  bundle: string[];
  decision: PackDecisionSummary;
}

interface InstallResult {
  id: string;
  name: string;
  status: "installed" | "failed";
  detail: string;
  licenseRequired: boolean;
}

interface PremiumPackSelectorProps {
  packs: SelectablePremiumPack[];
  visiblePackIds: string[];
  offer: PremiumCatalogOffer | null;
  offerError: string | null;
  packsEntitled: boolean;
  licenseLifecycle: LicenseLifecycle;
}

function readError(body: unknown, status: number): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return `Install failed (HTTP ${status}).`;
}

function purchaseLabel(lifecycle: LicenseLifecycle): string {
  if (lifecycle === "lapsed") return "Renew to install selected";
  return "Get one license for selected Packs";
}

export function PremiumPackSelector({
  packs,
  visiblePackIds,
  offer,
  offerError,
  packsEntitled,
  licenseLifecycle,
}: PremiumPackSelectorProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [persistError, setPersistError] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [installing, setInstalling] = useState(false);
  const [results, setResults] = useState<InstallResult[]>([]);
  const eligibleIds = useMemo(() => new Set(packs.map((pack) => pack.id)), [packs]);
  const eligibleKey = packs.map((pack) => pack.id).join("\u0000");
  const visibleIds = useMemo(() => new Set(visiblePackIds), [visiblePackIds]);
  const visiblePacks = packs.filter((pack) => visibleIds.has(pack.id));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SELECTION_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const restored = Array.isArray(parsed)
        ? parsed.filter(
            (id): id is string =>
              typeof id === "string" && eligibleIds.has(id),
          )
        : [];
      const next = new Set(restored);
      setSelected(next);
      window.localStorage.setItem(SELECTION_KEY, JSON.stringify([...next]));
      setPersistError(null);
    } catch {
      setPersistError(
        "Relay could not restore the saved selection in this browser. Your current choices still work on this page.",
      );
    }
  }, [eligibleIds, eligibleKey]);

  function persist(next: Set<string>) {
    setSelected(next);
    try {
      window.localStorage.setItem(SELECTION_KEY, JSON.stringify([...next]));
      setPersistError(null);
    } catch {
      setPersistError(
        "Relay could not save this selection in the browser. Keep this page open until you finish.",
      );
    }
  }

  function setPackSelected(pack: SelectablePremiumPack, checked: boolean) {
    const next = new Set(selected);
    setResults([]);
    setSelectionNotice("");
    if (!checked) {
      next.delete(pack.id);
      persist(next);
      return;
    }

    next.add(pack.id);
    const removed: string[] = [];
    const selectedContent = new Set([pack.id, ...pack.bundle]);
    for (const candidate of packs) {
      if (
        candidate.id !== pack.id &&
        next.has(candidate.id) &&
        [candidate.id, ...candidate.bundle].some((id) =>
          selectedContent.has(id),
        ) &&
        next.delete(candidate.id)
      ) {
        removed.push(candidate.id);
      }
    }
    if (removed.length > 0) {
      const names = removed.map(
        (id) => packs.find((candidate) => candidate.id === id)?.name ?? id,
      );
      setSelectionNotice(
        `${pack.name} replaces the overlapping selection: ${names.join(", ")}. This avoids installing the same Pack content twice.`,
      );
    }
    persist(next);
  }

  async function installSelected() {
    if (installing || selected.size === 0) return;
    setInstalling(true);
    setResults([]);
    const selectedPacks = packs.filter((pack) => selected.has(pack.id));
    const nextResults: InstallResult[] = [];

    for (const pack of selectedPacks) {
      try {
        const response = await fetch("/api/packs/install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: pack.id }),
        });
        const body = await response.json().catch(() => null);
        if (response.ok) {
          nextResults.push({
            id: pack.id,
            name: pack.name,
            status: "installed",
            detail: "Installed successfully.",
            licenseRequired: false,
          });
        } else {
          const licenseRequired =
            response.status === 402 ||
            (body &&
              typeof body === "object" &&
              "code" in body &&
              body.code === "license_required");
          nextResults.push({
            id: pack.id,
            name: pack.name,
            status: "failed",
            detail: readError(body, response.status),
            licenseRequired,
          });
        }
      } catch (error) {
        nextResults.push({
          id: pack.id,
          name: pack.name,
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
          licenseRequired: false,
        });
      }
    }

    const failed = new Set(
      nextResults
        .filter((result) => result.status === "failed")
        .map((result) => result.id),
    );
    persist(failed);
    setResults(nextResults);
    setInstalling(false);

    const installedCount = nextResults.length - failed.size;
    if (installedCount > 0) {
      toast.success(
        `${installedCount} Pack${installedCount === 1 ? "" : "s"} installed`,
        {
          description:
            failed.size > 0
              ? `${failed.size} selection${failed.size === 1 ? "" : "s"} still need attention.`
              : "Your selection is ready to open from Installed Packs.",
        },
      );
      router.refresh();
    }
  }

  const selectedCount = selected.size;
  const needsLicenseReview =
    licenseLifecycle === "invalid" || licenseLifecycle === "read_error";

  return (
    <section aria-labelledby="premium-packs-offer-heading" className="space-y-4">
      <Card emphasis="featured" tone="pack" watermark={Boxes}>
        <CardContent className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">One Relay license</Badge>
              <Badge variant="outline">
                {offer?.premiumPackCount ?? packs.length} premium Packs
              </Badge>
            </div>
            <h2
              id="premium-packs-offer-heading"
              className="mt-3 text-xl font-semibold tracking-tight"
            >
              Unlock all premium Packs for one reasonable price
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Choose the Packs that fit your work. One Relay product license
              unlocks the entire premium catalog—these are not separate
              purchases. Installed Packs keep working if the term later ends.
            </p>
            <p className="mt-3 text-sm font-medium">
              {selectedCount === 0
                ? "Choose one or more Packs below."
                : `${selectedCount} Pack${selectedCount === 1 ? "" : "s"} selected.`}
            </p>
            {!packsEntitled && selectedCount > 0 && !persistError && (
              <p className="mt-1 text-xs text-muted-foreground">
                Selection saved in this browser. After activating your license,
                return here to install it.
              </p>
            )}
          </div>

          <div className="surface-card-muted flex flex-col justify-between gap-4 rounded-lg border p-4">
            {offer ? (
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">
                    {offer.price.intro ?? offer.price.list}
                  </span>
                  {offer.price.intro && (
                    <span className="text-sm text-muted-foreground line-through">
                      {offer.price.list}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Current founding offer for the complete premium Pack catalog.
                </p>
              </div>
            ) : (
              <div role={offerError ? "alert" : undefined}>
                <p className="text-sm font-medium">Offer unavailable</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {offerError ?? "No premium offer is bundled in this build."}
                </p>
              </div>
            )}

            {packsEntitled ? (
              packs.length === 0 ? (
                <Button disabled>All premium Packs installed</Button>
              ) : (
                <Button
                  onClick={() => void installSelected()}
                  disabled={installing || selectedCount === 0}
                >
                  {installing ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Package aria-hidden="true" />
                  )}
                  {installing ? "Installing selected…" : "Install selected"}
                </Button>
              )
            ) : needsLicenseReview ? (
              <Button asChild variant="outline">
                <Link href="/settings#settings-license">
                  Review license status
                </Link>
              </Button>
            ) : offer && selectedCount > 0 ? (
              <Button asChild>
                <a
                  href={offer.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {purchaseLabel(licenseLifecycle)}
                  <ExternalLink aria-hidden="true" />
                  <span className="sr-only">opens in new tab</span>
                </a>
              </Button>
            ) : offer && packs.length === 0 ? (
              <Button asChild>
                <a
                  href={offer.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {licenseLifecycle === "lapsed"
                    ? "Renew for premium updates"
                    : "Unlock premium Pack updates"}
                  <ExternalLink aria-hidden="true" />
                  <span className="sr-only">opens in new tab</span>
                </a>
              </Button>
            ) : (
              <Button disabled>
                {offer ? "Choose Packs to continue" : "Offer unavailable"}
              </Button>
            )}

            {!packsEntitled && (
              <Link
                href="/settings#settings-license"
                className="text-xs font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                Already have a license? Activate it in Settings
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {persistError && (
        <p
          role="alert"
          className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm"
        >
          {persistError}
        </p>
      )}
      {selectionNotice && (
        <p
          role="status"
          className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
        >
          {selectionNotice}
        </p>
      )}
      {results.length > 0 && (
        <div className="space-y-2">
          <ul aria-label="Pack install results" className="space-y-2">
            {results.map((result) => (
              <li
                key={result.id}
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
              >
                {result.status === "installed" ? (
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-status-success"
                    aria-hidden="true"
                  />
                ) : (
                  <TriangleAlert
                    className="mt-0.5 h-4 w-4 shrink-0 text-status-failed"
                    aria-hidden="true"
                  />
                )}
                <span>
                  <strong>{result.name}:</strong> {result.detail}
                </span>
              </li>
            ))}
          </ul>
          {results.some((result) => result.licenseRequired) && (
            <p className="text-sm text-muted-foreground">
              Relay could not verify premium Pack access.{" "}
              <Link
                href="/settings#settings-license"
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                Review or activate the license
              </Link>
              , then retry the remaining selection.
            </p>
          )}
        </div>
      )}

      {visiblePacks.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visiblePacks.map((pack) => {
            const checked = selected.has(pack.id);
            return (
              <Card
                key={pack.id}
                tone="pack"
                className={
                  checked
                    ? "h-full border-primary/60 transition-colors"
                    : "h-full transition-colors"
                }
              >
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`select-${pack.id}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        setPackSelected(pack, value === true)
                      }
                      aria-label={`Select ${pack.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`select-${pack.id}`}
                        className="font-semibold"
                      >
                        {pack.name}
                      </label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline">Premium</Badge>
                        {pack.bundle.length > 0 && (
                          <Badge variant="secondary">Bundle</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <DecisionField label="Job" value={pack.decision.job} />
                  <DecisionField
                    label="Choose it when"
                    value={pack.decision.chooseWhen}
                  />
                  <DecisionField
                    label="Includes"
                    value={pack.decision.includes}
                  />
                  {pack.decision.worksWith && (
                    <DecisionField
                      label="Works with"
                      value={pack.decision.worksWith}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No uninstalled premium Packs in this filter.
        </p>
      )}
    </section>
  );
}

function DecisionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-foreground/90">
        {value}
      </p>
    </div>
  );
}
