import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BarIdentityCluster } from "../bar-identity-cluster";
import * as useInstanceIdentityModule from "../use-instance-identity";
import type { InstanceIdentityState } from "../use-instance-identity";

// The bar identity cluster is the bar-side half of the rail-vs-bar split. These
// tests pin its shadow-path discipline: never a wrong version, never a dangling
// "Licensed to ", and the auth dot survives an identity fetch error.

function stub(state: InstanceIdentityState) {
  vi.spyOn(useInstanceIdentityModule, "useInstanceIdentity").mockReturnValue(state);
}

// The nested AuthStatusDot uses a Radix Tooltip → needs a provider, which the
// app root supplies (layout.tsx).
function render(ui: ReactElement) {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("BarIdentityCluster", () => {
  it("renders the version pill and the licensed org label when ready", () => {
    stub({
      status: "ready",
      version: "0.28.0",
      activeModel: "claude-opus-4-8",
      licenseTag: { kind: "licensed", label: "Acme Corp" },
    });
    render(<BarIdentityCluster />);

    expect(screen.getByText("v0.28.0")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
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

  it("still renders the auth dot when identity errored (independent poll)", () => {
    stub({
      status: "error",
      version: null,
      activeModel: null,
      licenseTag: null,
      error: "boom",
    });
    const { container } = render(<BarIdentityCluster />);

    // The AuthStatusDot renders a colored dot regardless of identity state.
    expect(container.querySelector("span.rounded-full")).not.toBeNull();
  });
});
