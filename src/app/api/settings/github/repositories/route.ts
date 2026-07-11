import { NextResponse } from "next/server";
import {
  GitHubConnectionError,
  listGitHubRepositories,
} from "@/lib/publishers/github-connection";

export async function GET() {
  try {
    return NextResponse.json(await listGitHubRepositories());
  } catch (error) {
    if (error instanceof GitHubConnectionError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[settings/github/repositories] error:", error);
    return NextResponse.json({ error: "GitHub repositories could not be loaded" }, { status: 500 });
  }
}
