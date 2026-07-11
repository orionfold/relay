import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import * as tar from "tar";
import { z } from "zod";
import {
  AppPackExportError,
  exportAppPackToDirectory,
} from "@/lib/packs/app-exporter";

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
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "relay-pack-export-"));
  const packDir = path.join(work, id);
  const archive = path.join(work, `${id}.tgz`);
  try {
    await exportAppPackToDirectory(id, { ...parsed.data, outputDir: packDir });
    await tar.create(
      { gzip: true, file: archive, cwd: packDir, portable: true },
      ["pack.yaml", "base"]
    );
    const bytes = fs.readFileSync(archive);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${id}.tgz"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppPackExportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "APP_NOT_FOUND" ? 404 : 400 }
      );
    }
    console.error("[apps/pack/export] route error:", error);
    return NextResponse.json({ error: "Pack export failed" }, { status: 500 });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
