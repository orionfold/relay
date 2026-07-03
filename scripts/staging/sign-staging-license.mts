/**
 * Deterministic staging-license signer (harness-side, S2 · Mode C).
 *
 * Mints a valid `orionfold.license/v1` envelope signed with the COMMITTED dev
 * key (`of-license-dev-2026-06`) so the staging CLI-run can exercise the real
 * `relay license add` → `pack add` activation ceremony against an isolated data
 * dir, exactly as the hand-authored `naya-license.json` did in the 2026-07-02
 * bundle — but reproducibly, from one command.
 *
 * This is NOT a new signer: it reuses `signEnvelope()` from the licensing
 * test-signer (which trusts the vector's committed dev seed by design — that
 * key never signs a real license, and the verifier trusts it solely so offline
 * flows can prove the verify path). All the crypto + canonicalization lives
 * there; this script only shapes the payload and writes the file.
 *
 * DETERMINISM: timestamps are FIXED (flags default to 2026-07-02 → 2027-07-02),
 * never `new Date()` — so re-running produces a byte-identical license, which
 * keeps the recorded GIF and the D4 proof stable across runs.
 *
 * Run: npx tsx scripts/staging/sign-staging-license.mts --out <path> [flags]
 */
import { writeFileSync } from "node:fs";
import { signEnvelope } from "../../src/lib/licensing/__tests__/sign-helper.ts";

/** Named error so a signer failure is never a silent generic throw (EP #1/#2). */
class StagingLicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StagingLicenseError";
  }
}

interface Options {
  name: string;
  email: string;
  org: string;
  licenseId: string;
  issued: string;
  expires: string;
  out: string | null;
}

const DEFAULTS: Options = {
  org: "Naya Studio",
  name: "Naya Okafor",
  email: "naya@nayastudio.co",
  licenseId: "OF-RELAY-STAGING-NAYA-20260702",
  issued: "2026-07-02T00:00:00Z",
  expires: "2027-07-02T00:00:00Z",
  out: null,
};

function parseArgs(argv: string[]): Options {
  const opts: Options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = (): string => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) {
        throw new StagingLicenseError(`Missing value for ${arg}`);
      }
      i += 1;
      return v;
    };
    switch (arg) {
      case "--name":
        opts.name = take();
        break;
      case "--email":
        opts.email = take();
        break;
      case "--org":
        opts.org = take();
        break;
      case "--id":
        opts.licenseId = take();
        break;
      case "--issued":
        opts.issued = take();
        break;
      case "--expires":
        opts.expires = take();
        break;
      case "--out":
        opts.out = take();
        break;
      default:
        throw new StagingLicenseError(`Unknown flag: ${arg}`);
    }
  }
  return opts;
}

/**
 * The verified v1 payload contract (shape copied from the 2026-07-02
 * verified-good `naya-license.json`). The signature covers the canonical bytes
 * of THIS object only.
 */
function buildPayload(o: Options): Record<string, unknown> {
  return {
    schema: "orionfold.license/v1",
    license_id: o.licenseId,
    product: "orionfold-relay",
    tier: "relay",
    issued_to: { org: o.org, name: o.name, email: o.email },
    issued_at: o.issued,
    not_before: o.issued,
    expires_at: o.expires,
    seats: 1,
    entitlements: ["product:orionfold-relay"],
    provenance: { stripe_purchase_id: "cs_test_staging", stripe_price_id: null },
  };
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const license = signEnvelope(buildPayload(opts));
  const json = `${JSON.stringify(license, null, 2)}\n`;

  if (opts.out) {
    writeFileSync(opts.out, json, "utf8");
    process.stderr.write(
      `Signed staging license → ${opts.out} (id: ${opts.licenseId})\n`
    );
  } else {
    // No --out: emit to stdout so callers can pipe/capture.
    process.stdout.write(json);
  }
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`sign-staging-license failed: ${msg}\n`);
  process.exit(1);
}
