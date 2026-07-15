import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import {
  getOllamaRuntimeConfig,
  normalizeOllamaBaseUrl,
} from "@/lib/agents/runtime/ollama-config";
import {
  applySettingsPatch,
  getSetting,
} from "@/lib/settings/helpers";

const updateSchema = z
  .object({
    baseUrl: z.string().trim().min(1).optional(),
    apiKey: z.string().trim().min(1).optional(),
    clearApiKey: z.boolean().optional(),
    defaultModel: z.string().trim().optional(),
    allowInsecureRemote: z.boolean().optional(),
  })
  .strict()
  .refine((value) => !(value.apiKey && value.clearApiKey), {
    message: "Provide apiKey or clearApiKey, not both",
  });

async function responsePayload() {
  const config = await getOllamaRuntimeConfig();
  return {
    runtimeId: config.runtimeId,
    label: config.label,
    configured: config.configured,
    baseUrl: config.baseUrl,
    defaultModel: config.defaultModel ?? "",
    allowInsecureRemote: config.allowInsecureRemote,
    hasApiKey: Boolean(config.apiKey),
    apiKeySource: config.apiKeySource,
  };
}

/** GET /api/settings/ollama — read redacted Ollama settings. */
export async function GET() {
  try {
    return NextResponse.json(await responsePayload());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

/** PUT /api/settings/ollama — atomically validate, then update settings. */
export async function PUT(req: NextRequest) {
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Ollama settings" },
      { status: 400 }
    );
  }

  const currentAllow =
    (await getSetting(SETTINGS_KEYS.OLLAMA_ALLOW_INSECURE_REMOTE)) === "true";
  const allowInsecureRemote =
    parsed.data.allowInsecureRemote ?? currentAllow;
  const currentBaseUrl =
    (await getSetting(SETTINGS_KEYS.OLLAMA_BASE_URL)) ||
    "http://localhost:11434";

  let normalizedBaseUrl: string;
  try {
    normalizedBaseUrl = normalizeOllamaBaseUrl(
      parsed.data.baseUrl ?? currentBaseUrl,
      allowInsecureRemote
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  try {
    const patch: Record<string, string | null> = {};
    if (parsed.data.baseUrl !== undefined) {
      patch[SETTINGS_KEYS.OLLAMA_BASE_URL] = normalizedBaseUrl;
    }
    if (parsed.data.apiKey !== undefined) {
      patch[SETTINGS_KEYS.OLLAMA_API_KEY] = parsed.data.apiKey;
    } else if (parsed.data.clearApiKey) {
      patch[SETTINGS_KEYS.OLLAMA_API_KEY] = null;
    }
    if (parsed.data.defaultModel !== undefined) {
      patch[SETTINGS_KEYS.OLLAMA_DEFAULT_MODEL] = parsed.data.defaultModel || null;
    }
    if (parsed.data.allowInsecureRemote !== undefined) {
      patch[SETTINGS_KEYS.OLLAMA_ALLOW_INSECURE_REMOTE] = String(
        parsed.data.allowInsecureRemote
      );
    }
    await applySettingsPatch(patch);
    const { invalidateModelDiscoveryCache } = await import(
      "@/lib/chat/model-discovery"
    );
    invalidateModelDiscoveryCache();
    const { clearRuntimeRoutingStatusCache } = await import(
      "@/lib/settings/runtime-routing-status"
    );
    clearRuntimeRoutingStatusCache();
    return NextResponse.json({ ok: true, ...(await responsePayload()) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Failed to save Ollama settings: ${error.message}`
            : "Failed to save Ollama settings",
      },
      { status: 500 }
    );
  }
}

/** Legacy compatibility for existing clients. */
export const POST = PUT;
