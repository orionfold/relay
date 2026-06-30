import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { dataDir } from "@/lib/config/env";

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  markdown: z.string().min(1),
  conversationId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { title, markdown, conversationId } = parsed.data;
  const id = randomUUID();
  const safeName = title.replace(/[^a-z0-9-_\. ]/gi, "_").slice(0, 80);
  const filename = `${Date.now()}-${safeName}.md`;
  const dir = path.join(dataDir(), "uploads", "chat-exports");
  await mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, filename);
  await writeFile(storagePath, markdown, "utf8");

  const now = new Date();
  await db.insert(documents).values({
    id,
    filename,
    originalName: `${safeName}.md`,
    mimeType: "text/markdown",
    size: Buffer.byteLength(markdown, "utf8"),
    storagePath,
    direction: "output",
    status: "ready",
    source: "chat-export",
    conversationId: conversationId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id, filename }, { status: 201 });
}
