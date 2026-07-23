import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BarIdentityCluster } from "../bar-identity-cluster";
import * as useInstanceIdentityModule from "../use-instance-identity";
import type { InstanceIdentityState } from "../use-instance-identity";
import type { CustomerOrientation } from "@/lib/onboarding/orientation";

// The bar identity cluster is the bar-side half of the rail-vs-bar split. These
// tests pin its shadow-path discipline: never a wrong version, never a dangling
// "Licensed to ", and runtime readiness survives an identity fetch error.

vi.mock("../use-settings-glance", () => ({
  useSettingsGlance: () => ({
    status: "ready",
    data: {
      runtimeReadiness: {
        state: "ready",
        label: "Ollama ready",
        detail: "Ollama is verified and eligible for routed work.",
        readyRuntimeLabels: ["Ollama"],
        attentionRuntimeLabels: [],
      },
    },
  }),
}));

function stub(state: InstanceIdentityState) {
  vi.spyOn(useInstanceIdentityModule, "useInstanceIdentity").mockReturnValue(state);
}

// The nested runtime status uses a Radix Tooltip → needs a provider, which the
// app root supplies (layout.tsx).
function render(ui: ReactElement) {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

const packsOrientation: CustomerOrientation = {
  edition: "licensed",
  license: {
    lifecycle: "active",
    licensee: "Acme Corp",
    detail: "Active.",
    expiresAt: "2027-07-01T00:00:00.000Z",
  },
  entitlements: { packs: true, host: false },
  packs: { premium: "unlocked", agency: "available", readError: null },
  host: {
    state: "preview",
    managedCellsLimit: null,
    detail: "Optional.",
  },
  headline: "Premium Packs are unlocked",
  description: "Choose Packs.",
  entitlementLabel: "Premium Packs",
  primaryAction: {
    kind: "link",
    label: "Choose Packs",
    href: "/packs",
  },
  secondaryActions: [],
};

describe("BarIdentityCluster", () => {
  it("renders version, licensee identity, and entitlement as separate signals", () => {
    stub({
      status: "ready",
      version: "0.28.0",
      activeModel: "claude-opus-4-8",
      licenseTag: { kind: "licensed", label: "Acme Corp" },
      orientation: packsOrientation,
    });
    render(<BarIdentityCluster />);

    expect(screen.getByText("v0.28.0")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Premium Packs")).toBeInTheDocument();
  });

  it("omits the version pill entirely when version is null (absent > wrong)", () => {
    stub({
      status: "ready",
      version: null,
      activeModel: "claude-opus-4-8",
      licenseTag: { kind: "community" },
    });
    render(<BarIdentityCluster />);

    expect(screen.queryByText(/^v/)).not.toBeInTheDocument();
  });

  it("shows 'Community Edition', never a dangling label, on the community branch", () => {
    stub({
      status: "ready",
      version: "0.28.0",
      activeModel: null,
      licenseTag: { kind: "community" },
    });
    render(<BarIdentityCluster />);

    expect(screen.getByText("Community Edition")).toBeInTheDocument();
    expect(screen.queryByText(/Licensed to\s*$/)).not.toBeInTheDocument();
  });

  it("renders nothing for version/license while loading (no skeleton flash)", () => {
    stub({
      status: "loading",
      version: null,
      activeModel: null,
      licenseTag: null,
    });
    render(<BarIdentityCluster />);

    expect(screen.queryByText(/^v/)).not.toBeInTheDocument();
    expect(screen.queryByText("Community Edition")).not.toBeInTheDocument();
  });

  it("still renders runtime readiness when identity errored (independent poll)", () => {
    stub({
      status: "error",
      version: null,
      activeModel: null,
      licenseTag: null,
      error: "boom",
    });
    const { container } = render(<BarIdentityCluster />);

    expect(screen.getByText("Ollama ready")).toBeInTheDocument();
    expect(container.querySelector("span.rounded-full")).not.toBeNull();
  });
});
