import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import { getAinativeAppsDir } from "@/lib/utils/ainative-paths";
import { listPackTemplates } from "@/lib/packs/catalog";
import { packUpdateAvailability } from "@/lib/packs/update";
import { readInstallState } from "@/lib/packs/install-state";

/**
 * Renewal value-recap — the ONE source every renewal surface reads:
 * `license status`, the 402 update refusal, the /packs update card, and the
 * canonical copy relayed for the Website renewal email. Reuses
 * `packUpdateAvailability` for the version comparison (D7: never a second
 * comparison source) and the pack.yaml `changelog` map for the words.
 *
 * Everything here is FAIL-OPEN (cli-startup-robustness rule): a corrupt
 * sidecar, a missing template, or a changelog-less pack degrades to silence —
 * a recap must never crash or block `license status`.
 *
 * Consumers dynamically import this module (TDR-032: keep the CLI's static
 * startup graph free of pack/licensing code).
 */

export interface PendingValue {
  version: string;
  note: string;
}

export interface PackRecap {
  packId: string;
  packName: string;
  /** From the install-state sidecar; null = unknown (pre-0.21 install). */
  installedVersion: string | null;
  /** Sidecar install timestamp, when known. */
  installedAt?: string;
  availableVersion: string | null;
  updateAvailable: boolean;
  /** Changelog line for the version already installed — value received. */
  received?: string;
  /** Changelog lines in (installed, available], ascending — value pending. */
  pending: PendingValue[];
  purchaseUrl?: string;
}

/**
 * Changelog lines in the half-open version window (fromExclusive, toInclusive],
 * ascending. Invalid semver keys are skipped, never thrown on. A null `from`
 * means "everything up to and including `to`".
 */
export function changelogWindow(
  changelog: Record<string, string> | undefined,
  fromExclusive: string | null,
  toInclusive: string | null
): PendingValue[] {
  if (!changelog || !toInclusive || !semver.valid(toInclusive)) return [];
  const from = fromExclusive && semver.valid(fromExclusive) ? fromExclusive : null;
  return Object.entries(changelog)
    .filter(([version]) => semver.valid(version))
    .filter(
      ([version]) =>
        semver.compare(version, toInclusive) <= 0 &&
        (from === null || semver.compare(version, from) > 0)
    )
    .sort(([a], [b]) => semver.compare(a, b))
    .map(([version, note]) => ({ version, note }));
}

/**
 * Recaps for every INSTALLED bundled pack whose entitlement is covered by
 * `entitlements`. Uninstalled entitled packs are deliberately absent — that
 * is install-nudge territory (D6), not renewal recap.
 */
export function entitledPackRecaps(
  entitlements: string[],
  opts: { appsDir?: string; templatesDir?: string } = {}
): PackRecap[] {
  try {
    const appsDir = opts.appsDir ?? getAinativeAppsDir();
    const covered = new Set(entitlements);
    const out: PackRecap[] = [];

    for (const tpl of listPackTemplates({ templatesDir: opts.templatesDir })) {
      if (tpl.error || !tpl.meta?.entitlement) continue;
      if (!covered.has(tpl.meta.entitlement)) continue;
      if (!fs.existsSync(path.join(appsDir, tpl.id))) continue;

      const avail = packUpdateAvailability(tpl.id, {
        appsDir,
        templatesDir: opts.templatesDir,
      });
      const state = readInstallState(appsDir, tpl.id);
      const changelog = tpl.meta.changelog;

      out.push({
        packId: tpl.id,
        packName: tpl.meta.name,
        installedVersion: avail.installedVersion,
        ...(state?.installedAt ? { installedAt: state.installedAt } : {}),
        availableVersion: avail.availableVersion,
        updateAvailable: avail.updateAvailable,
        ...(avail.installedVersion && changelog?.[avail.installedVersion]
          ? { received: changelog[avail.installedVersion] }
          : {}),
        pending: avail.updateAvailable
          ? changelogWindow(
              changelog,
              avail.installedVersion,
              avail.availableVersion
            )
          : [],
        ...(tpl.meta.purchaseUrl ? { purchaseUrl: tpl.meta.purchaseUrl } : {}),
      });
    }
    return out;
  } catch {
    // Fail-open: a recap is decoration on the licensing surfaces, never a gate.
    return [];
  }
}
