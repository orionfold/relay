import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getOpenAICompatibleRuntimeConfig,
  isOpenAICompatibleRuntimeId,
  normalizeCompatibleBaseUrl,
  OPENAI_COMPATIBLE_RUNTIME_DEFINITIONS,
} from "@/lib/agents/runtime/openai-compatible";
import {
  applySettingsPatch,
  deleteSetting,
  getSetting,
} from "@/lib/settings/helpers";

type RouteContext = { params: Promise<{ runtimeId: string }> };

const updateSchema = z
  .object({
    baseUrl: z.string().trim().min(1).optional(),
    apiKey: z.string().optional(),
    clearApiKey: z.boolean().optional(),
    defaultModel: z.string().trim().optional(),
    allowInsecureRemote: z.boolean().optional(),
  })
  .strict()
  .refine((value) => !(value.apiKey?.trim() && value.clearApiKey), {
    message: "Provide apiKey or clearApiKey, not both",
  });

async function resolveRuntime(context: RouteContext) {
  const { runtimeId } = await context.params;
  return isOpenAICompatibleRuntimeId(runtimeId) ? runtimeId : null;
}

function invalidRuntime() {
  return NextResponse.json(
    { error: "runtimeId must be litellm or lmstudio" },
    { status: 404 }
  );
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const runtimeId = await resolveRuntime(context);
  if (!runtimeId) return invalidRuntime();
  try {
    const config = await getOpenAICompatibleRuntimeConfig(runtimeId);
    return NextResponse.json({
      runtimeId,
      label: config.label,
      configured: config.configured,
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel ?? "",
      allowInsecureRemote: config.allowInsecureRemote,
      hasApiKey: Boolean(config.apiKey),
      apiKeySource: config.apiKeySource,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const runtimeId = await resolveRuntime(context);
  if (!runtimeId) return invalidRuntime();
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid settings" },
      { status: 400 }
    );
  }

  const definition = OPENAI_COMPATIBLE_RUNTIME_DEFINITIONS[runtimeId];
  const currentAllow =
    (await getSetting(definition.allowInsecureRemoteSetting)) === "true";
  const allowInsecureRemote =
    parsed.data.allowInsecureRemote ?? currentAllow;
  try {
    const currentBaseUrl =
      process.env[definition.baseUrlEnv]?.trim() ||
      (await getSetting(definition.baseUrlSetting)) ||
      definition.defaultBaseUrl;
    // Validate the effective URL against the proposed security switch before
    // writing any field, including when only the switch itself changed.
    normalizeCompatibleBaseUrl(parsed.data.baseUrl ?? currentBaseUrl, {
      allowInsecureRemote,
      label: definition.label,
    });
    const patch: Record<string, string | null> = {};
    if (parsed.data.baseUrl !== undefined) {
      const baseUrl = normalizeCompatibleBaseUrl(parsed.data.baseUrl, {
        allowInsecureRemote,
        label: definition.label,
      });
      patch[definition.baseUrlSetting] = baseUrl;
    }
    if (parsed.data.apiKey !== undefined) {
      if (parsed.data.apiKey.trim()) {
        patch[definition.apiKeySetting] = parsed.data.apiKey.trim();
      }
    } else if (parsed.data.clearApiKey) {
      patch[definition.apiKeySetting] = null;
    }
    if (parsed.data.defaultModel !== undefined) {
      patch[definition.defaultModelSetting] = parsed.data.defaultModel || null;
    }
    if (parsed.data.allowInsecureRemote !== undefined) {
      patch[definition.allowInsecureRemoteSetting] = String(
        parsed.data.allowInsecureRemote
      );
    }
    await applySettingsPatch(patch);
    const { invalidateModelDiscoveryCache } = await import(
      "@/lib/chat/model-discovery"
    );
    invalidateModelDiscoveryCache();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  const config = await getOpenAICompatibleRuntimeConfig(runtimeId);
  return NextResponse.json({
    ok: true,
    runtimeId,
    configured: config.configured,
    baseUrl: config.baseUrl,
    defaultModel: config.defaultModel ?? "",
    allowInsecureRemote: config.allowInsecureRemote,
    hasApiKey: Boolean(config.apiKey),
    apiKeySource: config.apiKeySource,
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const runtimeId = await resolveRuntime(context);
  if (!runtimeId) return invalidRuntime();
  const definition = OPENAI_COMPATIBLE_RUNTIME_DEFINITIONS[runtimeId];
  await Promise.all([
    deleteSetting(definition.baseUrlSetting),
    deleteSetting(definition.apiKeySetting),
    deleteSetting(definition.defaultModelSetting),
    deleteSetting(definition.allowInsecureRemoteSetting),
  ]);
  const { invalidateModelDiscoveryCache } = await import(
    "@/lib/chat/model-discovery"
  );
  invalidateModelDiscoveryCache();
  return NextResponse.json({ ok: true });
}
