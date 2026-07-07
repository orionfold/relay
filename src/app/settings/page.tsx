import type { ReactNode } from "react";
import { ProvidersAndRuntimesSection } from "@/components/settings/providers-runtimes-section";
import { PermissionsSections } from "@/components/settings/permissions-sections";
import { DataManagementSection } from "@/components/settings/data-management-section";
import { DatabaseSnapshotsSection } from "@/components/settings/database-snapshots-section";
import { BudgetGuardrailsSection } from "@/components/settings/budget-guardrails-section";
import { ChatSettingsSection } from "@/components/settings/chat-settings-section";
import { RuntimeTimeoutSection } from "@/components/settings/runtime-timeout-section";
import { BrowserToolsSection } from "@/components/settings/browser-tools-section";
import { WebSearchSection } from "@/components/settings/web-search-section";
import { EnvironmentSection } from "@/components/settings/environment-section";
import { LearningContextSection } from "@/components/settings/learning-context-section";
import { OllamaSection } from "@/components/settings/ollama-section";
import { ChannelsSection } from "@/components/settings/channels-section";
import { InstanceSection } from "@/components/instance/instance-section";
import { LicenseSection } from "@/components/settings/license-section";
import { SettingsHashFocus } from "@/components/settings/settings-hash-focus";
import { PageShell } from "@/components/shared/page-shell";
import { isDataOpsAllowed } from "@/lib/data/staging-gate";

export const dynamic = "force-dynamic";

function SettingsAnchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      tabIndex={-1}
      className="scroll-mt-[calc(var(--chrome-glance-top)+2rem)] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const dataOpsAllowed = isDataOpsAllowed();
  return (
    <PageShell
      title="Settings"
      description="Manage your Orionfold Relay configuration"
    >
      <SettingsHashFocus />
      <div className="space-y-6">
        <SettingsAnchor id="settings-instance">
          <InstanceSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-license">
          <LicenseSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-providers">
          <ProvidersAndRuntimesSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-ollama-section">
          <OllamaSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-chat-section">
          <ChatSettingsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-runtime">
          <RuntimeTimeoutSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-learning">
          <LearningContextSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-web-search">
          <WebSearchSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-environment">
          <EnvironmentSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-browser-tools">
          <BrowserToolsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-channels">
          <ChannelsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-budget">
          <BudgetGuardrailsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-permissions">
          <PermissionsSections />
        </SettingsAnchor>
        <SettingsAnchor id="settings-snapshots">
          <DatabaseSnapshotsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-data">
          <DataManagementSection allowed={dataOpsAllowed} />
        </SettingsAnchor>
      </div>
    </PageShell>
  );
}
