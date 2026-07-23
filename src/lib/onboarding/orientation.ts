import type { StoredLicenseInfo } from "@/lib/licensing/store";
import {
  RELAY_HOST_ENTITLEMENT,
  RELAY_PACKS_ENTITLEMENT,
} from "@/lib/licensing/host-entitlement";

export type LicenseLifecycle =
  | "none"
  | "invalid"
  | "active"
  | "expiring"
  | "lapsed"
  | "read_error";

export type HostOrientationState =
  | "preview"
  | "entitled"
  | "configuring"
  | "ready"
  | "degraded"
  | "lapsed"
  | "invalid";

export type OrientationAction =
  | {
      kind: "link";
      label: string;
      href: string;
    }
  | {
      kind: "install_pack";
      label: string;
      packId: string;
      packName: string;
    };

export interface CustomerOrientation {
  edition: "community" | "licensed";
  license: {
    lifecycle: LicenseLifecycle;
    licensee: string | null;
    detail: string;
    expiresAt: string | null;
  };
  entitlements: {
    packs: boolean;
    host: boolean;
  };
  packs: {
    premium: "locked" | "unlocked" | "continuity";
    agency: "unavailable" | "available" | "installed";
    readError: string | null;
  };
  host: {
    state: HostOrientationState;
    managedCellsLimit: number | null;
    detail: string;
  };
  headline: string;
  description: string;
  entitlementLabel: string;
  primaryAction: OrientationAction;
  secondaryActions: OrientationAction[];
}

export interface OrientationHostInput {
  readError?: string;
  licenseStatus?: "active" | "lapsed" | "missing" | "invalid";
  licenseDetail?: string;
  managedCellsLimit?: number | null;
  journeyStage?:
    | "configure"
    | "estimated"
    | "preflight_passed"
    | "authorized"
    | "installed"
    | "ready"
    | "failed";
  hostActualState?: string | null;
}

export interface ResolveCustomerOrientationInput {
  licenses: StoredLicenseInfo[];
  licenseReadError?: string;
  installedPackIds: string[];
  packReadError?: string;
  agencyBundled: boolean;
  host: OrientationHostInput;
  now?: Date;
}

const AGENCY_ID = "relay-agency";

function licenseeLabel(
  who: StoredLicenseInfo["issuedTo"],
): string | null {
  return who.org ?? who.name ?? who.email ?? null;
}

function newest(
  licenses: StoredLicenseInfo[],
): StoredLicenseInfo | null {
  return [...licenses].sort((left, right) =>
    (right.issuedAt ?? "").localeCompare(left.issuedAt ?? ""),
  )[0] ?? null;
}

function isExpiring(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const remaining = new Date(iso).getTime() - now.getTime();
  return Number.isFinite(remaining) && remaining >= 0 && remaining <= 30 * 86_400_000;
}

function resolveLicense(
  licenses: StoredLicenseInfo[],
  readError: string | undefined,
  now: Date,
): CustomerOrientation["license"] {
  if (readError) {
    return {
      lifecycle: "read_error",
      licensee: null,
      detail: `Relay could not read the license store: ${readError}`,
      expiresAt: null,
    };
  }
  if (licenses.length === 0) {
    return {
      lifecycle: "none",
      licensee: null,
      detail: "Community Edition is active. Core Relay and free Packs remain available.",
      expiresAt: null,
    };
  }

  const valid = licenses.filter((license) => license.valid);
  const current = newest(valid);
  if (current) {
    const lifecycle = isExpiring(current.expiresAt, now) ? "expiring" : "active";
    return {
      lifecycle,
      licensee: licenseeLabel(current.issuedTo),
      detail:
        lifecycle === "expiring"
          ? "Your license is active and nearing renewal. Installed Packs keep working if the term lapses."
          : "Your license is active on this Relay.",
      expiresAt: current.expiresAt ?? null,
    };
  }

  // `listLicenses` only emits this reason after signature verification and the
  // trusted term check. Never infer lapse from an unverified payload date.
  const lapsedLicenses = licenses.filter((license) =>
    /^License expired\b/i.test(license.reason ?? ""),
  );
  const lapsed = lapsedLicenses.length > 0;
  const latestLapsed = newest(lapsedLicenses);
  const latestInvalid = newest(licenses);
  return {
    lifecycle: lapsed ? "lapsed" : "invalid",
    // The payload identity is trusted only when signature verification reached
    // the term check. An invalid signature must never become UI identity.
    licensee: latestLapsed ? licenseeLabel(latestLapsed.issuedTo) : null,
    detail: lapsed
      ? "The license term has ended. Installed Packs and existing managed Cells remain available; new premium installs, updates, and managed-Cell expansion require renewal."
      : `Relay found a license it cannot verify${latestInvalid?.reason ? `: ${latestInvalid.reason}` : "."}`,
    expiresAt: latestLapsed?.expiresAt ?? null,
  };
}

function resolveHostState(
  host: OrientationHostInput,
): CustomerOrientation["host"] {
  if (host.readError) {
    return {
      state: "degraded",
      managedCellsLimit: null,
      detail: `Relay could not read managed Host state: ${host.readError}`,
    };
  }
  if (host.licenseStatus === "lapsed") {
    return {
      state: "lapsed",
      managedCellsLimit: host.managedCellsLimit ?? null,
      detail:
        host.licenseDetail ??
        "Existing Cells and recovery remain available; creating more managed Cells requires renewal.",
    };
  }
  if (host.licenseStatus === "invalid") {
    return {
      state: "invalid",
      managedCellsLimit: null,
      detail: host.licenseDetail ?? "Relay found a Host license it cannot verify.",
    };
  }
  if (host.licenseStatus !== "active" && host.hostActualState) {
    return {
      state: "degraded",
      managedCellsLimit: host.managedCellsLimit ?? null,
      detail:
        "A managed Host exists, but Relay cannot verify current Host authority. Existing data is not removed; restore or renew the Host license before expansion.",
    };
  }
  if (host.licenseStatus !== "active") {
    return {
      state: "preview",
      managedCellsLimit: null,
      detail:
        "Managed Host is optional. Preview how customer-isolated Relay Cells work, or keep using this Relay directly for free.",
    };
  }
  if (host.hostActualState === "ready" || host.journeyStage === "ready") {
    return {
      state: "ready",
      managedCellsLimit: host.managedCellsLimit ?? null,
      detail: "Managed Host is ready for customer Cells.",
    };
  }
  if (
    host.journeyStage &&
    !["configure", "failed"].includes(host.journeyStage)
  ) {
    return {
      state: "configuring",
      managedCellsLimit: host.managedCellsLimit ?? null,
      detail: "Managed Host setup is in progress.",
    };
  }
  if (host.journeyStage === "failed" || host.hostActualState === "degraded") {
    return {
      state: "degraded",
      managedCellsLimit: host.managedCellsLimit ?? null,
      detail: "Managed Host needs attention. Existing Cells are not stopped automatically.",
    };
  }
  return {
    state: "entitled",
    managedCellsLimit: host.managedCellsLimit ?? null,
    detail: "Managed Host is unlocked and ready to configure when you need customer Cells.",
  };
}

function link(label: string, href: string): OrientationAction {
  return { kind: "link", label, href };
}

function agencyInstall(): OrientationAction {
  return {
    kind: "install_pack",
    label: "Install free Relay Agency",
    packId: AGENCY_ID,
    packName: "Relay Agency",
  };
}

export function resolveCustomerOrientation(
  input: ResolveCustomerOrientationInput,
): CustomerOrientation {
  const now = input.now ?? new Date();
  const license = resolveLicense(input.licenses, input.licenseReadError, now);
  const activeLicenses = input.licenses.filter((item) => item.valid);
  const activeEntitlements = new Set(
    activeLicenses.flatMap((item) => item.entitlements),
  );
  const packsEntitled = activeEntitlements.has(RELAY_PACKS_ENTITLEMENT);
  const hostEntitled =
    input.host.licenseStatus === "active" &&
    activeEntitlements.has(RELAY_HOST_ENTITLEMENT);
  const hadPacksEntitlement = input.licenses.some((item) =>
    item.entitlements.includes(RELAY_PACKS_ENTITLEMENT),
  );
  const host = resolveHostState(input.host);
  const agencyInstalled =
    !input.packReadError && input.installedPackIds.includes(AGENCY_ID);
  const agency = input.packReadError
    ? "unavailable"
    : agencyInstalled
    ? "installed"
    : input.agencyBundled
      ? "available"
      : "unavailable";
  const edition = activeLicenses.length > 0 ? "licensed" : "community";
  const premium =
    packsEntitled
      ? "unlocked"
      : license.lifecycle === "lapsed" && hadPacksEntitlement
        ? "continuity"
        : "locked";

  let headline: string;
  let description: string;
  let entitlementLabel: string;
  let primaryAction: OrientationAction;
  const secondaryActions: OrientationAction[] = [];

  if (packsEntitled && hostEntitled) {
    headline = "Your premium Packs and managed Host are unlocked";
    description =
      "Choose the operating Packs you need, then configure managed customer Cells when you are ready.";
    entitlementLabel = "Packs + Host";
    primaryAction = link("Choose Packs to install", "/packs");
    secondaryActions.push(
      link("Configure managed Host", "/settings#settings-host-deployment"),
    );
    if (agency === "available") secondaryActions.push(agencyInstall());
  } else if (packsEntitled) {
    headline = "Your premium Packs are unlocked";
    description =
      "Choose the operating Packs that fit your work. One license covers the premium Pack catalog.";
    entitlementLabel = "Premium Packs";
    primaryAction = link("Choose Packs to install", "/packs");
    if (agency === "available") secondaryActions.push(agencyInstall());
    secondaryActions.push(link("Ask Relay how to get started", "/chat"));
  } else if (hostEntitled) {
    headline = "Your managed Relay Host is unlocked";
    description =
      "Configure customer-isolated Cells when you need them. You can also use this Relay directly.";
    entitlementLabel = "Managed Host";
    primaryAction = link(
      host.state === "ready" ? "Manage customer Cells" : "Configure managed Host",
      "/settings#settings-host-deployment",
    );
    if (agency === "available") secondaryActions.push(agencyInstall());
    secondaryActions.push(link("Ask Relay how Host and Cells work", "/chat"));
  } else if (agency === "installed") {
    headline = "Relay Agency is ready";
    description =
      "Open your client workspace or ask Relay to help you choose the first workflow to run.";
    entitlementLabel = edition === "licensed" ? "Licensed Relay" : "Community Edition";
    primaryAction = link("Open Relay Agency", `/apps/${AGENCY_ID}`);
    secondaryActions.push(link("Ask Relay what to do first", "/chat"));
  } else {
    headline = "Start with a ready-to-run agency workspace";
    description =
      "Relay Agency gives you a client book, intake routing, margin visibility, and runnable workflows. Install it only when you choose.";
    entitlementLabel =
      license.lifecycle === "lapsed"
        ? "License lapsed · Community available"
        : license.lifecycle === "invalid"
          ? "License needs attention"
          : license.lifecycle === "read_error"
            ? "License status unavailable"
            : "Community Edition";
    primaryAction =
      agency === "available"
        ? agencyInstall()
        : link("Browse available Packs", "/packs");
    secondaryActions.push(
      link("Ask Relay what it can do", "/chat"),
      link("Browse Packs", "/packs"),
    );
  }

  return {
    edition,
    license,
    entitlements: {
      packs: packsEntitled,
      host: hostEntitled,
    },
    packs: {
      premium,
      agency,
      readError: input.packReadError ?? null,
    },
    host,
    headline,
    description,
    entitlementLabel,
    primaryAction,
    secondaryActions,
  };
}
