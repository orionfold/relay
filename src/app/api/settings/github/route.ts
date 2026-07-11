import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  connectGitHub,
  disconnectGitHub,
  getGitHubConnectionStatus,
  GitHubConnectionError,
  verifyGitHubConnection,
} from "@/lib/publishers/github-connection";

const connectSchema = z.object({ token: z.string().min(1).max(1000) }).strict();
const verifySchema = z.object({ verify: z.literal(true) }).strict();

function errorResponse(error: unknown) {
  if (error instanceof GitHubConnectionError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  console.error("[settings/github] error:", error);
  return NextResponse.json({ error: "GitHub connection request failed" }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await getGitHubConnectionStatus());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const verifyRequest = verifySchema.safeParse(body);
  if (verifyRequest.success) {
    try {
      return NextResponse.json(await verifyGitHubConnection());
    } catch (error) {
      return errorResponse(error);
    }
  }
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await connectGitHub(parsed.data.token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await disconnectGitHub();
    return NextResponse.json(await getGitHubConnectionStatus());
  } catch (error) {
    return errorResponse(error);
  }
}
