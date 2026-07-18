import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  inspectHostLicense,
  selectEffectiveHostLicense,
  type HostLicenseInspection,
  type HostLicenseInspectionOk,
} from "@/lib/licensing/host-entitlement";
import type { SignedLicense } from "@/lib/licensing/verify";
import { RelayHostError } from "./errors";

export function inspectStoredHostLicenses(input: {
  licenseDir: string;
  now?: Date;
  expectedLicenseeRef?: string;
}): HostLicenseInspection[] {
  if (!existsSync(input.licenseDir)) return [];
  const inspections: HostLicenseInspection[] = [];
  for (const name of readdirSync(input.licenseDir).sort()) {
    if (!name.endsWith(".license.json")) continue;
    let envelope: SignedLicense;
    try {
      envelope = JSON.parse(readFileSync(join(input.licenseDir, name), "utf8")) as SignedLicense;
    } catch {
      inspections.push({
        ok: false,
        code: "HOST_GRANT_INVALID",
        detail: `Stored Host license ${name} is not valid JSON.`,
      });
      continue;
    }
    inspections.push(
      inspectHostLicense(envelope, {
        now: input.now,
        expectedLicenseeRef: input.expectedLicenseeRef,
      }),
    );
  }
  return inspections;
}

export function requireEffectiveHostLicense(input: {
  licenseDir: string;
  now?: Date;
  expectedLicenseeRef?: string;
}): HostLicenseInspectionOk {
  const inspections = inspectStoredHostLicenses(input);
  const effective = selectEffectiveHostLicense(
    inspections,
    input.expectedLicenseeRef,
  );
  if (effective) return effective;
  const failure = inspections.find((inspection) => !inspection.ok);
  if (failure && !failure.ok) {
    throw new RelayHostError(failure.code, failure.detail);
  }
  throw new RelayHostError(
    "HOST_LICENSE_REQUIRED",
    "No signed product:relay-host license is available to this Relay Host.",
  );
}
