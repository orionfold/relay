import { existsSync } from "node:fs";
import { listApps } from "@/lib/apps/registry";
import { findPackTemplate } from "@/lib/packs/catalog";
import { listLicenses, type StoredLicenseInfo } from "@/lib/licensing/store";
import { HostDeploymentService } from "@/lib/host/deployment/service";
import { relayHostRoot } from "@/lib/host/supervisor/registry";
import { RELAY_HOST_ENTITLEMENT } from "@/lib/licensing/host-entitlement";
import {
  resolveCustomerOrientation,
  type CustomerOrientation,
  type OrientationHostInput,
} from "./orientation";

export interface OrientationLoadOptions {
  now?: Date;
  hostDetail?: "full" | "entitlement_only";
  installedPacksReadError?: string;
  loadLicenses?: () => StoredLicenseInfo[];
  loadInstalledPackIds?: () => string[];
  isAgencyBundled?: () => boolean;
  loadHost?: () => OrientationHostInput;
}

function hostEntitlementOnly(
  licenses: StoredLicenseInfo[],
): OrientationHostInput {
  const hostLicenses = licenses.filter((license) =>
    license.entitlements.includes(RELAY_HOST_ENTITLEMENT),
  );
  if (hostLicenses.some((license) => license.valid)) {
    return { licenseStatus: "active" };
  }
  if (
    hostLicenses.some((license) =>
      /^License expired\b/i.test(license.reason ?? ""),
    )
  ) {
    return { licenseStatus: "lapsed" };
  }
  if (hostLicenses.length > 0) {
    return { licenseStatus: "invalid" };
  }
  return { licenseStatus: "missing" };
}

function defaultHostInput(): OrientationHostInput {
  const view = new HostDeploymentService().view();
  return {
    licenseStatus: view.license.status,
    licenseDetail: view.license.detail,
    managedCellsLimit: view.license.managedCellsLimit,
    journeyStage: view.journey.stage,
    hostActualState: view.host?.actualState ?? null,
  };
}

export function loadCustomerOrientation(
  options: OrientationLoadOptions = {},
): CustomerOrientation {
  let licenses: StoredLicenseInfo[] = [];
  let licenseReadError: string | undefined;
  try {
    licenses = (options.loadLicenses ?? listLicenses)();
  } catch (error) {
    licenseReadError =
      error instanceof Error ? error.message : String(error);
  }

  let installedPackIds: string[] = [];
  let packReadError = options.installedPacksReadError;
  try {
    if (!packReadError) {
      installedPackIds = (
        options.loadInstalledPackIds ?? (() => listApps().map((app) => app.id))
      )();
    }
  } catch (error) {
    packReadError = error instanceof Error ? error.message : String(error);
    console.error("[onboarding/orientation] installed Pack read failed:", packReadError);
  }

  let agencyBundled = false;
  try {
    agencyBundled = (
      options.isAgencyBundled ?? (() => Boolean(findPackTemplate("relay-agency")))
    )();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    packReadError ??= `Bundled Pack catalog: ${message}`;
    console.error(
      "[onboarding/orientation] bundled Agency read failed:",
      message,
    );
  }

  let host: OrientationHostInput;
  try {
    const hasHostEvidence =
      licenses.some((license) =>
        license.entitlements.includes(RELAY_HOST_ENTITLEMENT),
      ) || existsSync(relayHostRoot());
    host = options.loadHost
      ? options.loadHost()
      : options.hostDetail === "entitlement_only"
        ? hostEntitlementOnly(licenses)
      : hasHostEvidence
        ? defaultHostInput()
        : { licenseStatus: "missing" };
  } catch (error) {
    host = {
      readError: error instanceof Error ? error.message : String(error),
    };
  }

  return resolveCustomerOrientation({
    licenses,
    licenseReadError,
    installedPackIds,
    packReadError,
    agencyBundled,
    host,
    now: options.now,
  });
}
