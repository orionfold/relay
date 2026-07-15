import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchOllama,
  getOllamaRuntimeConfig,
} from "@/lib/agents/runtime/ollama-config";
import {
  readBoundedProviderError,
} from "@/lib/agents/runtime/provider-endpoint";
import type { ProviderModelDetails } from "@/lib/agents/runtime/provider-models";

const pullSchema = z
  .object({
    action: z.literal("pull"),
    model: z.string().trim().min(1),
  })
  .strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** GET /api/runtimes/ollama — test and discover normalized model details. */
export async function GET() {
  try {
    const config = await getOllamaRuntimeConfig();
    const response = await fetchOllama(config, "/api/tags", {}, 5_000);
    if (!response.ok) {
      return NextResponse.json(
        {
          phase: "connection",
          error: `Ollama request failed (${response.status}): ${await readBoundedProviderError(response, 500, [config.apiKey])}`,
        },
        { status: 502 }
      );
    }
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.models)) {
      return NextResponse.json(
        { phase: "discovery", error: "Ollama returned invalid model discovery data" },
        { status: 502 }
      );
    }
    const models = payload.models.flatMap((entry): ProviderModelDetails[] => {
      if (!isRecord(entry)) return [];
      const id = text(entry.model) ?? text(entry.name);
      if (!id) return [];
      const details = isRecord(entry.details) ? entry.details : {};
      return [
        {
          id,
          name: text(entry.name) ?? id,
          provider: "ollama",
          family: text(details.family),
          format: text(details.format),
          parameterSize: text(details.parameter_size),
          quantization: text(details.quantization_level),
          sizeBytes: number(entry.size),
          modifiedAt: text(entry.modified_at),
        },
      ];
    });
    return NextResponse.json({ runtimeId: "ollama", models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json(
      {
        phase: "connection",
        error: message,
        hint: "Make sure the configured Ollama server is reachable from Relay.",
      },
      { status: 502 }
    );
  }
}

/** POST /api/runtimes/ollama — pull one model through the configured server. */
export async function POST(req: NextRequest) {
  const parsed = pullSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        phase: "acquisition",
        error: parsed.error.issues[0]?.message ?? "Invalid pull request",
      },
      { status: 400 }
    );
  }

  try {
    const config = await getOllamaRuntimeConfig();
    const response = await fetchOllama(
      config,
      "/api/pull",
      {
        method: "POST",
        body: JSON.stringify({ model: parsed.data.model, stream: false }),
      },
      300_000
    );
    if (!response.ok) {
      return NextResponse.json(
        {
          phase: "acquisition",
          error: `Ollama pull failed (${response.status}): ${await readBoundedProviderError(response, 500, [config.apiKey])}`,
        },
        { status: 502 }
      );
    }
    const payload = await response.json().catch(() => ({}));
    const { invalidateModelDiscoveryCache } = await import(
      "@/lib/chat/model-discovery"
    );
    invalidateModelDiscoveryCache();
    return NextResponse.json({
      runtimeId: "ollama",
      action: "pull",
      model: parsed.data.model,
      status: "completed",
      ...(isRecord(payload) ? payload : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        phase: "acquisition",
        error: error instanceof Error ? error.message : "Ollama pull failed",
      },
      { status: 502 }
    );
  }
}
