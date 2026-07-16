import { NextResponse } from "next/server";
import { runDeterministicWorkshopFallback } from "@/lib/workshop/fallback";
import { workshopErrorPayload } from "@/lib/workshop/errors";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    return NextResponse.json(
      await runDeterministicWorkshopFallback((await context.params).id)
    );
  } catch (error) {
    return NextResponse.json(workshopErrorPayload(error), { status: 422 });
  }
}
