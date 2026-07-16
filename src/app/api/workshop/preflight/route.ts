import { NextResponse } from "next/server";
import { getWorkshopPreflight } from "@/lib/workshop/preflight";
import { workshopErrorPayload } from "@/lib/workshop/errors";

export async function GET() {
  try {
    return NextResponse.json(await getWorkshopPreflight());
  } catch (error) {
    return NextResponse.json(workshopErrorPayload(error), { status: 500 });
  }
}
