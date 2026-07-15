import { NextRequest, NextResponse } from "next/server";
import {
  getSetting,
  setSetting,
  getModelPreference,
  setModelPreference,
  type ModelPreference,
} from "@/lib/settings/helpers";
import { DEFAULT_CHAT_MODEL, CHAT_MODELS } from "@/lib/chat/types";

const DEFAULT_MODEL_KEY = "chat.defaultModel";

const MODEL_PREFERENCE_VALUES = ["quality", "cost", "privacy", "balanced"] as const;
type ValidModelPreference = (typeof MODEL_PREFERENCE_VALUES)[number];

function isValidModelPreference(value: unknown): value is ValidModelPreference {
  return (
    typeof value === "string" &&
    (MODEL_PREFERENCE_VALUES as readonly string[]).includes(value)
  );
}

/**
 * GET /api/settings/chat
 * Return chat settings: { defaultModel, modelPreference }.
 *
 * `modelPreference` is the user's stated priority captured at first-launch
 * onboarding (quality | cost | privacy | balanced) or null if never set
 * or skipped. Kept alongside the model id so future onboarding updates can
 * re-resolve sensibly.
 */
export async function GET() {
  const [defaultModelRaw, modelPreference] = await Promise.all([
    getSetting(DEFAULT_MODEL_KEY),
    getModelPreference(),
  ]);
  const defaultModel = defaultModelRaw ?? DEFAULT_CHAT_MODEL;
  return NextResponse.json({
    defaultModel,
    // The bootstrapper distinguishes "never asked" (defaultModel record absent)
    // from "asked and skipped" (record present, preference null). Surface the
    // raw existence as a separate flag so callers don't have to peek at the DB.
    defaultModelRecorded: defaultModelRaw !== null,
    modelPreference,
  });
}

/**
 * PUT /api/settings/chat
 * Save chat settings. Both `defaultModel` and `modelPreference` are
 * independently editable — either may be sent on its own.
 *
 * `modelPreference` accepts the four enum values plus null (which records the
 * "user was prompted but skipped" marker so the modal does not re-appear).
 */
export async function PUT(req: NextRequest) {
  const body = (await req.json()) as {
    defaultModel?: unknown;
    modelPreference?: unknown;
  };

  if (body.defaultModel !== undefined) {
    if (typeof body.defaultModel !== "string") {
      return NextResponse.json(
        { error: "defaultModel must be a string" },
        { status: 400 }
      );
    }
    const validStaticModel = CHAT_MODELS.some((m) => m.id === body.defaultModel);
    const validOllamaModel = body.defaultModel.startsWith("ollama:");
    const validCompatibleModel =
      body.defaultModel.startsWith("litellm:") ||
      body.defaultModel.startsWith("lmstudio:");
    if (!validStaticModel && !validOllamaModel && !validCompatibleModel) {
      return NextResponse.json(
        {
          error: `Invalid model. Must be one of: ${CHAT_MODELS.map((m) => m.id).join(", ")} or a namespaced ollama:*, litellm:*, or lmstudio:* id`,
        },
        { status: 400 }
      );
    }
    await setSetting(DEFAULT_MODEL_KEY, body.defaultModel);
  }

  if ("modelPreference" in body) {
    const raw = body.modelPreference;
    if (raw === null) {
      await setModelPreference(null);
    } else if (isValidModelPreference(raw)) {
      await setModelPreference(raw as ModelPreference);
    } else {
      return NextResponse.json(
        {
          error: `Invalid modelPreference. Must be null or one of: ${MODEL_PREFERENCE_VALUES.join(", ")}`,
        },
        { status: 400 }
      );
    }
  }

  const [defaultModelRaw, modelPreference] = await Promise.all([
    getSetting(DEFAULT_MODEL_KEY),
    getModelPreference(),
  ]);
  return NextResponse.json({
    defaultModel: defaultModelRaw ?? DEFAULT_CHAT_MODEL,
    defaultModelRecorded: defaultModelRaw !== null,
    modelPreference,
  });
}
