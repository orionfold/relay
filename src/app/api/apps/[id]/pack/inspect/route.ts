import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppPackExportError, buildAppPackArtifact } from "@/lib/packs/app-exporter";

const requestSchema = z
  .object({
    includeSampleData: z.boolean().default(false),
    author: z.string().min(1).max(120).optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const artifact = await buildAppPackArtifact(id, parsed.data);
    return NextResponse.json({
      packId: artifact.packId,
      version: artifact.version,
      hash: artifact.hash,
      sampleRowsIncluded: artifact.sampleRowsIncluded,
      files: artifact.files.map((file) => ({
        path: file.path,
        bytes: Buffer.byteLength(file.content),
      })),
    });
  } catch (error) {
    if (error instanceof AppPackExportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "APP_NOT_FOUND" ? 404 : 400 }
      );
    }
    console.error("[apps/pack/inspect] route error:", error);
    return NextResponse.json({ error: "Pack inspection failed" }, { status: 500 });
  }
}
