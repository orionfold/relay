import { NextResponse } from "next/server";
import { loadCustomerOrientation } from "@/lib/onboarding/load-orientation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(loadCustomerOrientation());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[onboarding/orientation] read failed:", message);
    return NextResponse.json(
      {
        code: "CUSTOMER_ORIENTATION_READ_FAILED",
        error: "Relay could not assemble the current onboarding state.",
      },
      { status: 500 },
    );
  }
}
