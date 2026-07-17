import { NextResponse } from "next/server";

import {
  claimModelPreferencePromptImpression,
  MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED,
} from "@/lib/settings/helpers";

/**
 * POST /api/settings/chat/model-prompt-impression
 *
 * Atomically grants at most one browser session permission to display the
 * automatic default-model prompt for this Relay data directory.
 */
export async function POST() {
  try {
    const claimed = await claimModelPreferencePromptImpression();
    return NextResponse.json({ claimed });
  } catch (error) {
    console.error(
      `[${MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED}]`,
      error
    );
    return NextResponse.json(
      {
        error: MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED,
        message:
          "Relay could not record the default-model prompt. Choose a model in Settings after storage is available.",
      },
      { status: 500 }
    );
  }
}
