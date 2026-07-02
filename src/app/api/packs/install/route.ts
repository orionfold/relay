import { NextResponse } from "next/server";
import { z } from "zod";
import { findPackTemplate } from "@/lib/packs/catalog";
import { installPack } from "@/lib/packs/install";
import { PackValidationError } from "@/lib/packs/format";
import { PackLicenseError } from "@/lib/licensing/gate";

/**
 * Install a BUNDLED pack from the /packs gallery. The body carries a bundled
 * template id only — never a filesystem path or git URL. A `--hostname
 * 0.0.0.0` instance is reachable across the LAN, and an endpoint that
 * accepted arbitrary sources would let any client on that network make the
 * server clone and install an attacker-supplied repo. The CLI keeps the
 * path/git surface; the browser gets the curated catalog.
 *
 * Premium packs rely on the persisted license store (D2) — there is no
 * license-proof parameter here. A 402 `license_required` is the UI's cue to
 * show the Get-license CTA / Settings → License activation.
 */

const BodySchema = z.object({
  id: z.string().min(1),
});

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
        error: parsed.error.issues.map((i) => i.message).join("; "),
        code: "validation_failed",
      },
      { status: 400 }
    );
  }

  const template = findPackTemplate(parsed.data.id);
  if (!template) {
    return NextResponse.json(
      {
        error: `No bundled pack named "${parsed.data.id}".`,
        code: "not_found",
      },
      { status: 404 }
    );
  }

  try {
    const report = await installPack(template.dir);
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof PackLicenseError) {
      return NextResponse.json(
        { error: err.message, code: "license_required" },
        { status: 402 }
      );
    }
    if (err instanceof PackValidationError) {
      return NextResponse.json(
        { error: err.message, code: "pack_invalid" },
        { status: 422 }
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        code: "install_failed",
      },
      { status: 500 }
    );
  }
}
