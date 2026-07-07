import { NextRequest, NextResponse } from "next/server";
import {
  loadPreviewFile,
  PreviewStoreError,
} from "@/lib/publishers/preview-store";

function errorResponse(err: unknown) {
  if (err instanceof PreviewStoreError) {
    const status =
      err.code === "PREVIEW_NOT_FOUND"
        ? 404
        : err.code === "PREVIEW_EXPIRED"
          ? 410
          : err.code === "PREVIEW_HASH_INVALID"
            ? 409
            : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  console.error("[apps/previews] GET error:", err);
  return NextResponse.json({ error: "Failed to load preview" }, { status: 500 });
}

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; artifactId: string; path?: string[] }> }
) {
  const { id, artifactId, path = [] } = await params;
  try {
    const file = await loadPreviewFile(id, artifactId, path);
    const headers = new Headers({
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    if (file.contentType.startsWith("text/html")) {
      headers.set(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self' http: https: data:; style-src 'self' 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      );
    }
    return new Response(new Uint8Array(file.content), { status: 200, headers });
  } catch (err) {
    return errorResponse(err);
  }
}
