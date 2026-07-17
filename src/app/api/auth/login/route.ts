import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/lib/host-ingress/store";
import { requestClientHash, requestRateKey, sessionCookieIsSecure } from "@/lib/host-ingress/request";
import { setSessionCookie } from "@/lib/host-ingress/cookies";
import { authErrorResponse, jsonRequest } from "../_shared";

const schema = z.object({
  password: z.string().min(1).max(256),
  deviceName: z.string().trim().min(1).max(80).default("Browser"),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await jsonRequest(request));
    const result = login({
      ...body,
      rateKey: requestRateKey(request),
      clientHash: requestClientHash(request),
    });
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, result.token, result.session.expiresAt, sessionCookieIsSecure());
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
