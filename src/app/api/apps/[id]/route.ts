import { NextRequest, NextResponse } from "next/server";
import { getApp, removeInstalledPack } from "@/lib/apps/registry";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = getApp(id);
  if (!app) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  return NextResponse.json(app);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Pack id is required" }, { status: 400 });
  }

  try {
    const result = await removeInstalledPack(id);
    if (!result) {
      return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Pack removal failed:", err);
    return NextResponse.json(
      { error: "Failed to remove pack" },
      { status: 500 }
    );
  }
}
