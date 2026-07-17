import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { drillRecoveryBundle } from "@/lib/recovery/orchestrator";
import { configuredBundle, recoveryApiError, recoveryJson } from "../_shared";

const bodySchema = z.object({ bundleFile: z.string().min(1).max(255) });

export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await recoveryJson(request));
    const config = configuredBundle(body.bundleFile);
    const receipt = await drillRecoveryBundle(config);
    return NextResponse.json({ receipt });
  } catch (error) {
    return recoveryApiError(error);
  }
}
