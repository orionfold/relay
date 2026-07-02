import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TelemetryRail } from "../telemetry-rail";
import type { TelemetrySnapshot } from "../telemetry-types";
import * as useTelemetryModule from "../use-telemetry";

// The SPEND cells must render real metered ledger sums — never the plan price
// or budget cap as a value (fix-dashboard-budget-vs-cost-labeling). The plan /
// budget context belongs in the sub-line, named as what it is.

function snapshot(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  return {
    tasksRunning: 0,
    tasksFailed: 0,
    completedToday: 0,
    activeProjects: 0,
    activeWorkflows: 0,
    reviewPending: 0,
    costTodayMicros: 0,
    costToDateMicros: 0,
    budgetMonthlyCapMicros: null,
    planPricedMonthlyMicros: null,
    runtimeLabel: "Claude Code",
    providerId: "anthropic",
    runtimeSdkVersion: null,
    trends: { agentActivity24h: [], completions7d: [], failures7d: [] },
    host: {
      cwd: "/tmp/x",
      folderName: "x",
      branch: null,
      cpuLoadPct: null,
      memUsedPct: null,
    },
    ...overrides,
  };
}

function stubTelemetry(data: TelemetrySnapshot | null) {
  vi.spyOn(useTelemetryModule, "useTelemetry").mockReturnValue(
    data
      ? { status: "ready", data, error: null }
      : { status: "loading", data: null, error: null },
  );
}

describe("TelemetryRail spend cells", () => {
  it("shows $0.00 metered spend on a fresh subscription-billed instance, with the plan named in the sub-line", () => {
    stubTelemetry(snapshot({ planPricedMonthlyMicros: 20_000_000 }));
    render(<TelemetryRail />);

    expect(screen.getByText("Spend Today")).toBeInTheDocument();
    expect(screen.getByText("Spend To Date")).toBeInTheDocument();
    // Two spend cells, both $0.00 — the $20 plan price is NOT spend.
    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.queryByText("$20.00")).not.toBeInTheDocument();
    expect(screen.getByText("+ plan $20.00/mo")).toBeInTheDocument();
  });

  it("labels the budget cap as budget in the sub-line under usage billing", () => {
    stubTelemetry(snapshot({
        costToDateMicros: 1_230_000,
        budgetMonthlyCapMicros: 20_000_000,
      }));
    render(<TelemetryRail />);

    expect(screen.getByText("$1.23")).toBeInTheDocument();
    expect(screen.getByText("of $20.00 budget")).toBeInTheDocument();
  });

  it("never fabricates 'not configured' while the snapshot is loading", () => {
    stubTelemetry(null);
    render(<TelemetryRail />);

    expect(screen.queryByText("not configured")).not.toBeInTheDocument();
  });
});
