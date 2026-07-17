import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthCredentialError, AuthRateLimitError } from "@/lib/host-ingress/store";

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "AUTH_INPUT_INVALID", detail: error.issues[0]?.message }, { status: 400 });
  }
  if (error instanceof AuthRateLimitError) {
    return NextResponse.json({ error: error.code, detail: error.message }, { status: 429 });
  }
  if (error instanceof AuthCredentialError) {
    const status = error.code === "AUTH_ALREADY_CONFIGURED" ? 409 : error.code === "AUTH_JSON_INVALID" ? 400 : 401;
    return NextResponse.json({ error: error.code, detail: error.message }, { status });
  }
  console.error("[host-ingress] authentication exchange failed", error);
  return NextResponse.json({ error: "AUTH_INTERNAL_ERROR" }, { status: 500 });
}

export function jsonRequest(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => {
    throw new AuthCredentialError("AUTH_JSON_INVALID", "Request body must be valid JSON.");
  });
}
