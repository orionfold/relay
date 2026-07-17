import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { completeBootstrap } from "@/lib/host-ingress/store";
import { requestClientHash, requestRateKey, sessionCookieIsSecure } from "@/lib/host-ingress/request";
import { setSessionCookie } from "@/lib/host-ingress/cookies";
import { authErrorResponse, jsonRequest } from "../_shared";

const schema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(256),
  deviceName: z.string().trim().min(1).max(80).default("Browser"),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await jsonRequest(request));
    const result = completeBootstrap({
      ...body,
      rateKey: requestRateKey(request),
      clientHash: requestClientHash(request),
    });
    const response = NextResponse.json({
      ok: true,
      recoveryCodes: result.recoveryCodes,
      message: "Save these recovery codes now. Relay will not show them again.",
    });
    setSessionCookie(response, result.token, result.session.expiresAt, sessionCookieIsSecure());
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
