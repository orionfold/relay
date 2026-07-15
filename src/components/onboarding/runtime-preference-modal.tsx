"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, DollarSign, Lock, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type RuntimePreference = "quality" | "cost" | "privacy" | "balanced";

interface PreferenceOption {
  id: RuntimePreference;
  label: string;
  capabilityNote: string;
  recommendedModel: string;
  icon: LucideIcon;
}

/**
 * Static preference catalog. Capability notes summarize what each runtime
 * choice means for the user — sourced from the runtime capability matrix
 * (`src/lib/agents/runtime/catalog.ts` → RuntimeFeatures), but kept inline
 * because the preference set is fixed at four choices and rotating individual
 * notes is rare. If runtime capabilities change materially, update these
 * notes alongside the matrix.
 *
 * Recommended models map to CHAT_MODELS short-name IDs (haiku/sonnet/opus
 * for Anthropic) so the SDK accepts them directly. The privacy option
 * resolves at runtime against the discovered Ollama list.
 */
const STATIC_OPTIONS: readonly PreferenceOption[] = [
  {
    id: "quality",
    label: "Best quality",
    capabilityNote:
      "Our smartest model (Opus). It can use every tool and read files. Costs the most.",
    recommendedModel: "opus",
    icon: Sparkles,
  },
  {
    id: "balanced",
    label: "Balanced (recommended)",
    capabilityNote:
      "Great quality for less (Sonnet). It can do everything Opus can.",
    recommendedModel: "sonnet",
    icon: Scale,
  },
  {
    id: "cost",
    label: "Lowest cost",
    capabilityNote:
      "Our fastest, cheapest model (Haiku). It uses the same tools as Sonnet.",
    recommendedModel: "haiku",
    icon: DollarSign,
  },
  {
    id: "privacy",
    label: "Privacy-focused (verify endpoint)",
    capabilityNote:
      "Uses your configured Ollama endpoint. Choose a local endpoint and verify its network path before relying on it for sensitive data.",
    recommendedModel: "", // resolved against the Ollama discovery list at submit time
    icon: Lock,
  },
];

const BALANCED_FALLBACK_MODEL = "sonnet";

interface OllamaModelEntry {
  name: string;
}

interface RuntimePreferenceModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Override for the discovery fetch — used by tests to bypass /api/runtimes/ollama.
   * Production callers omit this and rely on the default.
   */
  fetchOllamaModels?: () => Promise<OllamaModelEntry[]>;
  /**
   * Override for the persistence call — used by tests. Production callers
   * omit this and the modal PUTs to /api/settings/chat.
   */
  persistChoice?: (input: {
    preference: RuntimePreference | null;
    defaultModel: string;
  }) => Promise<void>;
}

async function defaultFetchOllamaModels(): Promise<OllamaModelEntry[]> {
  try {
    const res = await fetch("/api/runtimes/ollama");
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: OllamaModelEntry[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

/** The onboarding preference PUT failed — the choice was NOT saved. */
export class PreferencePersistError extends Error {
  constructor(status: number) {
    super(`Saving your model choice failed (HTTP ${status}).`);
    this.name = "PreferencePersistError";
  }
}

async function defaultPersistChoice(input: {
  preference: RuntimePreference | null;
  defaultModel: string;
}): Promise<void> {
  // keepalive: a fast route change or page unload aborts ordinary in-flight
  // fetches, silently dropping the preference (#22). With keepalive the
  // browser completes the request even if the user navigates mid-save.
  const res = await fetch("/api/settings/chat", {
    method: "PUT",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      defaultModel: input.defaultModel,
      modelPreference: input.preference,
    }),
  });
  if (!res.ok) throw new PreferencePersistError(res.status);
  // Notify other surfaces (chat session provider, settings cascade) that the
  // default model has changed. Same event the providers-runtimes-section
  // already uses. Only after a confirmed save — announcing a failed write
  // would desync those surfaces from the DB.
  window.dispatchEvent(
    new CustomEvent("ainative.chat.default-model-changed", {
      detail: { modelId: input.defaultModel },
    })
  );
}

export function RuntimePreferenceModal({
  open,
  onClose,
  fetchOllamaModels = defaultFetchOllamaModels,
  persistChoice = defaultPersistChoice,
}: RuntimePreferenceModalProps) {
  const [selected, setSelected] = useState<RuntimePreference>("balanced");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [privacyFallbackNote, setPrivacyFallbackNote] = useState<string | null>(
    null
  );

  async function resolveModelForPreference(
    pref: RuntimePreference
  ): Promise<{ modelId: string; fallbackNote: string | null }> {
    if (pref !== "privacy") {
      const opt = STATIC_OPTIONS.find((o) => o.id === pref);
      return { modelId: opt!.recommendedModel, fallbackNote: null };
    }
    const models = await fetchOllamaModels();
    if (models.length === 0) {
      return {
        modelId: BALANCED_FALLBACK_MODEL,
        fallbackNote:
          "We could not find an Ollama model. We will use the balanced model for now. Configure and verify your Ollama endpoint in Settings to use your own.",
      };
    }
    return {
      modelId: `ollama:${models[0].name}`,
      fallbackNote: null,
    };
  }

  const handleConfirm = async () => {
    setSubmitting(true);
    setSaveError(null);
    setPrivacyFallbackNote(null);
    try {
      const { modelId, fallbackNote } =
        await resolveModelForPreference(selected);
      // Persist the user's *stated* preference even when the privacy
      // fallback hits. The model column carries the working default
      // (balanced/sonnet) so chat works immediately, while the preference
      // column preserves user intent — Settings will show "Best privacy"
      // alongside "Sonnet", making the mismatch (and remediation) visible.
      await persistChoice({
        preference: selected,
        defaultModel: modelId,
      });
      if (fallbackNote) {
        // Show the fallback note inline; user must dismiss before the modal
        // closes so the message isn't missed.
        setPrivacyFallbackNote(fallbackNote);
        return;
      }
      onClose();
    } catch {
      // A failed save must stay visible and retryable — closing here would
      // silently drop the user's choice (#22).
      setSaveError("Couldn't save your choice. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setSubmitting(true);
    setSaveError(null);
    try {
      await persistChoice({
        preference: null,
        defaultModel: BALANCED_FALLBACK_MODEL,
      });
      onClose();
    } catch {
      setSaveError("Couldn't save your choice. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismissFallbackNote = () => {
    setPrivacyFallbackNote(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Refuse to close on outside-click / Escape — user must pick or skip.
        // (This satisfies the "Modal does not re-appear" AC by ensuring the
        // exit always writes a setting.)
        if (!nextOpen) return;
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        // Hide the default close button — exit must go through Confirm or Skip.
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Pick your default chat model</DialogTitle>
          <DialogDescription>
            Tell us what matters most and we will set a good default. You can
            change it anytime in Settings.
          </DialogDescription>
        </DialogHeader>

        {privacyFallbackNote ? (
          <div className="space-y-3 px-6 pb-2">
            <p className="text-sm text-muted-foreground">
              {privacyFallbackNote}
            </p>
          </div>
        ) : (
          <div className="px-6 pb-2">
            <RadioGroup
              value={selected}
              onValueChange={(v) => setSelected(v as RuntimePreference)}
              className="gap-3"
            >
              {STATIC_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <Label
                    key={opt.id}
                    htmlFor={`pref-${opt.id}`}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/30"
                  >
                    <RadioGroupItem
                      value={opt.id}
                      id={`pref-${opt.id}`}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4" />
                        {opt.label}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {opt.capabilityNote}
                      </p>
                    </div>
                  </Label>
                );
              })}
            </RadioGroup>
          </div>
        )}

        {saveError && (
          <p role="alert" className="px-6 text-sm text-destructive">
            {saveError}
          </p>
        )}

        <DialogFooter className="px-6">
          {privacyFallbackNote ? (
            <Button onClick={handleDismissFallbackNote}>Got it</Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={submitting}
              >
                Skip, use default
              </Button>
              <Button onClick={handleConfirm} disabled={submitting}>
                {submitting ? "Saving…" : "Continue"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
