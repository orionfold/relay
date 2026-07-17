import { NextResponse } from "next/server";
import { createRecoveryBundle, recoveryStatus } from "@/lib/recovery/orchestrator";
import { configuredRecovery, recoveryApiError } from "./_shared";

export function GET() {
  try {
    return NextResponse.json(recoveryStatus(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return recoveryApiError(error);
  }
}

export async function POST() {
  try {
    const config = configuredRecovery();
    const result = await createRecoveryBundle(config);
    return NextResponse.json({ receipt: result.receipt }, { status: 201 });
  } catch (error) {
    return recoveryApiError(error);
  }
}
