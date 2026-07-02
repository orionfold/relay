import { NextResponse } from "next/server";
import { removeLicense, LicenseStoreError } from "@/lib/licensing/store";

/**
 * Remove a persisted license. Installed packs are untouched — D4: removing
 * (or losing) a license never re-locks content, it only gates FUTURE premium
 * installs. The UI shows that promise next to this action.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const removed = removeLicense(id);
    if (!removed) {
      return NextResponse.json(
        { error: `No stored license with id "${id}".`, code: "not_found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ removed: true });
  } catch (err) {
    if (err instanceof LicenseStoreError) {
      return NextResponse.json(
        { error: err.message, code: "store_error" },
        { status: 500 }
      );
    }
    throw err;
  }
}
