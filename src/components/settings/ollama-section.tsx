"use client";

import { ProviderSetupCard } from "@/components/settings/provider-setup-card";

export function OllamaSection({ compact = false }: { compact?: boolean }) {
  return <ProviderSetupCard runtimeId="ollama" compact={compact} />;
}
