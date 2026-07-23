import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RuntimeReadinessStatus } from "../runtime-readiness-status";
import * as glanceModule from "../use-settings-glance";
import type { SettingsGlanceState } from "../use-settings-glance";

function renderStatus(state: SettingsGlanceState) {
  vi.spyOn(glanceModule, "useSettingsGlance").mockReturnValue(state);
  return render(
    <TooltipProvider>
      <RuntimeReadinessStatus />
    </TooltipProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RuntimeReadinessStatus", () => {
  it("shows a named healthy local runtime and links to provider settings", () => {
    renderStatus({
      status: "ready",
      data: {
        runtimeReadiness: {
          state: "ready",
          label: "Ollama ready",
          detail: "Ollama is verified and eligible for routed work.",
          readyRuntimeLabels: ["Ollama"],
          attentionRuntimeLabels: [],
        },
      } as never,
    });

    expect(screen.getByText("Ollama ready")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Ollama ready. Open Providers and runtimes settings",
      }),
    ).toHaveAttribute("href", "/settings#settings-providers");
    expect(screen.queryByText(/API Disconnected|Disconnected/)).not.toBeInTheDocument();
  });

  it.each([
    ["degraded", "Ollama unavailable"],
    ["setup-needed", "Setup needed"],
  ] as const)("renders the %s state without generic API language", (state, label) => {
    renderStatus({
      status: "ready",
      data: {
        runtimeReadiness: {
          state,
          label,
          detail: "Evidence-backed runtime detail.",
          readyRuntimeLabels: [],
          attentionRuntimeLabels: state === "degraded" ? ["Ollama"] : [],
        },
      } as never,
    });

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(/API Connected|API Disconnected/)).not.toBeInTheDocument();
  });

  it("shows checking before the first authoritative observation", () => {
    renderStatus({ status: "loading", data: null });
    expect(screen.getByText("Checking runtimes")).toBeInTheDocument();
  });

  it("retains the last authoritative observation across a refresh error", () => {
    renderStatus({
      status: "error",
      data: {
        runtimeReadiness: {
          state: "ready",
          label: "LM Studio ready",
          detail: "LM Studio is verified and eligible for routed work.",
          readyRuntimeLabels: ["LM Studio"],
          attentionRuntimeLabels: [],
        },
      } as never,
      error: "temporary fetch failure",
    });
    expect(screen.getByText("LM Studio ready")).toBeInTheDocument();
  });
});
