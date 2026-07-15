import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings/helpers";
import { SETTINGS_KEYS } from "@/lib/constants/settings";

const DEFAULT_BASE_URL = "http://localhost:11434";

async function getBaseUrl(): Promise<string> {
  return (await getSetting(SETTINGS_KEYS.OLLAMA_BASE_URL)) || DEFAULT_BASE_URL;
}

/**
 * GET /api/runtimes/ollama — List available models from Ollama.
 */
export async function GET() {
  try {
    const baseUrl = await getBaseUrl();
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Ollama responded with status ${response.status}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json(
      { error: message, hint: "Make sure Ollama is running (ollama serve)." },
      { status: 502 },
    );
  }
}

/**
 * POST /api/runtimes/ollama — Actions: pull a model.
 * Body: { action: "pull", model: "llama3.2" }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { action, model } = body as Record<string, unknown>;

  if (action !== "pull") {
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  }

  if (!model || typeof model !== "string") {
    return NextResponse.json(
      { error: "model is required" },
      { status: 400 },
    );
  }

  try {
    const baseUrl = await getBaseUrl();
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: false }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `Ollama pull failed (${response.status}): ${errorText}` },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json({ status: "ok", model, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pull failed";
    return NextResponse.json(
      { error: message },
      { status: 502 },
    );
  }
}
