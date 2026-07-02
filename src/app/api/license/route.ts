import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listLicenses,
  saveLicense,
  LicenseStoreError,
} from "@/lib/licensing/store";
import type { SignedLicense } from "@/lib/licensing/verify";

/**
 * Web surface of the license store — the SAME store the CLI banner and
 * `relay license` verb read (D7, one identity model). GET returns re-verified
 * summaries (never the signature — the envelope stays on disk); POST is the
 * paste/upload activation path for UI-first users: the browser reads the
 * fulfilment file client-side and ships the `{ payload, signature }` envelope
 * as JSON. Verification is offline Ed25519 inside saveLicense; nothing here
 * phones home.
 */

const BodySchema = z.object({
  envelope: z
    .object({
      payload: z.unknown(),
      signature: z.unknown(),
    })
    .loose(),
});

export async function GET() {
  try {
    return NextResponse.json({ licenses: listLicenses() });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        code: "store_error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON.", code: "bad_request" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Body must be { envelope: { payload, signature } } — paste the " +
          "license file from your fulfilment email.",
        code: "validation_failed",
      },
      { status: 400 }
    );
  }

  try {
    const info = saveLicense(parsed.data.envelope as SignedLicense);
    return NextResponse.json(info);
  } catch (err) {
    if (err instanceof LicenseStoreError) {
      return NextResponse.json(
        { error: err.message, code: "license_rejected" },
        { status: 422 }
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        code: "store_error",
      },
      { status: 500 }
    );
  }
}
