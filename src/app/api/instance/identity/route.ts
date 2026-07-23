import { NextResponse } from "next/server";
import { valid as semverValid } from "semver";
import { relayCoreVersion } from "@/lib/packs/install";
import { getLicensedIdentity } from "@/lib/licensing/store";
import {
  getRuntimeRoutingStatuses,
  pickReadyRuntime,
} from "@/lib/settings/runtime-routing-status";
import { loadCustomerOrientation } from "@/lib/onboarding/load-orientation";
import type { CustomerOrientation } from "@/lib/onboarding/orientation";

/**
 * GET /api/instance/identity
 *
 * The consolidated instance-identity read for the top-chrome bar cluster and
 * the rail RUNTIME cell. One poll, one loading state, three fields:
 *
 *   - version:    the running relay-core version ("0.28.0"), or null.
 *   - activeModel: the concrete model the active runtime would run ("claude-opus-4-8"),
 *                  or null when nothing resolves.
 *   - licenseTag: a discriminated union — { kind:"licensed", label } or { kind:"community" }.
 *
 * Two shadow-path rules (Engineering Principle #3 — data flows have shadow paths):
 *
 *   1. `version` is null, NEVER "0.0.0". `relayCoreVersion()` falls back to
 *      "0.0.0" when the build-time `__RELAY_CORE_VERSION__` global is missing or
 *      malformed (the Next 16 `defineServer` raw-string gotcha). We surface that
 *      fallback as `null` so the bar renders NOTHING rather than a wrong version.
 *      Absent > wrong.
 *   2. `licenseTag` is a discriminated union, never a nullable string, so a
 *      missing name can never render as a dangling "Licensed to ". The store's
 *      `getLicensedIdentity()` already fails OPEN to community (null); the union
 *      makes that community fallback explicit at the type level.
 *
 * This is a live read of mutable server state (license files, runtime auth,
 * model preference) — never cached.
 */
export const dynamic = "force-dynamic";

export type LicenseTag =
  | { kind: "licensed"; label: string }
  | { kind: "community" };

export interface InstanceIdentityResponse {
  version: string | null;
  activeModel: string | null;
  licenseTag: LicenseTag;
  orientation: CustomerOrientation;
}

export async function GET() {
  try {
    // Version: treat the "0.0.0" build-fallback as absent (rule 1).
    const rawVersion = relayCoreVersion();
    const version =
      semverValid(rawVersion) && rawVersion !== "0.0.0" ? rawVersion : null;

    // License tag: fails open to community (rule 2).
    const label = getLicensedIdentity();
    const licenseTag: LicenseTag = label
      ? { kind: "licensed", label }
      : { kind: "community" };

    // Active model: the concrete model the active runtime would run.
    let activeModel: string | null = null;
    try {
      const active = pickReadyRuntime(await getRuntimeRoutingStatuses());
      activeModel = active?.modelId ?? null;
    } catch {
      // No runtime configured / preference read failed — leave null; the rail
      // falls back to the runtimeLabel so the cell is never blank.
      activeModel = null;
    }

    // The app bar needs entitlement identity, not Host inventory. Avoid opening
    // or chmod-ing the Host root on a read-only chrome poll.
    const orientation = loadCustomerOrientation({
      hostDetail: "entitlement_only",
    });
    const body: InstanceIdentityResponse = {
      version,
      activeModel,
      licenseTag,
      orientation,
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Zero silent failures — surface the fault to server logs, and let the
    // client hook fall into its `status:"error"` branch (cluster renders nothing).
    console.error("[instance/identity] read failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
