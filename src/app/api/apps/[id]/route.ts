import { NextRequest, NextResponse } from "next/server";
import { deleteAppCascade, getApp } from "@/lib/apps/registry";

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
    const result = await deleteAppCascade(id);
    const removedAnything =
      result.filesRemoved ||
      result.projectRemoved ||
      result.profilesRemoved > 0 ||
      result.blueprintsRemoved > 0;
    if (!removedAnything) {
      return NextResponse.json({ error: "Pack not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      filesRemoved: result.filesRemoved,
      projectRemoved: result.projectRemoved,
      profilesRemoved: result.profilesRemoved,
      blueprintsRemoved: result.blueprintsRemoved,
    });
  } catch (err) {
    console.error("Pack delete failed:", err);
    return NextResponse.json(
      { error: "Failed to delete pack" },
      { status: 500 }
    );
  }
}
