import { NextRequest, NextResponse } from "next/server";
import {
  getSampleDataSummary,
  removeUntouchedSampleData,
} from "@/lib/packs/sample-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(await getSampleDataSummary(id));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return NextResponse.json(await removeUntouchedSampleData(id));
  } catch (error) {
    console.error("[sample-data] removal failed", error);
    return NextResponse.json(
      {
        error:
          "Relay could not remove the untouched samples. Nothing edited or customer-created was removed. Try again.",
      },
      { status: 500 }
    );
  }
}
