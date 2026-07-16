import { NextResponse } from "next/server";
import {
  getWorkshopRun,
  refreshWorkshopRun,
} from "@/lib/workshop/runs";
import { workshopErrorPayload } from "@/lib/workshop/errors";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    return NextResponse.json(await getWorkshopRun((await context.params).id));
  } catch (error) {
    return NextResponse.json(workshopErrorPayload(error), { status: 404 });
  }
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    return NextResponse.json(await refreshWorkshopRun((await context.params).id));
  } catch (error) {
    return NextResponse.json(workshopErrorPayload(error), { status: 422 });
  }
}
