"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, type ChatModelOption } from "@/lib/chat/types";
import { FormSectionCard } from "@/components/shared/form-section-card";
import { MessageCircle, Compass } from "lucide-react";

type ModelPreference = "quality" | "cost" | "privacy" | "balanced";

const MODEL_PREFERENCE_OPTIONS: Array<{
  value: ModelPreference | "none";
  label: string;
  hint: string;
}> = [
  { value: "none", label: "Not set", hint: "No stated preference recorded." },
  {
    value: "quality",
    label: "Best quality",
    hint: "Top-tier cloud models (Opus / GPT-5.4).",
  },
  {
    value: "balanced",
    label: "Balanced",
    hint: "Strong quality at moderate cost (Sonnet).",
  },
  {
    value: "cost",
    label: "Lowest cost",
    hint: "Fastest, cheapest cloud (Haiku / GPT-5.4 Mini).",
  },
  {
    value: "privacy",
    label: "Best privacy",
    hint: "Use Ollama after verifying that its configured endpoint meets your privacy requirements.",
  },
];

export function ChatSettingsSection() {
  const [defaultModel, setDefaultModel] = useState(DEFAULT_CHAT_MODEL);
  const [modelPreference, setModelPreference] = useState<
    ModelPreference | "none"
  >("none");
  const [ollamaModels, setOllamaModels] = useState<ChatModelOption[]>([]);
  const [compatibleModels, setCompatibleModels] = useState<ChatModelOption[]>([]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/chat");
      if (res.ok) {
        const data = await res.json();
        setDefaultModel(data.defaultModel ?? DEFAULT_CHAT_MODEL);
        setModelPreference(
          (data.modelPreference as ModelPreference | null) ?? "none"
        );
      }
    } catch {
      // Use default
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    // Fetch Ollama models for the dropdown
    fetch("/api/runtimes/ollama")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((data: { models?: Array<{ name: string }> }) => {
        setOllamaModels(
          (data.models ?? []).map((m) => ({
            id: `ollama:${m.name}`,
            label: m.name.replace(/:latest$/, ""),
            provider: "ollama" as const,
            tier: "Configured endpoint",
            costLabel: "Cost varies",
          }))
        );
      })
      .catch(() => {});
    fetch("/api/chat/models")
      .then((r) => (r.ok ? r.json() : []))
      .then((models: ChatModelOption[]) => {
        setCompatibleModels(
          models.filter(
            (model) =>
              model.provider === "litellm" || model.provider === "lmstudio"
          )
        );
      })
      .catch(() => {});
  }, [fetchSettings]);

  // Stay in sync with explicit default-model changes from onboarding and Chat.
  // Task routing policy deliberately does not mutate the Chat default.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ modelId?: string }>).detail;
      if (detail?.modelId) {
        setDefaultModel(detail.modelId);
      }
    };
    window.addEventListener("ainative.chat.default-model-changed", handler);
    return () => {
      window.removeEventListener("ainative.chat.default-model-changed", handler);
    };
  }, []);

  const handleModelChange = async (modelId: string) => {
    setDefaultModel(modelId);
    await fetch("/api/settings/chat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel: modelId }),
    });
  };

  const handlePreferenceChange = async (value: ModelPreference | "none") => {
    setModelPreference(value);
    await fetch("/api/settings/chat", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // null clears the preference; the route persists an empty-string
      // marker so the onboarding modal does not re-prompt.
      body: JSON.stringify({
        modelPreference: value === "none" ? null : value,
      }),
    });
  };

  const anthropicModels = CHAT_MODELS.filter(
    (m) => m.provider === "anthropic"
  );
  const openaiModels = CHAT_MODELS.filter((m) => m.provider === "openai");
  const liteLLMModels = compatibleModels.filter((m) => m.provider === "litellm");
  const lmStudioModels = compatibleModels.filter((m) => m.provider === "lmstudio");

  return (
    <Card id="settings-chat" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <CardDescription>
          Configure defaults for the chat conversation interface.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormSectionCard
          icon={Compass}
          title="Model preference"
          hint="What matters most to you? Drives the recommended default and re-resolves sensibly when new models are released."
        >
          <Select
            value={modelPreference}
            onValueChange={(v) =>
              handlePreferenceChange(v as ModelPreference | "none")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_PREFERENCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label} — {opt.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormSectionCard>

        <FormSectionCard
          icon={MessageCircle}
          title="Default Model"
          hint="Model used for new chat conversations. Can be overridden per conversation."
        >
          <Select value={defaultModel} onValueChange={handleModelChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Anthropic</SelectLabel>
                {anthropicModels.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label} — {m.tier} ({m.costLabel})
                  </SelectItem>
                ))}
              </SelectGroup>
              {openaiModels.length > 0 && (
                <SelectGroup>
                  <SelectLabel>OpenAI</SelectLabel>
                  {openaiModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} — {m.tier} ({m.costLabel})
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {ollamaModels.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Ollama</SelectLabel>
                  {ollamaModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} — {m.tier} ({m.costLabel})
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {liteLLMModels.length > 0 && (
                <SelectGroup>
                  <SelectLabel>LiteLLM gateway</SelectLabel>
                  {liteLLMModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} — {m.tier} ({m.costLabel})
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {lmStudioModels.length > 0 && (
                <SelectGroup>
                  <SelectLabel>LM Studio server</SelectLabel>
                  {lmStudioModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} — {m.tier} ({m.costLabel})
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </FormSectionCard>
      </CardContent>
    </Card>
  );
}
