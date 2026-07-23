import { NextRequest, NextResponse } from "next/server";
import {
  getSampleDataSummary,
  removeUntouchedSampleData,
} from "@/lib/packs/sample-data";
import { revalidateAppRuntime } from "@/lib/apps/app-runtime-cache";

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
  let result: Awaited<ReturnType<typeof removeUntouchedSampleData>>;
  try {
    result = await removeUntouchedSampleData(id);
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

  try {
    await revalidateAppRuntime(id, { throwOnError: true });
  } catch (error) {
    console.error("[sample-data] dashboard refresh failed", error);
    return NextResponse.json(
      {
        error:
          "Sample data was removed, but Relay could not refresh the dashboard. Reload this page to see the current data.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(result);
}
