import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TelemetryRail } from "../telemetry-rail";
import type { TelemetrySnapshot } from "../telemetry-types";
import * as useTelemetryModule from "../use-telemetry";
import * as useInstanceIdentityModule from "../use-instance-identity";
import type { InstanceIdentityState } from "../use-instance-identity";

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

function stubIdentity(overrides: Partial<InstanceIdentityState> = {}) {
  vi.spyOn(useInstanceIdentityModule, "useInstanceIdentity").mockReturnValue({
    status: "ready",
    version: "0.28.0",
    activeModel: "claude-opus-4-8",
    licenseTag: { kind: "community" },
    ...overrides,
  } as InstanceIdentityState);
}

// The rail now reads BOTH hooks; default the identity stub for every test so a
// real fetch never fires. Individual tests override as needed.
beforeEach(() => {
  stubIdentity();
});

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

describe("TelemetryRail runtime cell (FEAT-10)", () => {
  it("leads the RUNTIME cell with the active model, provider + sdk in the sub", () => {
    stubIdentity({ activeModel: "claude-opus-4-8" });
    stubTelemetry(
      snapshot({ runtimeLabel: "Claude Code", providerId: "anthropic", runtimeSdkVersion: "0.60.0" }),
    );
    render(<TelemetryRail />);

    // Model is the value; provider · sdk fold into the sub-line.
    expect(screen.getByText("claude-opus-4-8")).toBeInTheDocument();
    expect(screen.getByText("anthropic · sdk 0.60.0")).toBeInTheDocument();
  });

  it("falls back to the runtime label when the model has not resolved (never blank)", () => {
    stubIdentity({ activeModel: null });
    stubTelemetry(snapshot({ runtimeLabel: "Claude Code", providerId: "anthropic" }));
    render(<TelemetryRail />);

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });
});
