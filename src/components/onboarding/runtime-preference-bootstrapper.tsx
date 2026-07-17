"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RuntimePreferenceModal } from "./runtime-preference-modal";

const PROMPT_IMPRESSION_WRITE_FAILED =
  "MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED";

interface PromptClaimResponse {
  claimed?: boolean;
  error?: string;
  message?: string;
}

/** The server could not durably claim this instance's one prompt impression. */
export class PromptImpressionClaimError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PromptImpressionClaimError";
    this.code = code;
  }
}

async function defaultClaimPromptImpression(): Promise<boolean> {
  const response = await fetch(
    "/api/settings/chat/model-prompt-impression",
    { method: "POST" }
  );
  const data = (await response.json().catch(() => null)) as PromptClaimResponse | null;
  if (!response.ok) {
    throw new PromptImpressionClaimError(
      data?.error ?? PROMPT_IMPRESSION_WRITE_FAILED,
      data?.message ??
        "Relay could not record the default-model prompt. Choose a model in Settings after storage is available."
    );
  }
  return data?.claimed === true;
}

/**
 * First-launch trigger for the runtime preference modal.
 *
 * Mounted in the root layout so it runs on every page load. The server
 * atomically claims the single automatic prompt impression before this client
 * opens the modal. Because that marker lives in the settings DB under
 * RELAY_DATA_DIR, closing the browser mid-prompt, reloading, starting another
 * browser, or restarting Relay cannot make the prompt recur.
 */
export function RuntimePreferenceBootstrapper({
  claimPromptImpression = defaultClaimPromptImpression,
}: {
  claimPromptImpression?: () => Promise<boolean>;
} = {}) {
  const [open, setOpen] = useState(false);
  const claimPromise = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    // React Strict Mode replays effect setup/cleanup in development. Keep the
    // single in-flight promise attached to this component instance. Each setup
    // observes that same result, while its cleanup still prevents state/toast
    // updates after a real unmount.
    let active = true;
    claimPromise.current ??= claimPromptImpression();

    claimPromise.current
      .then((claimed) => {
        if (active && claimed) setOpen(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const code =
          error instanceof PromptImpressionClaimError
            ? error.code
            : PROMPT_IMPRESSION_WRITE_FAILED;
        const message =
          error instanceof Error
            ? error.message
            : "Relay could not record the default-model prompt. Choose a model in Settings after storage is available.";
        toast.error("Default-model setup could not start", {
          id: "default-model-prompt-impression-failed",
          description: `${code}: ${message}`,
          duration: 15_000,
        });
      });
    return () => {
      active = false;
    };
  }, [claimPromptImpression]);

  if (!open) return null;
  return <RuntimePreferenceModal open={open} onClose={() => setOpen(false)} />;
}
