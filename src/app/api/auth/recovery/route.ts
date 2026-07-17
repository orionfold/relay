import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recover } from "@/lib/host-ingress/store";
import { requestClientHash, requestRateKey, sessionCookieIsSecure } from "@/lib/host-ingress/request";
import { setSessionCookie } from "@/lib/host-ingress/cookies";
import { authErrorResponse, jsonRequest } from "../_shared";

const schema = z.object({
  recoveryCode: z.string().min(12).max(256),
  newPassword: z.string().min(12).max(256),
  deviceName: z.string().trim().min(1).max(80).default("Browser"),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await jsonRequest(request));
    const result = recover({
      ...body,
      rateKey: requestRateKey(request),
      clientHash: requestClientHash(request),
    });
    const response = NextResponse.json({
      ok: true,
      recoveryCodes: result.recoveryCodes,
      message: "The old credential, sessions, and recovery codes are revoked.",
    });
    setSessionCookie(response, result.token, result.session.expiresAt, sessionCookieIsSecure());
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
