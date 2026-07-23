import { NextResponse } from "next/server";
import { getBlueprintReadiness } from "@/lib/workflows/blueprints/readiness";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const readiness = await getBlueprintReadiness(id);
  return NextResponse.json(readiness, {
    status:
      !readiness.ready && readiness.code === "blueprint_not_found" ? 404 : 200,
  });
}
