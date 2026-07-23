"use client";

import { ProviderSetupCard } from "@/components/settings/provider-setup-card";

export function OpenAICompatibleSection({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <section className="space-y-4" aria-labelledby="openai-compatible-heading">
      <div>
        <h2 id="openai-compatible-heading" className="text-base font-medium">
          OpenAI-compatible servers
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Relay preserves each runtime identity across Chat, tasks, workflows,
          schedules, and usage receipts.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ProviderSetupCard runtimeId="litellm" compact={compact} />
        <ProviderSetupCard runtimeId="lmstudio" compact={compact} />
      </div>
    </section>
  );
}
