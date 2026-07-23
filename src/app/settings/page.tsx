import type { ReactNode } from "react";
import { ProvidersAndRuntimesSection } from "@/components/settings/providers-runtimes-section";
import { PermissionsSections } from "@/components/settings/permissions-sections";
import { DataManagementSection } from "@/components/settings/data-management-section";
import { DatabaseSnapshotsSection } from "@/components/settings/database-snapshots-section";
import { RecoverySection } from "@/components/settings/recovery-section";
import { BudgetGuardrailsSection } from "@/components/settings/budget-guardrails-section";
import { ChatSettingsSection } from "@/components/settings/chat-settings-section";
import { RuntimeTimeoutSection } from "@/components/settings/runtime-timeout-section";
import { BrowserToolsSection } from "@/components/settings/browser-tools-section";
import { WebSearchSection } from "@/components/settings/web-search-section";
import { EnvironmentSection } from "@/components/settings/environment-section";
import { LearningContextSection } from "@/components/settings/learning-context-section";
import { OllamaSection } from "@/components/settings/ollama-section";
import { OpenAICompatibleSection } from "@/components/settings/openai-compatible-section";
import { ChannelsSection } from "@/components/settings/channels-section";
import { GitHubSection } from "@/components/settings/github-section";
import { InstanceSection } from "@/components/instance/instance-section";
import { LicenseSection } from "@/components/settings/license-section";
import { SettingsHashFocus } from "@/components/settings/settings-hash-focus";
import { AppViewDiagnosticsSection } from "@/components/settings/app-view-diagnostics-section";
import { DashboardSection } from "@/components/settings/dashboard-section";
import { PageShell } from "@/components/shared/page-shell";
import { isDataOpsAllowed } from "@/lib/data/staging-gate";
import { AccessSection } from "@/components/settings/access-section";
import { HostDeploymentSection } from "@/components/settings/host-deployment-section";
import { loadCustomerOrientation } from "@/lib/onboarding/load-orientation";

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
  const orientation = loadCustomerOrientation();
  return (
    <PageShell
      title="Settings"
      description="Manage your Orionfold Relay configuration"
    >
      <SettingsHashFocus />
      <div className="space-y-6">
        <SettingsAnchor id="settings-access">
          <AccessSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-instance">
          <InstanceSection orientation={orientation} />
        </SettingsAnchor>
        <SettingsAnchor id="settings-license">
          <LicenseSection orientation={orientation} />
        </SettingsAnchor>
        <SettingsAnchor id="settings-host-deployment">
          <HostDeploymentSection orientation={orientation} />
        </SettingsAnchor>
        <SettingsAnchor id="settings-providers">
          <section
            className="space-y-4"
            aria-labelledby="provider-setup-heading"
          >
            <div>
              <h2 id="provider-setup-heading" className="text-base font-medium">
                Connect AI providers
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Save and verify at least one provider, then choose how Relay
                routes work across the runtimes that are actually ready.
              </p>
            </div>
            <div
              id="settings-ollama-section"
              tabIndex={-1}
              className="scroll-mt-[calc(var(--chrome-glance-top)+2rem)] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <OllamaSection compact />
            </div>
          </section>
        </SettingsAnchor>
        <SettingsAnchor id="settings-openai-compatible">
          <OpenAICompatibleSection compact />
        </SettingsAnchor>
        <SettingsAnchor id="settings-provider-routing">
          <ProvidersAndRuntimesSection />
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
        <SettingsAnchor id="settings-app-authoring">
          <AppViewDiagnosticsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-dashboard">
          <DashboardSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-browser-tools">
          <BrowserToolsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-channels">
          <ChannelsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-github">
          <GitHubSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-budget">
          <BudgetGuardrailsSection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-permissions">
          <PermissionsSections />
        </SettingsAnchor>
        <SettingsAnchor id="settings-snapshots">
          <DatabaseSnapshotsSection />
          <RecoverySection />
        </SettingsAnchor>
        <SettingsAnchor id="settings-data">
          <DataManagementSection allowed={dataOpsAllowed} />
        </SettingsAnchor>
      </div>
    </PageShell>
  );
}
