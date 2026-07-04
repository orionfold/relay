import { NextResponse } from "next/server";
import { seedSampleData } from "@/lib/data/seed";
import { isDataOpsAllowed } from "@/lib/data/staging-gate";

export async function POST() {
  if (!isDataOpsAllowed()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Sample data seeding is a staging-only tool and is disabled on this build.",
      },
      { status: 403 }
    );
  }

  try {
    const seeded = await seedSampleData();
    return NextResponse.json({ success: true, seeded });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[seed] failed:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
