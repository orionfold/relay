import type { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "./policy";

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: number,
  secure: boolean,
): void {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAt),
    priority: "high",
  });
}

export function clearSessionCookie(response: NextResponse, secure: boolean): void {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
    priority: "high",
  });
}
