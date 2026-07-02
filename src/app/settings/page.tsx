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
import { PageShell } from "@/components/shared/page-shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      description="Manage your Orionfold Relay configuration"
    >
      <div className="space-y-6">
        <InstanceSection />
        <LicenseSection />
        <ProvidersAndRuntimesSection />
        <OllamaSection />
        <ChatSettingsSection />
        <RuntimeTimeoutSection />
        <LearningContextSection />
        <WebSearchSection />
        <EnvironmentSection />
        <BrowserToolsSection />
        <ChannelsSection />
        <BudgetGuardrailsSection />
        <PermissionsSections />
        <DatabaseSnapshotsSection />
        <DataManagementSection />
      </div>
    </PageShell>
  );
}
